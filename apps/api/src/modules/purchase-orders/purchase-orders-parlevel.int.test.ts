import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { FakeExtraction } from '../../../test/doubles.js';
import { seedCatalog } from '../../../test/fixtures.js';
import { ExtractionClient } from '../../integrations/extraction.client.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;
type Warning = { field: string; message: string };
const pdf = Buffer.from('%PDF-1.7 parlevel');

/** OC con el diseño real de ParLevel Warehouse (spec 015), con la extracción simulada. */
describe('OC desde el PDF real de ParLevel (spec 015)', () => {
  let t: TestApp;
  let agent: Agent;
  const ai = new FakeExtraction();

  const extract = (fileName = 'parlevel-warehouse.pdf') =>
    agent.post('/api/purchase-orders/extract').attach('file', pdf, { filename: fileName });
  const fields = (warnings: Warning[]) => warnings.map((w) => w.field);

  beforeAll(async () => {
    t = await createTestApp((b) => b.overrideProvider(ExtractionClient).useValue(ai));
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedCatalog(t.db);
    ai.poOverride = null;
    agent = await t.agent();
  });

  it('AC-015-01 arma el borrador de P3062: folio, fecha MM-DD-AAAA, 9 partidas en cajas y solo subtotal', async () => {
    const res = await extract().expect(201);

    expect(res.body).toMatchObject({
      number: 'P3062',
      parlevelRef: 'P3062',
      issuedOn: '2026-08-05',
      subtotal: '30875.50',
      taxes: null,
      total: null,
      currency: null,
    });
    expect(res.body.lines).toHaveLength(9);
    expect(
      res.body.lines.every((l: { unit: string; sku: null }) => l.unit === 'caja' && l.sku === null),
    ).toBe(true);
    expect(res.body.lines[7]).toMatchObject({
      description: 'Refresco cola sin azúcar 600 ml',
      quantity: '40',
      unitPrice: '149.5',
      statedAmount: '5980.00',
    });
  });

  it('AC-015-10 con los importes de P3062 no hay avisos de importe ni de subtotal', async () => {
    const res = await extract().expect(201);
    const warned = fields(res.body.warnings);
    expect(warned.some((f) => f.startsWith('lines.'))).toBe(false);
    expect(warned).not.toContain('subtotal');
  });

  it('AC-015-04 AC-015-07 AC-015-09 sin proveedor registrado sugiere el del bloque To: y avisa fecha y total', async () => {
    const res = await extract().expect(201);

    expect(res.body).toMatchObject({
      supplier: null,
      supplierMatch: null,
      supplierSuggestion: { name: 'Refrescos del Norte', city: 'Monterrey, Nuevo Leon 64890' },
    });
    expect(fields(res.body.warnings)).toEqual(['supplierId', 'issuedOn', 'total']);
    expect(res.body.warnings[0].message).toContain('Proveedor no registrado');
    expect(res.body.warnings[1].message).toBe(
      'Fecha leída como 5 ago 2026 (MM-DD-AAAA de ParLevel); revisa',
    );
  });

  it('AC-015-08 sin moneda en el PDF la deja nula y marcada para revisar', async () => {
    const res = await extract().expect(201);
    expect(res.body.currency).toBeNull();
    expect(res.body.uncertainFields).toContain('currency');
  });

  it('AC-015-02 si la IA lee al comprador como proveedor, no lo elige y avisa', async () => {
    await t.db.supplier.create({
      data: { name: 'Smart Kiosko', taxId: 'SKI010101AB1', creditDays: 0, currency: 'MXN' },
    });
    const res = await extract('parlevel-warehouse-comprador.pdf').expect(201);
    expect(res.body).toMatchObject({ supplier: null, supplierSuggestion: null });
    expect(res.body.warnings[0]).toEqual({
      field: 'supplierName',
      message: 'El proveedor leído es el comprador; elige el proveedor',
    });
  });

  it('AC-015-03 coincide por alias de ParLevel, por nombre y, ante empate, no elige', async () => {
    const supplier = await t.db.supplier.findUniqueOrThrow({ where: { taxId: 'EDR150720QW9' } });

    await t.db.supplier.update({
      where: { id: supplier.id },
      data: { parlevelName: 'REFRESCOS DEL NORTE' },
    });
    const byAlias = await extract().expect(201);
    expect(byAlias.body).toMatchObject({
      supplier: { id: supplier.id, taxId: 'EDR150720QW9', currency: 'MXN' },
      supplierMatch: 'alias',
      supplierSuggestion: null,
    });
    expect(fields(byAlias.body.warnings)).not.toContain('supplierId');

    await t.db.supplier.update({ where: { id: supplier.id }, data: { parlevelName: null } });
    const named = await t.db.supplier.create({
      data: {
        name: 'Refrescos del Norte SA de CV',
        taxId: 'RDN010101AB1',
        creditDays: 15,
        currency: 'MXN',
      },
    });
    const byName = await extract().expect(201);
    expect(byName.body).toMatchObject({ supplier: { id: named.id }, supplierMatch: 'name' });

    await t.db.supplier.create({
      data: {
        name: 'Refrescos del Norte SC',
        taxId: 'RDN020202AB2',
        creditDays: 0,
        currency: 'MXN',
      },
    });
    const tie = await extract().expect(201);
    expect(tie.body).toMatchObject({ supplier: null, supplierMatch: null });
    expect(tie.body.warnings[0].message).toContain('varios proveedores');
  });

  it('AC-015-09 avisa el depósito de envase y las cajas ya recibidas, sin descuadrar importes', async () => {
    const res = await extract('parlevel-warehouse-deposito.pdf').expect(201);
    const warned = fields(res.body.warnings);
    expect(warned).toContain('lines.0.deposit');
    expect(warned).toContain('lines.0.receivedQuantity');
    expect(warned).not.toContain('lines.0.unitPrice');
    expect(warned).not.toContain('subtotal');
    expect(res.body.lines[0]).toMatchObject({ deposit: '25.00', receivedQuantity: '15' });
  });

  it('AC-015-09 avisa una fecha futura', async () => {
    ai.poOverride = { issuedOn: '12-31-2099' };
    const res = await extract().expect(201);
    expect(res.body.warnings).toContainEqual({
      field: 'issuedOn',
      message: 'La fecha de la OC es futura; revisa la fecha',
    });
  });

  it('AC-015-11 la extracción deja su evento con cómo coincidió el proveedor', async () => {
    await extract().expect(201);
    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.extracted' },
    });
    expect(event.data).toMatchObject({ lineCount: 9, supplierMatch: null });
  });

  it('AC-015-13 flujo completo: registrar al proveedor desde la sugerencia y guardar la OC', async () => {
    const draft = (await extract().expect(201)).body;

    const created = await agent
      .post('/api/suppliers')
      .send({
        name: draft.supplierSuggestion.name,
        parlevelName: draft.supplierSuggestion.name,
        taxId: 'RDN010101AB1',
        creditDays: 30,
        currency: 'MXN',
      })
      .expect(201);

    type DraftLine = { description: string; quantity: string; unit: string; unitPrice: string };
    await agent
      .post('/api/purchase-orders')
      .send({
        number: draft.number,
        supplierId: created.body.id,
        issuedOn: draft.issuedOn,
        total: '35815.58',
        currency: 'MXN',
        parlevelRef: draft.parlevelRef,
        lines: draft.lines.map(({ description, quantity, unit, unitPrice }: DraftLine) => ({
          description,
          quantity,
          unit,
          unitPrice,
        })),
      })
      .expect(201);

    const again = (await extract().expect(201)).body;
    expect(again).toMatchObject({ supplier: { id: created.body.id }, supplierMatch: 'alias' });
    expect(fields(again.warnings)).toEqual(['number', 'issuedOn', 'total']);
  });
});
