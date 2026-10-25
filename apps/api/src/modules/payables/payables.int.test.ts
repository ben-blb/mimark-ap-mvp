import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { FakeExtraction, MemoryStorage } from '../../../test/doubles.js';
import { seedCatalog } from '../../../test/fixtures.js';
import { ExtractionClient } from '../../integrations/extraction.client.js';
import { StorageClient } from '../../integrations/storage.client.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;

const pdf = (label: string) => Buffer.from(`%PDF-1.7 ${label}`);

describe('expedientes (spec 004)', () => {
  let t: TestApp;
  let agent: Agent;
  const storage = new MemoryStorage();
  const ai = new FakeExtraction();

  const upload = (
    bytes: Buffer,
    fileName = 'factura.pdf',
    fields: Record<string, string> = {},
    as: Agent = agent,
  ) => {
    let req = as.post('/api/payables').attach('file', bytes, { filename: fileName });
    for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
    return req;
  };
  const created = async (bytes = pdf('uno'), fileName = 'factura.pdf') =>
    (await upload(bytes, fileName).expect(201)).body as { id: string; status: string };
  const reasons = (body: { reviewReasons: { code: string; field?: string }[] }) =>
    body.reviewReasons.map((r) => (r.field ? `${r.code}:${r.field}` : r.code));

  beforeAll(async () => {
    t = await createTestApp((b) =>
      b
        .overrideProvider(StorageClient)
        .useValue(storage)
        .overrideProvider(ExtractionClient)
        .useValue(ai),
    );
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedCatalog(t.db);
    storage.files.clear();
    ai.calls = 0;
    ai.failNext = 0;
    ai.override = null;
    agent = await t.agent();
  });

  it('AC-004-01 una factura que coincide con la OC queda pending_confirmation y el archivo es idéntico', async () => {
    const bytes = pdf('factura buena');
    const res = await upload(bytes).expect(201);
    expect(res.body).toMatchObject({
      status: 'pending_confirmation',
      reviewReasons: [],
      purchaseOrder: { number: 'OC-1001', receiptStatus: 'received' },
      supplier: { taxId: 'DAN010203AB1' },
      fields: { total: '11600.00', currency: 'MXN', poNumber: 'OC-1001' },
      file: { name: 'factura.pdf', mimeType: 'application/pdf', size: bytes.length },
    });

    const file = await agent
      .get(`/api/payables/${res.body.id}/file`)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((file.body as Buffer).equals(bytes)).toBe(true);
  });

  it('AC-004-02 sin OC en el documento queda en revisión y no rellena lo que la IA dejó en null', async () => {
    const res = await upload(pdf('x'), 'sin-oc.pdf').expect(201);
    expect(res.body.status).toBe('requires_review');
    expect(reasons(res.body)).toEqual(['MISSING_FIELD:purchaseOrderNumber']);
    expect(res.body.fields.poNumber).toBeNull();
    expect(res.body.purchaseOrder).toBeNull();
  });

  it('AC-004-03 un documento ajeno a compras queda out_of_scope sin campos de factura', async () => {
    const res = await upload(pdf('x'), 'recibo-nomina.pdf').expect(201);
    expect(res.body.status).toBe('out_of_scope');
    expect(reasons(res.body)).toEqual(['NOT_AP_DOCUMENT']);
    expect(res.body.fields).toMatchObject({
      supplierTaxId: null,
      total: null,
      invoiceNumber: null,
    });
  });

  it('AC-004-04 el mismo documento subido dos veces es duplicado y el primero no cambia', async () => {
    const first = await created(pdf('repetida'));
    const second = await upload(pdf('repetida')).expect(201);
    expect(second.body.status).toBe('requires_review');
    expect(reasons(second.body)).toEqual(['PO_ALREADY_INVOICED', 'DUPLICATE']);

    const again = await agent.get(`/api/payables/${first.id}`).expect(200);
    expect(again.body.status).toBe('pending_confirmation');
  });

  it('AC-004-04 el mismo RFC + folio con otro UUID también es duplicado', async () => {
    await created(pdf('a'));
    ai.override = { invoiceNumber: 'F-FIJO' };
    await upload(pdf('b')).expect(201);
    ai.override = { invoiceNumber: 'F-FIJO', purchaseOrderNumber: null };
    const third = await upload(pdf('c'), 'factura.pdf', { purchaseOrderNumber: 'OC-1002' }).expect(
      201,
    );
    expect(reasons(third.body)).toContain('DUPLICATE');
  });

  it('AC-004-05 total distinto → TOTAL_MISMATCH; RFC y moneda distintos → su causa exacta', async () => {
    const total = await upload(pdf('x'), 'total-distinto.pdf').expect(201);
    expect(reasons(total.body)).toEqual(['TOTAL_MISMATCH']);

    ai.override = { total: 11600.01 };
    await t.db.payable.deleteMany(); // cada caso con la OC libre de otros expedientes vivos
    expect(reasons((await upload(pdf('y')).expect(201)).body)).toEqual(['TOTAL_MISMATCH']);

    await t.db.payable.deleteMany();
    ai.override = { supplierTaxId: 'CSM120304TR5' };
    expect(reasons((await upload(pdf('z')).expect(201)).body)).toEqual(['TAX_ID_MISMATCH']);

    ai.override = { purchaseOrderNumber: 'OC-1004', supplierTaxId: 'ISG070809MN2', total: 1250 };
    expect(reasons((await upload(pdf('w')).expect(201)).body)).toEqual(['CURRENCY_MISMATCH']);
  });

  it('AC-004-06 OC inexistente, sin recepción, cancelada o distinta a la elegida', async () => {
    ai.override = { purchaseOrderNumber: 'OC-9999' };
    expect(reasons((await upload(pdf('1')).expect(201)).body)).toEqual(['PO_NOT_FOUND']);

    ai.override = { purchaseOrderNumber: 'OC-1003', supplierTaxId: 'EDR150720QW9', total: 3480 };
    expect(reasons((await upload(pdf('2')).expect(201)).body)).toEqual(['RECEIPT_NOT_CONFIRMED']);

    ai.override = null;
    await t.db.purchaseOrder.update({
      where: { number: 'OC-1001' },
      data: { status: 'cancelled' },
    });
    expect(reasons((await upload(pdf('3')).expect(201)).body)).toEqual(['PO_CANCELLED']);
    await t.db.purchaseOrder.update({ where: { number: 'OC-1001' }, data: { status: 'open' } });

    const mismatch = await upload(pdf('4'), 'factura.pdf', { purchaseOrderNumber: 'OC-1002' });
    expect(reasons(mismatch.body)).toContain('PO_MISMATCH');
  });

  it('AC-004-07 un archivo que no es PDF/PNG/JPG se rechaza por su firma, sin guardar ni llamar a la IA', async () => {
    const res = await upload(Buffer.from('MZ ejecutable disfrazado'), 'factura.pdf').expect(415);
    expect(res.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(storage.files.size).toBe(0);
    expect(ai.calls).toBe(0);
    expect(await t.db.payable.count()).toBe(0);
  });

  it('AC-004-07 más de 4 MB se rechaza con 413 sin guardar ni llamar a la IA', async () => {
    const big = Buffer.concat([pdf('grande'), Buffer.alloc(4 * 1024 * 1024)]);
    const res = await upload(big).expect(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
    expect(storage.files.size).toBe(0);
    expect(ai.calls).toBe(0);
    expect(await t.db.payable.count()).toBe(0);
  });

  it('AC-004-08 si la IA falla responde 502 con el id del expediente y el reintento lo procesa sin resubir', async () => {
    ai.failNext = 1;
    const res = await upload(pdf('falla')).expect(502);
    expect(res.body).toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(res.body.requestId).toBeTruthy();
    const id = res.body.details.payableId as string;

    const failed = await agent.get(`/api/payables/${id}`).expect(200);
    expect(failed.body).toMatchObject({ status: 'failed', allowedActions: ['retry', 'discard'] });
    expect(storage.files.size).toBe(1);

    const retried = await agent.post(`/api/payables/${id}/retry`).expect(201);
    expect(retried.body.status).toBe('pending_confirmation');
    expect(retried.body.allowedActions).toEqual(['correct', 'confirm', 'discard']);
    expect(storage.files.size).toBe(1);
    await agent.post(`/api/payables/${id}/retry`).expect(409);
  });

  it('AC-004-08 una salida fuera del esquema también es AI_UNAVAILABLE (el cliente lanza)', async () => {
    ai.failNext = 1;
    const res = await upload(pdf('x')).expect(502);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
  });

  it('AC-004-09 al llegar al límite diario responde 429 antes de guardar o llamar a la IA', async () => {
    await t.db.auditEvent.createMany({
      data: Array.from({ length: 30 }, () => ({
        actor: 'Ana Pruebas',
        requestId: 'previo',
        entity: 'payable',
        action: 'payable.extracted',
      })),
    });
    const res = await upload(pdf('x')).expect(429);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(storage.files.size).toBe(0);
    expect(ai.calls).toBe(0);

    const other = await t.agent('Beto Pruebas');
    await upload(pdf('y'), 'factura.pdf', {}, other).expect(201);
  });

  it('AC-004-09 el reintento también respeta la cuota', async () => {
    ai.failNext = 1;
    const id = (await upload(pdf('x')).expect(502)).body.details.payableId as string;
    await t.db.auditEvent.createMany({
      data: Array.from({ length: 30 }, () => ({
        actor: 'Ana Pruebas',
        requestId: 'previo',
        entity: 'payable',
        action: 'payable.extracted',
      })),
    });
    const calls = ai.calls;
    await agent.post(`/api/payables/${id}/retry`).expect(429);
    expect(ai.calls).toBe(calls);
  });

  it('AC-004-10 cada cambio de estado deja un evento con requestId y la extracción no guarda contenido', async () => {
    const { id } = await created();
    const history = await agent.get(`/api/payables/${id}/history`).expect(200);
    expect(history.body.items.map((e: { action: string }) => e.action)).toEqual([
      'payable.uploaded',
      'payable.processing',
      'payable.extracted',
      'payable.evaluated',
    ]);
    const extracted = history.body.items[2];
    expect(extracted.data).toEqual({ ok: true, model: 'fake', promptVersion: 'fake', ms: 3 });
    expect(history.body.items[3]).toMatchObject({
      fromStatus: 'processing',
      toStatus: 'pending_confirmation',
    });

    const events = await t.db.auditEvent.findMany({ where: { entity: 'payable', entityId: id } });
    expect(events.every((e) => e.requestId.length > 0)).toBe(true);

    ai.failNext = 1;
    const failedId = (await upload(pdf('f')).expect(502)).body.details.payableId as string;
    const failedEvents = await t.db.auditEvent.findMany({ where: { entityId: failedId } });
    expect(JSON.stringify(failedEvents)).not.toContain('contenido del documento');
    expect(failedEvents.map((e) => e.action)).toContain('payable.failed');
  });

  it('AC-004-11 el original se sirve con su tipo, nosniff y sin caché', async () => {
    const { id } = await created();
    const res = await agent.get(`/api/payables/${id}/file`).expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');
    await t.http().get(`/api/payables/${id}/file`).expect(401);
    await agent.get('/api/payables/no-existe/file').expect(404);
  });

  it('AC-004-14 filtra por estado, texto y quién subió; más recientes primero', async () => {
    const ok = await created(pdf('1'));
    const review = (await upload(pdf('2'), 'sin-oc.pdf').expect(201)).body as { id: string };
    const other = await t.agent('Beto Pruebas');
    const bySomeoneElse = (await upload(pdf('3'), 'recibo-nomina.pdf', {}, other).expect(201))
      .body as { id: string };

    const all = await agent.get('/api/payables').expect(200);
    expect(all.body.items.map((i: { id: string }) => i.id)).toEqual([
      bySomeoneElse.id,
      review.id,
      ok.id,
    ]);
    const ids = async (query: string) =>
      ((await agent.get(`/api/payables?${query}`).expect(200)).body.items as { id: string }[]).map(
        (i) => i.id,
      );
    expect(await ids('status=requires_review')).toEqual([review.id]);
    expect(await ids('createdBy=Beto Pruebas')).toEqual([bySomeoneElse.id]);
    expect(await ids('search=sin-oc')).toEqual([review.id]);
    expect(await ids('search=distribuidora')).toEqual([ok.id]);
    expect(await ids('search=OC-1001')).toEqual([ok.id]);
  });
});
