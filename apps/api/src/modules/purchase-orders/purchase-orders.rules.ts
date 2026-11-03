import type { LocalDate, Money } from '@mimark/contracts/common';
import type { PoExtraction } from '@mimark/contracts/extraction';
import type { DraftWarning, PurchaseOrderDraft } from '@mimark/contracts/purchase-orders';
import { AppError } from '../../common/app-error.js';
import { centsToMoney, moneyToCents, numberToCents } from '../../common/money.js';

/** Reglas puras de órdenes de compra. Las fechas son 'AAAA-MM-DD', así que se comparan como texto. */

export function checkIssuedOn(issuedOn: LocalDate, today: LocalDate): void {
  if (issuedOn > today) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { issuedOn: 'La fecha de la OC no puede ser futura' },
    });
  }
}

export function checkReceipt(
  po: { status: 'open' | 'cancelled'; receiptStatus: 'pending' | 'received'; issuedOn: LocalDate },
  receivedOn: LocalDate,
  today: LocalDate,
): void {
  if (po.status === 'cancelled') {
    throw new AppError('INVALID_TRANSITION', 'La OC está cancelada.');
  }
  if (po.receiptStatus === 'received') {
    throw new AppError('INVALID_TRANSITION', 'La recepción ya fue confirmada.');
  }
  if (receivedOn > today) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { receivedOn: 'La fecha de recepción no puede ser futura' },
    });
  }
  if (receivedOn < po.issuedOn) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { receivedOn: 'La recepción no puede ser anterior a la OC' },
    });
  }
}

/** "12.5" con `scale` 3 → 12500n. El texto ya viene validado por los contratos. */
function toScaled(value: string, scale: number): bigint {
  const [whole = '0', frac = ''] = value.trim().split('.');
  return BigInt(whole + frac.padEnd(scale, '0').slice(0, scale));
}

/** round(cantidad × precio, 2), mitad hacia arriba y sin punto flotante: 3 × 1250.50 → "3751.50". */
export function lineAmount(quantity: string, unitPrice: string): Money {
  const product = toScaled(quantity, 3) * toScaled(unitPrice, 4); // escala 1e-7
  const cents = (product + 50_000n) / 100_000n;
  return centsToMoney(Number(cents));
}

export function linesSubtotal(lines: { quantity: string; unitPrice: string }[]): Money {
  const cents = lines.reduce(
    (sum, l) => sum + moneyToCents(lineAmount(l.quantity, l.unitPrice)),
    0,
  );
  return centsToMoney(cents);
}

/** El total es con impuestos: nunca puede quedar por debajo de la suma de las partidas. */
export function checkTotalCoversLines(total: Money, subtotal: Money): void {
  if (moneyToCents(total) < moneyToCents(subtotal)) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { total: 'El total no puede ser menor que la suma de las partidas' },
    });
  }
}

/** Impuestos implícitos (total − partidas); nulo si la OC no tiene partidas. */
export function impliedTaxes(total: Money, lineCount: number, subtotal: Money): Money | null {
  return lineCount === 0 ? null : centsToMoney(moneyToCents(total) - moneyToCents(subtotal));
}

/** El checklist de recepción es todo-o-nada: se marcan exactamente las partidas de la OC. */
export function checkChecklist(lineIds: string[], checkedIds: string[]): void {
  const fail = (message: string) =>
    new AppError('VALIDATION', undefined, { fieldErrors: { checkedLineIds: message } });
  const lines = new Set(lineIds);
  const checked = new Set(checkedIds);
  if (checked.size !== checkedIds.length) throw fail('Hay partidas marcadas dos veces');
  if ([...checked].some((id) => !lines.has(id))) {
    throw fail('Hay partidas que no son de esta OC');
  }
  if (checked.size < lines.size) throw fail('Marca todas las partidas');
}

const LINE_TOLERANCE_CENTS = 1;

/** Convierte lo que leyó la IA en un borrador: números a texto, fechas y monedas válidas o nulas. */
export function normalizePoExtraction(
  extraction: PoExtraction,
): Omit<PurchaseOrderDraft, 'supplier' | 'warnings'> {
  const uncertain = new Set<string>(extraction.uncertainFields);
  const money = (n: number | null) =>
    n === null || !Number.isFinite(n) || n < 0 ? null : centsToMoney(numberToCents(n));
  const decimal = (n: number | null, places: number) =>
    n === null || !Number.isFinite(n) || n < 0 ? null : String(Number(n.toFixed(places)));
  const text = (v: string | null) => (v?.trim() ? v.trim() : null);

  let issuedOn = text(extraction.issuedOn);
  if (issuedOn && !/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) {
    issuedOn = null;
    uncertain.add('issuedOn');
  }
  const taxId = text(extraction.supplierTaxId)?.replace(/\s+/g, '').toUpperCase() ?? null;

  return {
    number: text(extraction.number)?.toUpperCase() ?? null,
    supplierName: text(extraction.supplierName),
    supplierTaxId: taxId,
    issuedOn,
    currency: extraction.currency,
    parlevelRef: text(extraction.parlevelRef),
    lines: extraction.lines.map((l) => ({
      sku: text(l.sku),
      description: text(l.description),
      quantity: decimal(l.quantity, 3),
      unit: text(l.unit),
      unitPrice: decimal(l.unitPrice, 4),
      statedAmount: money(l.amount),
    })),
    subtotal: money(extraction.subtotal),
    taxes: money(extraction.taxes),
    total: money(extraction.total),
    uncertainFields: [...uncertain],
  };
}

/** Avisos que no bloquean: la persona decide al verificar. */
export function buildDraftWarnings(
  draft: Omit<PurchaseOrderDraft, 'warnings' | 'supplier'> & {
    supplier: PurchaseOrderDraft['supplier'];
  },
  numberTaken: boolean,
): DraftWarning[] {
  const warnings: DraftWarning[] = [];
  const warn = (field: string, message: string) => warnings.push({ field, message });

  if (numberTaken) warn('number', 'Ya existe una OC con ese folio');
  if (!draft.supplier) {
    warn('supplierId', 'No hay un proveedor activo con ese RFC: elige el proveedor');
  }
  if (draft.lines.length === 0) warn('lines', 'No se encontraron partidas en el PDF');

  draft.lines.forEach((line, i) => {
    const n = i + 1;
    const missing = (
      [
        ['description', 'la descripción'],
        ['quantity', 'la cantidad'],
        ['unit', 'la unidad'],
        ['unitPrice', 'el precio unitario'],
      ] as const
    ).filter(([key]) => line[key] === null);
    for (const [key, label] of missing) warn(`lines.${i}.${key}`, `Partida ${n}: falta ${label}`);
    if (line.quantity && line.unitPrice && line.statedAmount) {
      const computed = moneyToCents(lineAmount(line.quantity, line.unitPrice));
      if (Math.abs(computed - moneyToCents(line.statedAmount)) > LINE_TOLERANCE_CENTS) {
        warn(
          `lines.${i}.unitPrice`,
          `Partida ${n}: cantidad × precio da ${centsToMoney(computed)} y el PDF dice ${line.statedAmount}`,
        );
      }
    }
  });

  const complete = draft.lines.filter((l) => l.quantity && l.unitPrice) as {
    quantity: string;
    unitPrice: string;
  }[];
  if (draft.subtotal && complete.length === draft.lines.length && complete.length > 0) {
    const sum = moneyToCents(linesSubtotal(complete));
    if (Math.abs(sum - moneyToCents(draft.subtotal)) > LINE_TOLERANCE_CENTS) {
      warn(
        'subtotal',
        `La suma de las partidas (${centsToMoney(sum)}) no coincide con el subtotal del PDF (${draft.subtotal})`,
      );
    }
  }
  return warnings;
}
