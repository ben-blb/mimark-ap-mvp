import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { MemoryStorage } from '../../../test/doubles.js';
import { type Cell, salesRows, xlsx, XLSX_MIME } from '../../../test/sheets.js';
import { StorageClient } from '../../integrations/storage.client.js';

describe('confirmación y movimientos (spec 021)', () => {
  let t: TestApp;
  let storage: MemoryStorage;
  let admin: Awaited<ReturnType<TestApp['agent']>>;
  let companyId: string;
  let k1: string;

  beforeAll(async () => {
    storage = new MemoryStorage();
    t = await createTestApp((b) => b.overrideProvider(StorageClient).useValue(storage));
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    storage.files.clear();
    admin = await t.agent();
    companyId = (await t.db.company.create({ data: { name: 'Quima', nameKey: 'quima' } })).id;
    k1 = (await t.db.kiosk.create({ data: { companyId, name: 'K1', parlevelAsset: 'A-1' } })).id;
    await t.db.kiosk.create({ data: { companyId, name: 'K2', parlevelAsset: 'A-2' } });
  });

  // Un .xlsx lleva su fecha de creación: para probar «el mismo archivo» hay que reutilizar los mismos bytes.
  const previewFile = async (file: Buffer, source = 'parlevel_sales', name = 'v.xlsx') => {
    const req = admin.post('/api/closing/uploads');
    for (const [k, v] of Object.entries({ companyId, month: '2026-09', source })) req.field(k, v);
    const res = await req.attach('file', file, { filename: name, contentType: XLSX_MIME });
    expect(res.status).toBe(201);
    return res.body.upload.id as string;
  };
  const preview = async (rows: Cell[][], source = 'parlevel_sales') =>
    previewFile(await xlsx(rows), source);
  const confirm = (id: string) => admin.post(`/api/closing/uploads/${id}/confirm`);
  const entries = () =>
    t.db.ledgerEntry.findMany({ orderBy: [{ rowNumber: 'asc' }], include: { period: true } });
  const sum = async () =>
    (await entries()).reduce((total, e) => total + Math.round(Number(e.amount) * 100), 0) / 100;

  it('AC-021-08 AC-021-10 confirmar crea los movimientos con signo y su origen (archivo y fila)', async () => {
    const id = await preview(salesRows(['A-1', 'A-2']));
    const res = await confirm(id).expect(200);

    expect(res.body).toMatchObject({ id, status: 'confirmed', entriesCount: 2 });
    const rows = await entries();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      uploadId: id,
      rowNumber: 2,
      kioskId: k1,
      source: 'parlevel_sales',
      concept: 'Ventas',
      needsReview: false,
      createdBy: 'Ana Pruebas',
    });
    expect(rows[0]?.amount.toFixed(2)).toBe('100.00');
    expect(rows[0]?.date.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(rows[1]).toMatchObject({ uploadId: id, rowNumber: 3 });
    expect(
      await t.db.auditEvent.count({ where: { action: 'upload.confirmed', entityId: id } }),
    ).toBe(1);
  });

  it('AC-021-08 una fuente de egresos queda con importes negativos', async () => {
    const id = await preview(
      [
        ['Fecha', 'Nombre', 'Monto', 'IMSS'],
        ['2026-09-15', 'Ana Prueba', 5000, 'sí'],
      ],
      'payroll',
    );
    await confirm(id).expect(200);
    expect((await entries())[0]?.amount.toFixed(2)).toBe('-5000.00');
  });

  it('AC-021-08 AC-021-14 una celda =CMD() se guarda como texto en el concepto', async () => {
    const id = await preview(
      [
        ['Fecha', 'Concepto', 'Monto', 'Tipo'],
        ['2026-09-10', '=CMD()', 10, 'Entrada'],
      ],
      'cash',
    );
    await confirm(id).expect(200);
    expect((await entries())[0]?.concept).toBe('=CMD()');
    const list = await admin
      .get(`/api/closing/entries?companyId=${companyId}&month=2026-09`)
      .expect(200);
    expect(list.body.items[0].concept).toBe('=CMD()');
  });

  it('AC-021-08 confirmar dos veces la misma carga responde 409 y no duplica', async () => {
    const id = await preview(salesRows(['A-1']));
    await confirm(id).expect(200);
    const again = await confirm(id).expect(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');
    expect(await t.db.ledgerEntry.count()).toBe(1);
  });

  it('AC-021-08 confirmar una carga que no existe responde 404', async () => {
    await confirm('no-existe').expect(404);
  });

  it('AC-021-09 cargar otro archivo y confirmar reemplaza los movimientos sin duplicar', async () => {
    const first = await preview(salesRows(['A-1', 'A-2']));
    await confirm(first).expect(200);
    expect(await sum()).toBe(300);

    const second = await preview([
      ['Asset', 'Date', 'Sales'],
      ['A-1', '2026-09-05', 40],
    ]);
    await confirm(second).expect(200);

    expect(await sum()).toBe(40);
    expect(await t.db.ledgerEntry.count()).toBe(1);
    const uploads = await t.db.sourceUpload.findMany({ orderBy: { createdAt: 'asc' } });
    expect(uploads.map((u) => u.status)).toEqual(['superseded', 'confirmed']);
    expect(
      await t.db.auditEvent.count({ where: { action: 'upload.superseded', entityId: first } }),
    ).toBe(1);
  });

  it('AC-021-09 otra fuente del mismo periodo no se toca', async () => {
    const sales = await preview(salesRows(['A-1']));
    await confirm(sales).expect(200);
    const cash = await preview(
      [
        ['Fecha', 'Concepto', 'Monto', 'Tipo'],
        ['2026-09-10', 'Fondo', 50, 'Entrada'],
      ],
      'cash',
    );
    await confirm(cash).expect(200);
    expect(await t.db.ledgerEntry.count()).toBe(2);
    expect(await t.db.sourceUpload.count({ where: { status: 'confirmed' } })).toBe(2);
  });

  it('AC-021-06 el mismo archivo ya confirmado no se puede volver a cargar', async () => {
    const file = await xlsx(salesRows(['A-1']));
    const id = await previewFile(file);
    await confirm(id).expect(200);
    const req = admin.post('/api/closing/uploads');
    for (const [k, v] of Object.entries({
      companyId,
      month: '2026-09',
      source: 'parlevel_sales',
    })) {
      req.field(k, v);
    }
    const res = await req
      .attach('file', await xlsx(salesRows(['A-1'])), {
        filename: 'copia.xlsx',
        contentType: XLSX_MIME,
      })
      .expect(409);
    expect(res.body.code).toBe('DUPLICATE_UPLOAD');
  });

  it('AC-021-06 dos vistas previas del mismo archivo: confirmar la segunda responde 409', async () => {
    const file = await xlsx(salesRows(['A-1']));
    const a = await previewFile(file);
    const b = await previewFile(file);
    await confirm(a).expect(200);
    const res = await confirm(b).expect(409);
    expect(res.body.code).toBe('DUPLICATE_UPLOAD');
    expect(await t.db.ledgerEntry.count()).toBe(1);
  });

  it('AC-021-11 un periodo cerrado rechaza confirmar y descartar con 409 PERIOD_CLOSED', async () => {
    const id = await preview(salesRows(['A-1']));
    await t.db.reportPeriod.updateMany({ data: { status: 'closed' } });
    expect((await confirm(id).expect(409)).body.code).toBe('PERIOD_CLOSED');
    const discard = await admin.post(`/api/closing/uploads/${id}/discard`).expect(409);
    expect(discard.body.code).toBe('PERIOD_CLOSED');
    expect(await t.db.ledgerEntry.count()).toBe(0);
  });

  it('AC-021-11 descartar una vista previa la deja en discarded y ya no se puede confirmar', async () => {
    const id = await preview(salesRows(['A-1']));
    const res = await admin.post(`/api/closing/uploads/${id}/discard`).expect(200);
    expect(res.body.status).toBe('discarded');
    expect(await t.db.auditEvent.count({ where: { action: 'upload.discarded' } })).toBe(1);
    expect((await confirm(id).expect(409)).body.code).toBe('INVALID_TRANSITION');
    await admin.post('/api/closing/uploads/no-existe/discard').expect(404);
  });

  const manual = {
    source: 'cash',
    date: '2026-09-15',
    concept: 'Gasolina',
    amount: '-350.00',
  };

  it('AC-021-12 la captura manual de caja crea un movimiento sin archivo, auditado', async () => {
    const res = await admin
      .post('/api/closing/entries')
      .send({ ...manual, companyId, kioskId: k1 })
      .expect(201);
    expect(res.body).toMatchObject({
      source: 'cash',
      uploadId: null,
      rowNumber: null,
      amount: '-350.00',
      month: '2026-09',
      kioskId: k1,
    });
    expect(await t.db.reportPeriod.count()).toBe(1);
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'entry.created' } });
    expect(event).toMatchObject({ entity: 'entry', entityId: res.body.id });
    await admin
      .post('/api/closing/entries')
      .send({ ...manual, source: 'payroll', concept: 'Ana', amount: '500.00', companyId })
      .expect(201)
      .expect((r) => expect(r.body.amount).toBe('-500.00'));
  });

  it('AC-021-12 solo caja o nómina, con kiosko de la empresa y con permiso de escritura', async () => {
    await admin
      .post('/api/closing/entries')
      .send({ ...manual, source: 'bank_csv', companyId })
      .expect(400);
    const other = await t.db.company.create({ data: { name: 'Otra', nameKey: 'otra' } });
    const foreign = await t.db.kiosk.create({ data: { companyId: other.id, name: 'KO' } });
    await admin
      .post('/api/closing/entries')
      .send({ ...manual, companyId, kioskId: foreign.id })
      .expect(400);
    await admin
      .post('/api/closing/entries')
      .send({ ...manual, companyId: 'nada' })
      .expect(404);

    const manager = await t.agent('Gerente', 'manager');
    await manager
      .post('/api/closing/entries')
      .send({ ...manual, companyId })
      .expect(403);
    expect(await t.db.ledgerEntry.count()).toBe(0);
  });

  it('AC-021-12 AC-021-11 un periodo cerrado rechaza la captura manual', async () => {
    await t.db.reportPeriod.create({ data: { companyId, month: '2026-09', status: 'closed' } });
    const res = await admin
      .post('/api/closing/entries')
      .send({ ...manual, companyId })
      .expect(409);
    expect(res.body.code).toBe('PERIOD_CLOSED');
    expect(await t.db.ledgerEntry.count()).toBe(0);
  });

  it('AC-021-13 lista paginada con filtros por fuente y kiosko; gerencia lee y otros roles no', async () => {
    await confirm(await preview(salesRows(['A-1', 'A-2', 'A-1']))).expect(200);
    await admin
      .post('/api/closing/entries')
      .send({ ...manual, companyId })
      .expect(201);
    const base = `/api/closing/entries?companyId=${companyId}&month=2026-09`;

    const all = await admin.get(base).expect(200);
    expect(all.body).toMatchObject({ total: 4, page: 1, pageSize: 100 });
    const page = await admin.get(`${base}&pageSize=3&page=2`).expect(200);
    expect(page.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(page.body.items).toHaveLength(1);
    expect((await admin.get(`${base}&source=cash`).expect(200)).body.total).toBe(1);
    expect((await admin.get(`${base}&kioskId=${k1}`).expect(200)).body.total).toBe(2);
    expect((await admin.get(`${base.replace('2026-09', '2026-10')}`).expect(200)).body.total).toBe(
      0,
    );

    const manager = await t.agent('Gerente', 'manager');
    await manager.get(base).expect(200);
    const payables = await t.agent('CxP', 'payables');
    await payables.get(base).expect(403);
    await t.http().get(base).expect(401);
    await admin.get(`/api/closing/entries?companyId=${companyId}`).expect(400);
  });
});
