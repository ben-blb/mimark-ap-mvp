import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { FakeExtraction, MemoryStorage } from '../../../test/doubles.js';
import { seedCatalog } from '../../../test/fixtures.js';
import { ExtractionClient } from '../../integrations/extraction.client.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { PayablesRepository } from './payables.repository.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;

/** Casos límite de la spec 004 que salieron de su revisión: orden, concurrencia y fallas tardías. */
describe('expedientes: robustez (spec 004)', () => {
  let t: TestApp;
  let agent: Agent;
  const storage = new MemoryStorage();
  const ai = new FakeExtraction();

  const upload = (name = 'factura.pdf', label = 'uno') =>
    agent
      .post('/api/payables')
      .attach('file', Buffer.from(`%PDF-1.7 ${label}`), { filename: name });
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

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
    vi.restoreAllMocks();
    await t.reset();
    await seedCatalog(t.db);
    storage.files.clear();
    ai.calls = 0;
    ai.failNext = 0;
    ai.override = null;
    agent = await t.agent();
  });

  it('AC-004-10 el historial desempata por id cuando dos eventos tienen el mismo instante', async () => {
    const at = new Date();
    const base = { actor: 'Ana', requestId: 'r', entity: 'payable', entityId: 'p-orden', at };
    await t.db.payable.create({
      data: {
        id: 'p-orden',
        createdBy: 'Ana',
        fileKey: 'k',
        fileName: 'f.pdf',
        mimeType: 'application/pdf',
        fileSize: 1,
        invoiceReceivedOn: new Date('2026-10-20'),
      },
    });
    // Se insertan al revés para que el orden de inserción no ayude.
    await t.db.auditEvent.create({
      data: { ...base, id: 'b-evaluated', action: 'payable.evaluated' },
    });
    await t.db.auditEvent.create({
      data: { ...base, id: 'a-extracted', action: 'payable.extracted' },
    });

    const history = await agent.get('/api/payables/p-orden/history').expect(200);
    expect(history.body.items.map((e: { action: string }) => e.action)).toEqual([
      'payable.extracted',
      'payable.evaluated',
    ]);
  });

  it('AC-004-08 dos reintentos simultáneos gastan la IA una sola vez', async () => {
    ai.failNext = 1;
    const id = (await upload().expect(502)).body.details.payableId as string;
    const calls = ai.calls;

    const results = await Promise.all([
      agent.post(`/api/payables/${id}/retry`),
      agent.post(`/api/payables/${id}/retry`),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe('STALE_STATUS');
    expect(ai.calls).toBe(calls + 1);
  });

  it('AC-004-08 un expediente atorado en processing se reintenta solo pasados 5 minutos', async () => {
    const id = (await upload().expect(201)).body.id as string;
    await t.db.payable.update({
      where: { id },
      data: { status: 'processing', updatedAt: new Date() },
    });
    await agent.post(`/api/payables/${id}/retry`).expect(409);

    await t.db.payable.update({
      where: { id },
      data: { status: 'processing', updatedAt: minutesAgo(6) },
    });
    const retried = await agent.post(`/api/payables/${id}/retry`).expect(201);
    expect(retried.body.status).toBe('pending_confirmation');
  });

  it('AC-004-08 si algo falla después de la IA, el expediente queda failed, cuenta para la cuota y se puede reintentar', async () => {
    vi.spyOn(t.get(PayablesRepository), 'findLiveDuplicate').mockRejectedValueOnce(
      new Error('falla de base de datos'),
    );
    const res = await upload().expect(500);
    expect(res.body.code).toBe('INTERNAL');

    const [payable] = await t.db.payable.findMany();
    expect(payable).toMatchObject({ status: 'failed', failureCode: 'PROCESSING_ERROR' });
    const actions = (
      await t.db.auditEvent.findMany({ where: { entityId: payable!.id }, orderBy: { at: 'asc' } })
    ).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['payable.extracted', 'payable.failed']));
    expect(await t.db.auditEvent.count({ where: { action: 'payable.extracted' } })).toBe(1);

    const retried = await agent.post(`/api/payables/${payable!.id}/retry`).expect(201);
    expect(retried.body).toMatchObject({ status: 'pending_confirmation', failureCode: null });
  });

  it('AC-004-04 conserva los acentos del nombre del archivo y la búsqueda lo encuentra', async () => {
    const res = await upload('Factura ñandú.pdf').expect(201);
    expect(res.body.file.name).toBe('Factura ñandú.pdf');
    const found = await agent.get('/api/payables?search=ñandú').expect(200);
    expect(found.body.items).toHaveLength(1);
  });
});
