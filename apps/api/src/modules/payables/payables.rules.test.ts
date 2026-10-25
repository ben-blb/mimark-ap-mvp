import type { Extraction } from '@mimark/contracts/extraction';
import { describe, expect, it } from 'vitest';
import {
  evaluatePayable,
  normalizeExtraction,
  parseReason,
  type Facts,
  type PayableContext,
} from './payables.rules.js';

const raw: Extraction = {
  documentType: 'factura',
  isAccountsPayableDocument: true,
  supplierName: 'Distribuidora Alimentos del Norte SA de CV',
  supplierTaxId: 'DAN010203AB1',
  invoiceNumber: 'A-1001',
  issueDate: '2026-10-06',
  purchaseOrderNumber: 'OC-1001',
  subtotal: 10000,
  taxes: 1600,
  total: 11600,
  currency: 'MXN',
  taxUuid: '6A1F3C52-8B7D-4E19-9C0A-2D5E7F8A9B10',
  missingFields: [],
  uncertainFields: [],
  sourceEvidence: [],
};

describe('normalizeExtraction', () => {
  it('AC-004-13 pasa RFC, UUID, folio y OC a mayúsculas sin espacios', () => {
    const facts = normalizeExtraction({
      ...raw,
      supplierTaxId: ' dan 010203-ab1 ',
      invoiceNumber: ' a 1001 ',
      purchaseOrderNumber: ' oc-1001 ',
      taxUuid: ' 6a1f3c52-8b7d-4e19-9c0a-2d5e7f8a9b10 ',
    });
    expect(facts).toMatchObject({
      supplierTaxId: 'DAN010203AB1',
      invoiceNumber: 'A1001',
      poNumber: 'OC-1001',
      taxUuid: '6A1F3C52-8B7D-4E19-9C0A-2D5E7F8A9B10',
      uncertainFields: [],
    });
  });

  it('AC-004-13 redondea importes al centavo', () => {
    const facts = normalizeExtraction({
      ...raw,
      subtotal: 10000.004,
      taxes: 1599.996,
      total: 11600,
    });
    expect(facts).toMatchObject({
      subtotalCents: 1000000,
      taxesCents: 160000,
      totalCents: 1160000,
    });
  });

  it('AC-004-13 conserva pero marca inciertos un RFC, UUID u OC con formato inválido', () => {
    const facts = normalizeExtraction({
      ...raw,
      supplierTaxId: 'XYZ',
      taxUuid: 'no-es-uuid',
      purchaseOrderNumber: 'OC 10 01 !',
    });
    expect(facts.supplierTaxId).toBe('XYZ');
    expect(facts.taxUuid).toBe('NO-ES-UUID');
    expect(facts.poNumber).toBe('OC1001!');
    expect(facts.uncertainFields).toEqual(
      expect.arrayContaining(['supplierTaxId', 'taxUuid', 'purchaseOrderNumber']),
    );
  });

  it('AC-004-13 una fecha inexistente o un importe negativo quedan en null e inciertos', () => {
    const facts = normalizeExtraction({ ...raw, issueDate: '2026-02-30', taxes: -5 });
    expect(facts.issueDate).toBeNull();
    expect(facts.taxesCents).toBeNull();
    expect(facts.uncertainFields).toEqual(expect.arrayContaining(['issueDate', 'taxes']));
  });

  it('AC-004-13 une los inciertos del modelo con los de la normalización sin repetir', () => {
    const facts = normalizeExtraction({
      ...raw,
      supplierTaxId: 'XYZ',
      uncertainFields: ['supplierTaxId', 'total'],
    });
    expect([...facts.uncertainFields].sort()).toEqual(['supplierTaxId', 'total']);
  });

  it('AC-004-02 no rellena lo que la IA dejó en null y trata el texto vacío como null', () => {
    const facts = normalizeExtraction({ ...raw, purchaseOrderNumber: null, supplierName: '  ' });
    expect(facts.poNumber).toBeNull();
    expect(facts.supplierName).toBeNull();
  });

  it('AC-004-03 un documento ajeno a compras no conserva campos de factura', () => {
    const facts = normalizeExtraction({ ...raw, isAccountsPayableDocument: false });
    expect(facts.isApDocument).toBe(false);
    expect(facts).toMatchObject({
      docType: null,
      supplierTaxId: null,
      invoiceNumber: null,
      poNumber: null,
      totalCents: null,
      currency: null,
      uncertainFields: [],
    });
  });
});

const baseFacts: Facts = normalizeExtraction(raw);
const po1001: NonNullable<PayableContext['purchaseOrder']> = {
  number: 'OC-1001',
  status: 'open',
  totalCents: 1160000,
  currency: 'MXN',
  receiptStatus: 'received',
  supplierTaxId: 'DAN010203AB1',
};
const baseCtx: PayableContext = {
  selectedPoNumber: null,
  purchaseOrder: po1001,
  duplicateOf: null,
  otherPayableForPo: null,
};

const facts = (changes: Partial<Facts>): Facts => ({ ...baseFacts, ...changes });
const ctx = (changes: Partial<PayableContext>): PayableContext => ({ ...baseCtx, ...changes });

describe('evaluatePayable', () => {
  it('AC-004-01 CA-01: todo coincide con la OC → pending_confirmation sin razones', () => {
    expect(evaluatePayable(baseFacts, baseCtx)).toEqual({
      status: 'pending_confirmation',
      reasons: [],
    });
  });

  it('AC-004-02 CA-02: sin OC en el documento ni elegida → MISSING_FIELD:purchaseOrderNumber', () => {
    expect(evaluatePayable(facts({ poNumber: null }), ctx({ purchaseOrder: null }))).toEqual({
      status: 'requires_review',
      reasons: ['MISSING_FIELD:purchaseOrderNumber'],
    });
  });

  it('AC-004-02 con OC elegida al subir, que el documento no la traiga no es falta', () => {
    expect(
      evaluatePayable(facts({ poNumber: null }), ctx({ selectedPoNumber: 'OC-1001' })),
    ).toEqual({ status: 'pending_confirmation', reasons: [] });
  });

  it('AC-004-03 CA-03: documento ajeno a compras → out_of_scope y no se evalúa nada más', () => {
    const payroll = normalizeExtraction({ ...raw, isAccountsPayableDocument: false });
    expect(evaluatePayable(payroll, ctx({ purchaseOrder: null }))).toEqual({
      status: 'out_of_scope',
      reasons: ['NOT_AP_DOCUMENT'],
    });
  });

  it('AC-004-04 CA-04: mismo UUID que un expediente vivo → PO_ALREADY_INVOICED y DUPLICATE', () => {
    expect(evaluatePayable(baseFacts, ctx({ duplicateOf: 'p1', otherPayableForPo: 'p1' }))).toEqual(
      {
        status: 'requires_review',
        reasons: ['PO_ALREADY_INVOICED', 'DUPLICATE'],
      },
    );
  });

  it('AC-004-05 CA-05: total distinto → TOTAL_MISMATCH', () => {
    expect(
      evaluatePayable(
        facts({ totalCents: 853200, supplierTaxId: 'BFM980512KL3', poNumber: 'OC-1002' }),
        ctx({
          purchaseOrder: {
            ...po1001,
            number: 'OC-1002',
            totalCents: 835200,
            supplierTaxId: 'BFM980512KL3',
          },
        }),
      ),
    ).toEqual({ status: 'requires_review', reasons: ['TOTAL_MISMATCH'] });
  });

  it('AC-004-05 cero tolerancia: un centavo de diferencia basta', () => {
    expect(evaluatePayable(facts({ totalCents: 1160001 }), baseCtx).reasons).toEqual([
      'TOTAL_MISMATCH',
    ]);
  });

  it('AC-004-05 RFC y moneda distintos a los de la OC', () => {
    expect(evaluatePayable(facts({ supplierTaxId: 'CSM120304TR5' }), baseCtx).reasons).toEqual([
      'TAX_ID_MISMATCH',
    ]);
    expect(evaluatePayable(facts({ currency: 'USD' }), baseCtx).reasons).toEqual([
      'CURRENCY_MISMATCH',
    ]);
  });

  it('AC-004-06 OC inexistente → PO_NOT_FOUND', () => {
    expect(
      evaluatePayable(facts({ poNumber: 'OC-9999' }), ctx({ purchaseOrder: null })).reasons,
    ).toEqual(['PO_NOT_FOUND']);
    expect(
      evaluatePayable(
        facts({ poNumber: null }),
        ctx({ purchaseOrder: null, selectedPoNumber: 'OC-9999' }),
      ).reasons,
    ).toEqual(['PO_NOT_FOUND']);
  });

  it('AC-004-06 OC sin recepción, cancelada o ya facturada', () => {
    expect(
      evaluatePayable(baseFacts, ctx({ purchaseOrder: { ...po1001, receiptStatus: 'pending' } }))
        .reasons,
    ).toEqual(['RECEIPT_NOT_CONFIRMED']);
    expect(
      evaluatePayable(baseFacts, ctx({ purchaseOrder: { ...po1001, status: 'cancelled' } }))
        .reasons,
    ).toEqual(['PO_CANCELLED']);
    expect(evaluatePayable(baseFacts, ctx({ otherPayableForPo: 'p1' })).reasons).toEqual([
      'PO_ALREADY_INVOICED',
    ]);
  });

  it('AC-004-06 OC elegida distinta a la del documento → PO_MISMATCH', () => {
    expect(evaluatePayable(baseFacts, ctx({ selectedPoNumber: 'OC-1002' })).reasons).toContain(
      'PO_MISMATCH',
    );
  });

  it('marca como faltante cada obligatorio en null, sin marcarlo además como incierto', () => {
    const result = evaluatePayable(
      facts({ supplierTaxId: null, totalCents: null, uncertainFields: ['total', 'subtotal'] }),
      baseCtx,
    );
    expect(result.reasons).toEqual([
      'MISSING_FIELD:supplierTaxId',
      'MISSING_FIELD:total',
      'UNCERTAIN_FIELD:subtotal',
    ]);
  });

  it('el UUID solo es obligatorio en facturas', () => {
    expect(evaluatePayable(facts({ taxUuid: null }), baseCtx).reasons).toEqual([
      'MISSING_FIELD:taxUuid',
    ]);
    expect(evaluatePayable(facts({ docType: 'ticket', taxUuid: null }), baseCtx)).toEqual({
      status: 'pending_confirmation',
      reasons: [],
    });
  });

  it('no compara el total si el campo viene en null', () => {
    expect(evaluatePayable(facts({ totalCents: null }), baseCtx).reasons).toEqual([
      'MISSING_FIELD:total',
    ]);
  });
});

describe('parseReason', () => {
  it('AC-004-16 separa el código del campo', () => {
    expect(parseReason('MISSING_FIELD:total')).toEqual({ code: 'MISSING_FIELD', field: 'total' });
    expect(parseReason('DUPLICATE')).toEqual({ code: 'DUPLICATE' });
  });
});
