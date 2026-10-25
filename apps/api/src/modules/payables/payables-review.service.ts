import { Injectable } from '@nestjs/common';
import type { LocalDate } from '@mimark/contracts/common';
import type {
  CorrectFieldsInput,
  DiscardInput,
  DocumentsInput,
  PayableDto,
  PaymentInput,
  ScheduleInput,
} from '@mimark/contracts/payables';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db, isUniqueViolation, type Tx } from '../../common/db.js';
import { fromDbDate, toLocalDate } from '../../common/dates.js';
import { moneyToCents } from '../../common/money.js';
import { env } from '../../config/env.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { PayableContextLoader } from './payables.context.js';
import { applyCorrection } from './payables.correction.rules.js';
import { toFacts, toFieldValues, toPayableDto } from './payables.dto.js';
import { PayablesRepository, type PayableRow } from './payables.repository.js';
import { evaluatePayable } from './payables.rules.js';
import {
  allowedActions,
  assertTransition,
  checkDocumentsInput,
  type PayableAction,
} from './payables.state.rules.js';
import { checkPayment, checkPayOn, computeSchedule } from './schedule.rules.js';

const NOT_FOUND = () => new AppError('NOT_FOUND', 'No existe ese expediente.');

/**
 * Las acciones de una persona sobre un expediente: corregir, confirmar, programar, pagar, documentos y
 * descartar. Ninguna se dispara sola: el estado solo avanza por aquí. Registrar un pago es solo un registro:
 * el sistema nunca ejecuta transferencias.
 */
@Injectable()
export class PayablesReviewService {
  constructor(
    private readonly db: Db,
    private readonly payables: PayablesRepository,
    private readonly audit: AuditRepository,
    private readonly context: PayableContextLoader,
  ) {}

  async correct(id: string, input: CorrectFieldsInput, ctx: Ctx): Promise<PayableDto> {
    const row = await this.act(id, 'correct');
    const { facts, changes } = applyCorrection(toFacts(row), input);
    // La OC que corrige una persona es la que vale: ya no se compara con la que se eligió al subir.
    const selectedPoNumber = input.poNumber === undefined ? row.selectedPoNumber : facts.poNumber;
    const { context, po, supplier } = await this.context.load({
      facts,
      selectedPoNumber,
      self: row,
    });
    const { status, reasons } = evaluatePayable(facts, context);
    assertTransition(row.status, status);

    await this.db.$transaction(async (tx) => {
      await this.payables.saveCorrection(
        row,
        { ...toFieldValues({ facts, reasons, po, supplier }), status, selectedPoNumber },
        tx,
      );
      await this.log(ctx, id, 'payable.corrected', row.status, status, { changes }, tx);
    });
    return this.get(id);
  }

  async confirm(id: string, ctx: Ctx): Promise<PayableDto> {
    const row = await this.act(id, 'confirm');
    assertTransition(row.status, 'confirmed');

    const facts = toFacts(row);
    const { context, po } = await this.context.load({
      facts,
      selectedPoNumber: row.selectedPoNumber,
      self: row,
    });
    const { status, reasons } = evaluatePayable(facts, context);
    if (status !== 'pending_confirmation' || !po) {
      await this.sendToReview(row, reasons, ctx);
      throw new AppError('REVIEW_REQUIRED', undefined, { details: { reasons } });
    }

    const schedule = computeSchedule(
      fromDbDate(row.invoiceReceivedOn),
      po.supplier.creditDays,
      this.today(),
    );
    const keys = {
      uuidKey: facts.taxUuid,
      folioKey: `${facts.supplierTaxId}|${facts.invoiceNumber}`,
      invoiceDocStatus: facts.docType === 'factura' ? ('received' as const) : ('pending' as const),
      complementStatus: po.supplier.creditDays > 0 ? ('pending' as const) : null,
    };
    try {
      await this.db.$transaction(async (tx) => {
        await this.payables.confirm(row, { ...schedule, ...keys }, tx);
        await this.log(ctx, id, 'payable.confirmed', row.status, 'confirmed', schedule, tx);
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // La base impidió confirmar dos veces la misma factura (por UUID o por RFC + folio).
      await this.sendToReview(row, ['DUPLICATE'], ctx);
      throw new AppError('DUPLICATE_INVOICE');
    }
    return this.get(id);
  }

  async schedule(id: string, input: ScheduleInput, ctx: Ctx): Promise<PayableDto> {
    const row = await this.act(id, 'schedule');
    const dueOn = fromDbDate(row.dueOn!);
    const payOn = input.payOn ?? fromDbDate(row.suggestedPayOn!);
    checkPayOn(payOn, this.today());

    await this.db.$transaction(async (tx) => {
      await this.payables.schedule(row, payOn, tx);
      await this.log(
        ctx,
        id,
        'payable.scheduled',
        row.status,
        'scheduled',
        { payOn, late: payOn > dueOn },
        tx,
      );
    });
    return this.get(id);
  }

  async pay(id: string, input: PaymentInput, ctx: Ctx): Promise<PayableDto> {
    const row = await this.act(id, 'pay');
    checkPayment(
      { amountCents: moneyToCents(input.amount), paidOn: input.paidOn },
      moneyToCents(row.total!.toFixed(2)),
      this.today(),
    );
    const payment = {
      paidOn: input.paidOn,
      amount: row.total!.toFixed(2),
      reference: input.reference,
    };

    await this.db.$transaction(async (tx) => {
      await this.payables.markPaid(row, payment, tx);
      await this.log(ctx, id, 'payable.paid', row.status, 'paid', payment, tx);
    });
    return this.get(id);
  }

  async documents(id: string, input: DocumentsInput, ctx: Ctx): Promise<PayableDto> {
    const row = await this.act(id, 'documents');
    checkDocumentsInput(row, input);
    const changes: Record<string, { from: string | null; to: string }> = {};
    if (input.invoiceDocStatus && input.invoiceDocStatus !== row.invoiceDocStatus) {
      changes.invoiceDocStatus = { from: row.invoiceDocStatus, to: input.invoiceDocStatus };
    }
    if (input.complementStatus && input.complementStatus !== row.complementStatus) {
      changes.complementStatus = { from: row.complementStatus, to: input.complementStatus };
    }
    if (Object.keys(changes).length === 0) return toPayableDto(row, this.today());

    await this.db.$transaction(async (tx) => {
      await this.payables.saveDocuments(row, input, tx);
      await this.log(ctx, id, 'payable.documents', null, null, { changes }, tx);
    });
    return this.get(id);
  }

  async discard(id: string, input: DiscardInput, ctx: Ctx): Promise<PayableDto> {
    const row = await this.act(id, 'discard');
    assertTransition(row.status, 'discarded');

    await this.db.$transaction(async (tx) => {
      await this.payables.discard(row, input.reason, tx);
      await this.log(
        ctx,
        id,
        'payable.discarded',
        row.status,
        'discarded',
        { reason: input.reason },
        tx,
      );
    });
    return this.get(id);
  }

  /** Lee el expediente y comprueba que la acción esté permitida en su estado (la tabla de `allowedActions`). */
  private async act(id: string, action: PayableAction): Promise<PayableRow> {
    const row = await this.payables.findById(id);
    if (!row) throw NOT_FOUND();
    if (!allowedActions(row.status, row.updatedAt, new Date()).includes(action)) {
      throw new AppError('INVALID_TRANSITION');
    }
    return row;
  }

  private async get(id: string): Promise<PayableDto> {
    const row = await this.payables.findById(id);
    if (!row) throw NOT_FOUND();
    return toPayableDto(row, this.today());
  }

  private sendToReview(row: PayableRow, reasons: string[], ctx: Ctx): Promise<void> {
    return this.db.$transaction(async (tx) => {
      await this.payables.markReviewRequired(row, reasons, tx);
      await this.log(
        ctx,
        row.id,
        'payable.review_required',
        row.status,
        'requires_review',
        { reasons },
        tx,
      );
    });
  }

  private log(
    ctx: Ctx,
    id: string,
    action: string,
    fromStatus: string | null,
    toStatus: string | null,
    data: object,
    tx: Tx,
  ): Promise<void> {
    return this.audit.log(
      {
        ...ctx,
        entity: 'payable',
        entityId: id,
        action,
        fromStatus,
        toStatus,
        data,
      },
      tx,
    );
  }

  private today(): LocalDate {
    return toLocalDate(new Date(), env.BUSINESS_TZ);
  }
}
