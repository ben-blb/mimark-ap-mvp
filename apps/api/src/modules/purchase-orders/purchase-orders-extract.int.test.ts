import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { FakeExtraction } from '../../../test/doubles.js';
import { seedCatalog } from '../../../test/fixtures.js';
import { ExtractionClient } from '../../integrations/extraction.client.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;
const pdf = (label = 'oc') => Buffer.from(`%PDF-1.7 ${label}`);

describe('extracción del PDF de ParLevel (spec 014)', () => {
  let t: TestApp;
  let agent: Agent;
  const ai = new FakeExtraction();

  const extract = (bytes: Buffer, fileName = 'oc-parlevel.pdf', as: Agent = agent) =>
    as.post('/api/purchase-orders/extract').attach('file', bytes, { filename: fileName });
  const orderCount = () => t.db.purchaseOrder.count();

  beforeAll(async () => {
    t = await createTestApp((b) => b.overrideProvider(ExtractionClient).useValue(ai));
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedCatalog(t.db);
    ai.calls = 0;
    ai.failNext = 0;
    ai.override = null;
    ai.poOverride = null;
    agent = await t.agent();
  });

  it('AC-014-07 devuelve un borrador con el proveedor por RFC y no crea ninguna OC', async () => {
    const before = await orderCount();
    const res = await extract(pdf()).expect(201);

    expect(res.body).toMatchObject({
      number: 'OC-3001',
      supplierTaxId: 'CSM120304TR5',
      supplier: { taxId: 'CSM120304TR5', currency: 'MXN' },
      issuedOn: '2026-10-20',
      currency: 'MXN',
      parlevelRef: 'PL-0042',
      subtotal: '2500.00',
      taxes: '400.00',
      total: '2900.00',
      warnings: [],
    });
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines[0]).toMatchObject({
      sku: 'CAF-001',
      quantity: '20',
      unitPrice: '100',
      statedAmount: '2000.00',
    });
    expect(await orderCount()).toBe(before);
  });

  it('AC-014-07 solo quien puede crear OC extrae (almacén no)', async () => {
    const warehouse = await t.agent('Wanda', 'warehouse');
    await extract(pdf(), 'oc.pdf', warehouse).expect(403);
    expect(ai.calls).toBe(0);
  });

  it('AC-014-08 rechaza lo que no es PDF, aunque se llame .pdf, y el archivo vacío', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    expect((await extract(png).expect(415)).body.code).toBe('FILE_TYPE_NOT_ALLOWED');
    await extract(Buffer.from('MZ ejecutable')).expect(415);
    await extract(Buffer.alloc(0)).expect(415);
    expect(ai.calls).toBe(0);
  });

  it('AC-014-08 un archivo demasiado grande responde 413', async () => {
    const big = Buffer.concat([pdf(), Buffer.alloc(4 * 1024 * 1024)]);
    expect((await extract(big).expect(413)).body.code).toBe('FILE_TOO_LARGE');
  });

  it('AC-014-08 si la IA falla responde AI_UNAVAILABLE sin registrar el contenido', async () => {
    ai.failNext = 1;
    const res = await extract(pdf()).expect(502);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('contenido del documento');
    expect(await t.db.auditEvent.count({ where: { action: 'purchase_order.extracted' } })).toBe(0);
  });

  it('AC-014-09 avisa folio repetido, proveedor sin coincidencia e importe que no cuadra', async () => {
    const dup = await extract(pdf('a'), 'folio-repetido.pdf').expect(201);
    expect(dup.body.warnings.map((w: { field: string }) => w.field)).toEqual(['number']);

    // Desde la spec 015 también coincide por nombre: un RFC y un nombre desconocidos no coinciden.
    ai.poOverride = { supplierTaxId: 'XXX010101AAA', supplierName: 'Proveedor Desconocido' };
    const unknown = await extract(pdf('b')).expect(201);
    expect(unknown.body.supplier).toBeNull();
    expect(unknown.body.warnings.map((w: { field: string }) => w.field)).toEqual(['supplierId']);
    ai.poOverride = null;

    await t.db.supplier.update({ where: { taxId: 'CSM120304TR5' }, data: { active: false } });
    const inactive = await extract(pdf('c')).expect(201);
    expect(inactive.body.supplier).toBeNull();
    await t.db.supplier.update({ where: { taxId: 'CSM120304TR5' }, data: { active: true } });

    const mismatch = await extract(pdf('d'), 'importe-distinto.pdf').expect(201);
    expect(mismatch.body.warnings).toEqual([
      expect.objectContaining({ field: 'lines.0.unitPrice' }),
    ]);
  });

  it('AC-014-09 un documento que no es una OC vuelve vacío con un aviso', async () => {
    const res = await extract(pdf('n'), 'nomina.pdf').expect(201);
    expect(res.body).toMatchObject({ number: null, lines: [] });
    expect(res.body.warnings).toEqual([expect.objectContaining({ field: 'file' })]);
  });

  it('AC-014-10 cada extracción deja su evento y cuenta contra la cuota diaria', async () => {
    await extract(pdf()).expect(201);
    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.extracted' },
    });
    expect(event).toMatchObject({ actor: 'Ana Pruebas', entityId: null });
    expect(event.data).toEqual({
      model: 'fake',
      promptVersion: 'fake',
      ms: 3,
      lineCount: 2,
      supplierMatch: 'taxId',
    });

    await t.db.auditEvent.createMany({
      data: Array.from({ length: 29 }, () => ({
        actor: 'Ana Pruebas',
        requestId: 'previo',
        entity: 'purchase_order',
        action: 'purchase_order.extracted',
      })),
    });
    const calls = ai.calls;
    expect((await extract(pdf('x')).expect(429)).body.code).toBe('QUOTA_EXCEEDED');
    expect(ai.calls).toBe(calls);

    const other = await t.agent('Beto Pruebas');
    await extract(pdf('y'), 'oc.pdf', other).expect(201);
  });

  it('AC-014-11 solo una persona crea la OC: el borrador se guarda con POST /purchase-orders', async () => {
    const draft = (await extract(pdf()).expect(201)).body;
    expect(await orderCount()).toBe(5);

    await agent
      .post('/api/purchase-orders')
      .send({
        number: draft.number,
        supplierId: draft.supplier.id,
        issuedOn: draft.issuedOn,
        total: draft.total,
        currency: draft.currency,
        parlevelRef: draft.parlevelRef,
        lines: draft.lines.map(({ statedAmount: _, ...line }: Record<string, unknown>) => ({
          ...line,
          sku: line.sku ?? undefined,
        })),
      })
      .expect(201);
    expect(await orderCount()).toBe(6);
  });
});
