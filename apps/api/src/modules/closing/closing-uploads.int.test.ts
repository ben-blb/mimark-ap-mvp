import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { csv, salesRows, xlsx, XLSX_MIME } from '../../../test/sheets.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { MemoryStorage } from '../../../test/doubles.js';

describe('cargas de fuentes (spec 021)', () => {
  let t: TestApp;
  let storage: MemoryStorage;
  let admin: Awaited<ReturnType<TestApp['agent']>>;
  let companyId: string;
  let accountId: string;

  beforeAll(async () => {
    storage = new MemoryStorage();
    t = await createTestApp((b) => b.overrideProvider(StorageClient).useValue(storage));
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    storage.files.clear();
    admin = await t.agent();
    const company = await t.db.company.create({ data: { name: 'Quima', nameKey: 'quima' } });
    companyId = company.id;
    await t.db.kiosk.create({
      data: { companyId, name: 'K1', parlevelAsset: 'A-1', cantaloupeDeviceId: 'D-1' },
    });
    await t.db.kiosk.create({ data: { companyId, name: 'K2', parlevelAsset: 'A-2' } });
    accountId = (
      await t.db.bankAccount.create({ data: { companyId, name: 'Cheques', type: 'checking' } })
    ).id;
  });

  const send = (
    file: Buffer,
    name: string,
    fields: Record<string, string> = {},
    agent: typeof admin = admin,
  ) => {
    const req = agent.post('/api/closing/uploads');
    const all = { companyId, month: '2026-09', source: 'parlevel_sales', ...fields };
    for (const [key, value] of Object.entries(all)) req.field(key, value);
    return req.attach('file', file, { filename: name, contentType: XLSX_MIME });
  };
  // Un .xlsx lleva su fecha de creación: para probar «el mismo archivo» hay que reutilizar los mismos bytes.
  const goodSales = () => xlsx(salesRows(['A-1', 'A-2']));

  it('AC-021-01 guarda el original, crea la carga en vista previa y no crea movimientos', async () => {
    const res = await send(await goodSales(), 'ventas septiembre.xlsx').expect(201);

    expect(res.body).toMatchObject({
      rowsRead: 2,
      rowsRejected: 0,
      rowsUnknownKiosk: 0,
      total: '300.00',
      upload: { status: 'previewed', source: 'parlevel_sales', month: '2026-09', companyId },
    });
    expect(res.body.upload.fileName).toBe('ventas septiembre.xlsx');
    expect(res.body.sample).toHaveLength(2);
    expect(res.body.sample[0]).toMatchObject({ row: 2, date: '2026-09-01', amount: '100.00' });
    expect(storage.files.size).toBe(1);
    expect(await t.db.ledgerEntry.count()).toBe(0);
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'upload.previewed' } });
    expect(event).toMatchObject({ entity: 'upload', entityId: res.body.upload.id });
    expect(JSON.stringify(event.data)).not.toContain('Sales');
  });

  it('AC-021-01 también acepta un .csv', async () => {
    const file = csv(salesRows(['A-1']));
    const res = await send(file, 'ventas.csv').expect(201);
    expect(res.body).toMatchObject({ rowsRead: 1, total: '100.00' });
  });

  it('AC-021-01 las filas ilegibles se rechazan con su motivo y el resto se lee', async () => {
    const rows = salesRows(['A-1', 'A-2']);
    rows.push(['A-1', 'no es fecha', 5, null]);
    const res = await send(await xlsx(rows), 'ventas.xlsx').expect(201);
    expect(res.body).toMatchObject({ rowsRead: 3, rowsRejected: 1 });
    expect(res.body.rejected).toEqual([{ row: 4, reason: 'Fecha inválida' }]);
  });

  it('AC-021-02 un archivo que no es .xlsx ni .csv responde 415 y no guarda nada', async () => {
    const res = await send(Buffer.from('%PDF-1.7 no soy una hoja'), 'factura.pdf').expect(415);
    expect(res.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(storage.files.size).toBe(0);
    expect(await t.db.sourceUpload.count()).toBe(0);
  });

  it('AC-021-02 un archivo de más de 4 MB responde 413 antes de guardarse', async () => {
    const big = Buffer.alloc(4 * 1024 * 1024 + 10, 0x61);
    const res = await send(big, 'enorme.csv').expect(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
    expect(storage.files.size).toBe(0);
  });

  it('AC-021-02 un ZIP que no es un libro de Excel responde 415', async () => {
    const fake = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const res = await send(fake, 'roto.xlsx').expect(415);
    expect(res.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('AC-021-02 sin archivo responde 400', async () => {
    const res = await admin
      .post('/api/closing/uploads')
      .field('companyId', companyId)
      .field('month', '2026-09')
      .field('source', 'parlevel_sales')
      .expect(400);
    expect(res.body.fieldErrors.file).toBeDefined();
  });

  it('AC-021-03 faltan columnas: 422 con la lista y no se guarda nada', async () => {
    const res = await send(
      await xlsx([
        ['Asset', 'Date'],
        ['A-1', '2026-09-01'],
      ]),
      'v.xlsx',
    ).expect(422);
    expect(res.body.code).toBe('SOURCE_MISSING_COLUMNS');
    expect(res.body.details.missing).toEqual(['Sales']);
    expect(storage.files.size).toBe(0);
    expect(await t.db.sourceUpload.count()).toBe(0);
    expect(await t.db.reportPeriod.count()).toBe(0);
  });

  it('AC-021-04 fechas de otro mes: 422 con el mes detectado', async () => {
    const res = await send(await goodSales(), 'v.xlsx', { month: '2026-10' }).expect(422);
    expect(res.body.code).toBe('SOURCE_WRONG_MONTH');
    expect(res.body.details).toEqual({ detected: '2026-09', expected: '2026-10' });
    expect(await t.db.sourceUpload.count()).toBe(0);
  });

  it('AC-021-05 un kiosko que no está en el catálogo queda sin kiosko y marcado, sin inventarlo', async () => {
    const res = await send(await xlsx(salesRows(['A-1', 'ZZ-9'])), 'v.xlsx').expect(201);
    expect(res.body.rowsUnknownKiosk).toBe(1);
    expect(res.body.sample[1]).toMatchObject({ kioskId: null, flags: ['UNKNOWN_KIOSK:ZZ-9'] });
    expect(await t.db.kiosk.count()).toBe(2);
  });

  it('AC-021-05 un kiosko de otra empresa no cuenta como conocido', async () => {
    const other = await t.db.company.create({ data: { name: 'Otra', nameKey: 'otra' } });
    await t.db.kiosk.create({ data: { companyId: other.id, name: 'KO', parlevelAsset: 'A-9' } });
    const res = await send(await xlsx(salesRows(['A-9'])), 'v.xlsx').expect(201);
    expect(res.body.sample[0].flags).toEqual(['UNKNOWN_KIOSK:A-9']);
  });

  it('AC-021-06 el mismo archivo ya confirmado responde 409 con quién y cuándo lo cargó', async () => {
    const file = await goodSales();
    const first = await send(file, 'v.xlsx').expect(201);
    await t.db.sourceUpload.update({
      where: { id: first.body.upload.id },
      data: { status: 'confirmed' },
    });

    const res = await send(file, 'otra copia.xlsx').expect(409);
    expect(res.body.code).toBe('DUPLICATE_UPLOAD');
    expect(res.body.details).toMatchObject({ uploadedBy: 'Ana Pruebas' });
    expect(res.body.details.at).toBeDefined();
    expect(res.body.message).toMatch(/Ana Pruebas/);
    expect(await t.db.sourceUpload.count()).toBe(1);
  });

  it('AC-021-06 el mismo archivo sin confirmar todavía no es duplicado', async () => {
    // Mismo contenido, aún sin confirmar: se puede volver a subir.
    const file = await goodSales();
    await send(file, 'v.xlsx').expect(201);
    await send(file, 'v.xlsx').expect(201);
  });

  it('AC-021-07 bank_csv sin cuenta, o con una cuenta de otra empresa, responde 400', async () => {
    const bank = csv([
      ['Fecha', 'Concepto', 'Retiros', 'Depósitos'],
      ['2026-09-03', 'ADT SECURITY', '100', ''],
    ]);
    const missing = await send(bank, 'banco.csv', { source: 'bank_csv' }).expect(400);
    expect(missing.body.fieldErrors.accountId).toBeDefined();

    const other = await t.db.company.create({ data: { name: 'Otra', nameKey: 'otra' } });
    const foreign = await t.db.bankAccount.create({
      data: { companyId: other.id, name: 'Ajena', type: 'checking' },
    });
    const wrong = await send(bank, 'banco.csv', {
      source: 'bank_csv',
      accountId: foreign.id,
    }).expect(400);
    expect(wrong.body.fieldErrors.accountId).toBeDefined();
    expect(await t.db.sourceUpload.count()).toBe(0);

    const ok = await send(bank, 'banco.csv', { source: 'bank_csv', accountId }).expect(201);
    expect(ok.body.upload.accountId).toBe(accountId);
    expect(ok.body.total).toBe('-100.00');
  });

  it('AC-021-01 una empresa inexistente responde 404', async () => {
    await send(await goodSales(), 'v.xlsx', { companyId: 'no-existe' }).expect(404);
  });

  it('AC-021-11 un periodo cerrado rechaza la carga con 409 PERIOD_CLOSED', async () => {
    await t.db.reportPeriod.create({ data: { companyId, month: '2026-09', status: 'closed' } });
    const res = await send(await goodSales(), 'v.xlsx').expect(409);
    expect(res.body.code).toBe('PERIOD_CLOSED');
    expect(storage.files.size).toBe(0);
  });

  it('AC-021-01 el listado de cargas del mes lo ve gerencia; otros roles no', async () => {
    const created = await send(await goodSales(), 'v.xlsx').expect(201);
    const manager = await t.agent('Gerente', 'manager');
    const res = await manager
      .get(`/api/closing/uploads?companyId=${companyId}&month=2026-09`)
      .expect(200);
    expect(res.body.items.map((u: { id: string }) => u.id)).toEqual([created.body.upload.id]);
    const payables = await t.agent('CxP', 'payables');
    await payables.get(`/api/closing/uploads?companyId=${companyId}&month=2026-09`).expect(403);
    await manager.post('/api/closing/uploads').expect(403);
  });
});
