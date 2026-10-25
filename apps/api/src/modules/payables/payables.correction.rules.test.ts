import type { Extraction } from '@mimark/contracts/extraction';
import { describe, expect, it } from 'vitest';
import { applyCorrection } from './payables.correction.rules.js';
import { evaluatePayable, normalizeExtraction, type PayableContext } from './payables.rules.js';

const raw: Extraction = {
  documentType: 'factura',
  isAccountsPayableDocument: true,
  supplierName: 'Bebidas Frías de Monterrey SA de CV',
  supplierTaxId: 'BFM980512KL3',
  invoiceNumber: 'A-1',
  issueDate: '2026-10-06',
  purchaseOrderNumber: null,
  subtotal: 7200,
  taxes: 1152,
  total: 8352,
  currency: 'MXN',
  taxUuid: '6A1F3C52-8B7D-4E19-9C0A-2D5E7F8A9B10',
  missingFields: ['purchaseOrderNumber'],
  uncertainFields: ['supplierTaxId', 'total'],
  sourceEvidence: [],
};
const current = normalizeExtraction(raw);
const po1002: NonNullable<PayableContext['purchaseOrder']> = {
  number: 'OC-1002',
  status: 'open',
  totalCents: 835200,
  currency: 'MXN',
  receiptStatus: 'received',
  supplierTaxId: 'BFM980512KL3',
};
const noContext = { duplicateOf: null, otherPayableForPo: null };

describe('applyCorrection', () => {
  it('AC-005-01 aplica el valor nuevo normalizado y devuelve el diff { from, to }', () => {
    const { facts, changes } = applyCorrection(current, {
      poNumber: ' oc-1002 ',
      total: '8352.00',
    });
    expect(facts.poNumber).toBe('OC-1002');
    expect(changes).toEqual({ poNumber: { from: null, to: 'OC-1002' } });
  });

  it('AC-005-01 un importe cambiado se registra con 2 decimales', () => {
    const { facts, changes } = applyCorrection(current, { total: '8532.5' });
    expect(facts.totalCents).toBe(853250);
    expect(changes).toEqual({ total: { from: '8352.00', to: '8532.50' } });
  });

  it('AC-005-02 un campo corregido deja de estar en uncertainFields y los demás se conservan', () => {
    const { facts } = applyCorrection(current, { supplierTaxId: 'bfm980512kl3' });
    expect(current.uncertainFields).toEqual(['supplierTaxId', 'total']);
    expect(facts.uncertainFields).toEqual(['total']);
  });

  it('AC-005-02 reenviar el mismo valor de un campo dudoso lo confirma sin registrar cambio', () => {
    const { facts, changes } = applyCorrection(current, { total: '8352.00' });
    expect(facts.uncertainFields).toEqual(['supplierTaxId']);
    expect(changes).toEqual({});
  });

  it('AC-005-01 permite dejar un campo en null', () => {
    const { facts, changes } = applyCorrection(current, { taxUuid: null });
    expect(facts.taxUuid).toBeNull();
    expect(changes.taxUuid).toEqual({ from: '6A1F3C52-8B7D-4E19-9C0A-2D5E7F8A9B10', to: null });
  });

  it('AC-005-01 no toca lo que no se envía y no muta el original', () => {
    const copy = structuredClone(current);
    const { facts } = applyCorrection(current, { invoiceNumber: 'b 2' });
    expect(facts).toMatchObject({ invoiceNumber: 'B2', supplierName: current.supplierName });
    expect(current).toEqual(copy);
  });

  it('AC-005-01 tras corregir, las reglas se evalúan de nuevo y pasa a pending_confirmation', () => {
    const before = evaluatePayable(current, {
      selectedPoNumber: null,
      purchaseOrder: null,
      ...noContext,
    });
    expect(before.status).toBe('requires_review');

    const { facts } = applyCorrection(current, {
      poNumber: 'OC-1002',
      supplierTaxId: 'BFM980512KL3',
      total: '8352.00',
    });
    const after = evaluatePayable(facts, {
      selectedPoNumber: 'OC-1002',
      purchaseOrder: po1002,
      ...noContext,
    });
    expect(after).toEqual({ status: 'pending_confirmation', reasons: [] });
  });

  it('AC-005-03 reclasificar un fuera de alcance: isApDocument true más los campos', () => {
    const payroll = normalizeExtraction({ ...raw, isAccountsPayableDocument: false });
    expect(payroll.isApDocument).toBe(false);

    const { facts, changes } = applyCorrection(payroll, {
      isApDocument: true,
      docType: 'factura',
      supplierTaxId: 'BFM980512KL3',
      invoiceNumber: 'A-1',
      issueDate: '2026-10-06',
      poNumber: 'OC-1002',
      total: '8352.00',
      currency: 'MXN',
      taxUuid: '6a1f3c52-8b7d-4e19-9c0a-2d5e7f8a9b10',
    });
    expect(facts.isApDocument).toBe(true);
    expect(changes.isApDocument).toEqual({ from: false, to: true });
    expect(
      evaluatePayable(facts, { selectedPoNumber: 'OC-1002', purchaseOrder: po1002, ...noContext })
        .status,
    ).toBe('pending_confirmation');
  });
});
