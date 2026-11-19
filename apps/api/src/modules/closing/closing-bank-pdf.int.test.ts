import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { MemoryStorage } from '../../../test/doubles.js';
import { BankExtractionClient } from '../../integrations/bank-extraction.client.js';
import { fakeBankExtraction } from '../../integrations/fake-bank-extraction.js';
import { StorageClient } from '../../integrations/storage.client.js';

/** Como el modo `fake`, pero deja fallar a voluntad y contar las llamadas al modelo. */
class ControlledExtractor {
  failNext = 0;
  calls = 0;
  async extract(input: { bytes: Buffer; fileName: string }) {
    this.calls += 1;
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('Falla simulada');
    }
    return {
      data: fakeBankExtraction(input.fileName),
      model: 'fake',
      promptVersion: 'fake',
      ms: 1,
    };
  }
}

const MONTH = '2026-10';
const pdf = (tag: string) => Buffer.from(`%PDF-1.7 estado de cuenta sintético ${tag}`);

describe('estado de cuenta en PDF (spec 022)', () => {
  let t: TestApp;
  let storage: MemoryStorage;
  let ai: ControlledExtractor;
  let admin: Awaited<ReturnType<TestApp['agent']>>;
  let companyId: string;
  let accountId: string;

  beforeAll(async () => {
    storage = new MemoryStorage();
    ai = new ControlledExtractor();
    t = await createTestApp((b) =>
      b
        .overrideProvider(StorageClient)
        .useValue(storage)
        .overrideProvider(BankExtractionClient)
        .useValue(ai),
    );
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    storage.files.clear();
    ai.failNext = 0;
    ai.calls = 0;
    admin = await t.agent();
    companyId = (await t.db.company.create({ data: { name: 'Quima', nameKey: 'quima' } })).id;
    accountId = (
      await t.db.bankAccount.create({ data: { companyId, name: 'Cheques', type: 'checking' } })
    ).id;
  });

  const send = (
    name = 'estado.pdf',
    content = pdf(name),
    fields: Record<string, string> = {},
    agent: typeof admin = admin,
  ) => {
    const req = agent.post('/api/closing/uploads/bank-pdf');
    for (const [k, v] of Object.entries({ companyId, month: MONTH, accountId, ...fields })) {
      if (v !== '') req.field(k, v);
    }
    return req.attach('file', content, { filename: name, contentType: 'application/pdf' });
  };
  const confirm = (id: string, body: object = {}) =>
    admin.post(`/api/closing/uploads/${id}/confirm`).send(body);
  const edit = (id: string, rows: object[]) =>
    admin.patch(`/api/closing/uploads/${id}/draft`).send({ rows });
  const actions = async () =>
    (await t.db.auditEvent.findMany({ where: { entity: 'upload' }, orderBy: { at: 'asc' } })).map(
      (e) => e.action,
    );

  it('AC-022-01 guarda el original, responde un borrador en vista previa y no crea movimientos', async () => {
    const res = await send().expect(201);

    expect(res.body.upload).toMatchObject({
      status: 'previewed',
      source: 'bank_pdf',
      month: MONTH,
      companyId,
      accountId,
      rowsRead: 3,
    });
    expect(storage.files.size).toBe(1);
    expect(await t.db.ledgerEntry.count()).toBe(0);
  });

  it('AC-022-01 valida firma PDF, cuenta, periodo cerrado y permiso', async () => {
    await send('nota.pdf', Buffer.from('no soy pdf')).expect(415);
    const noAccount = await send('estado.pdf', pdf('a'), { accountId: '' }).expect(400);
    expect(noAccount.body.fieldErrors).toHaveProperty('accountId');
    await send('estado.pdf', pdf('a'), { accountId: 'ajena' }).expect(400);
    const warehouse = await t.agent('Beto', 'warehouse');
    await send('estado.pdf', pdf('a'), {}, warehouse).expect(403);
    expect(ai.calls).toBe(0);

    await t.db.reportPeriod.create({ data: { companyId, month: MONTH, status: 'closed' } });
    const closed = await send().expect(409);
    expect(closed.body.code).toBe('PERIOD_CLOSED');
  });

  it('AC-022-01 el mismo PDF ya confirmado responde DUPLICATE_UPLOAD', async () => {
    const content = pdf('igual');
    const id = (await send('estado.pdf', content).expect(201)).body.upload.id;
    await confirm(id).expect(200);
    const again = await send('estado.pdf', content).expect(409);
    expect(again.body.code).toBe('DUPLICATE_UPLOAD');
  });

  it('AC-022-02 el borrador trae saldos y filas con fecha AAAA-MM-DD e importes de 2 decimales', async () => {
    const res = await send().expect(201);

    expect(res.body).toMatchObject({ openingBalance: '233214.38', closingBalance: '233289.38' });
    expect(res.body.rows).toHaveLength(3);
    expect(res.body.rows[0]).toMatchObject({
      row: 1,
      date: '2026-10-02',
      concept: 'SPEI RECIBIDO KIOSKO CENTRO',
      withdrawal: null,
      deposit: '100.00',
      balance: '233314.38',
      discarded: false,
      flags: [],
    });
    expect(res.body.rows[1]).toMatchObject({ withdrawal: '50.00', deposit: null });
    expect(res.body.balanceCheck).toEqual({ ok: true, difference: '0.00' });
    expect(res.body.warnings).toEqual([]);
  });

  it('AC-022-03 un borrador que no cuadra no se confirma, salvo aceptando la diferencia (queda en auditoría)', async () => {
    const res = await send('descuadre.pdf').expect(201);
    const id = res.body.upload.id as string;
    expect(res.body.balanceCheck).toEqual({ ok: false, difference: '0.01' });

    const blocked = await confirm(id).expect(409);
    expect(blocked.body.code).toBe('REVIEW_REQUIRED');
    expect(await t.db.ledgerEntry.count()).toBe(0);

    await confirm(id, { acceptDifference: true }).expect(200);
    expect(await t.db.ledgerEntry.count()).toBe(3);
    const accepted = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'upload.balance-accepted' },
    });
    expect(accepted.data).toMatchObject({ difference: '0.01' });
  });

  it('AC-022-03 corregir una fila para que cuadre permite confirmar sin aceptar la diferencia', async () => {
    const res = await send('descuadre.pdf').expect(201);
    const id = res.body.upload.id as string;

    const fixed = await edit(id, [{ row: 3, deposit: '25.01' }]).expect(200);
    expect(fixed.body.balanceCheck).toEqual({ ok: true, difference: '0.00' });
    await confirm(id).expect(200);
    expect(await actions()).not.toContain('upload.balance-accepted');
  });

  it('AC-022-04 la fila cuyo saldo corrido rompe la secuencia se marca UNCERTAIN', async () => {
    const res = await send('secuencia-rota.pdf').expect(201);

    expect(res.body.rows[0].flags).toEqual([]);
    expect(res.body.rows[1].flags).toContain('UNCERTAIN');
  });

  it('AC-022-05 las filas de otro mes se marcan y no se vuelven movimientos; no hay SOURCE_WRONG_MONTH', async () => {
    const res = await send('otro-mes.pdf').expect(201);

    expect(res.body.rows[3]).toMatchObject({ date: '2026-11-02', flags: ['OUT_OF_MONTH'] });
    expect(res.body.upload).toMatchObject({ rowsRead: 4, rowsRejected: 1 });
    expect(res.body.balanceCheck.ok).toBe(true);

    await confirm(res.body.upload.id).expect(200);
    expect(await t.db.ledgerEntry.count()).toBe(3);
  });

  it('AC-022-05 avisa OPENING_BALANCE_MISMATCH si el saldo inicial no es el cierre confirmado del mes anterior', async () => {
    const previous = async (closing: string) => {
      await t.db.sourceUpload.deleteMany();
      await t.db.reportPeriod.deleteMany();
      const period = await t.db.reportPeriod.create({ data: { companyId, month: '2026-09' } });
      await t.db.sourceUpload.create({
        data: {
          periodId: period.id,
          source: 'bank_pdf',
          accountId,
          fileKey: 'k',
          fileName: 'sep.pdf',
          sha256: 'x',
          status: 'confirmed',
          uploadedBy: 'Ana Pruebas',
          rowsRead: 0,
          rowsRejected: 0,
          draft: { openingBalance: '0.00', closingBalance: closing, rows: [] },
        },
      });
    };
    await previous('999.00');
    const mismatch = await send('estado.pdf', pdf('m1')).expect(201);
    expect(mismatch.body.warnings).toEqual(['OPENING_BALANCE_MISMATCH']);
    expect(mismatch.body.upload.status).toBe('previewed');

    await previous('233214.38');
    const match = await send('estado.pdf', pdf('m2')).expect(201);
    expect(match.body.warnings).toEqual([]);
  });

  it('AC-022-06 edita o descarta filas, recalcula balanceCheck y no toca el original ni la salida de la IA', async () => {
    const created = await send().expect(201);
    const id = created.body.upload.id as string;
    const before = await t.db.sourceUpload.findUniqueOrThrow({ where: { id } });

    const res = await edit(id, [
      { row: 1, deposit: '120.00', concept: 'SPEI CORREGIDO' },
      { row: 3, discarded: true },
    ]).expect(200);

    expect(res.body.rows[0]).toMatchObject({ deposit: '120.00', concept: 'SPEI CORREGIDO' });
    expect(res.body.rows[2].discarded).toBe(true);
    // 233214.38 + 120 − 50 = 233284.38 contra el cierre impreso 233289.38.
    expect(res.body.balanceCheck).toEqual({ ok: false, difference: '5.00' });
    const after = await t.db.sourceUpload.findUniqueOrThrow({ where: { id } });
    expect(after.meta).toEqual(before.meta);
    expect(after.fileKey).toBe(before.fileKey);
    expect(storage.files.size).toBe(1);
    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'upload.draft-edited' },
    });
    expect(JSON.stringify(event.data)).not.toContain('CORREGIDO');
  });

  it('AC-022-06 rechaza ediciones inválidas, filas inexistentes y borradores ya confirmados', async () => {
    const id = (await send().expect(201)).body.upload.id as string;

    const both = await edit(id, [{ row: 1, withdrawal: '5.00' }]).expect(400);
    expect(both.body.code).toBe('VALIDATION');
    expect(both.body.fieldErrors).toHaveProperty('rows.0.deposit');
    await edit(id, [{ row: 1, date: '2026-13-40' }]).expect(400);
    await edit(id, [{ row: 99, concept: 'x' }]).expect(400);
    await admin
      .patch('/api/closing/uploads/no-existe/draft')
      .send({ rows: [{ row: 1, concept: 'x' }] })
      .expect(404);

    await confirm(id).expect(200);
    const late = await edit(id, [{ row: 1, concept: 'tarde' }]).expect(409);
    expect(late.body.code).toBe('CONFLICT');
  });

  it('AC-022-07 confirmar crea los movimientos con origen bank_pdf y fila, y audita modelo, prompt y duración', async () => {
    const id = (await send().expect(201)).body.upload.id as string;

    const res = await confirm(id).expect(200);

    expect(res.body).toMatchObject({ id, status: 'confirmed', entriesCount: 3 });
    const rows = await t.db.ledgerEntry.findMany({ orderBy: { rowNumber: 'asc' } });
    expect(rows.map((r) => [r.rowNumber, r.amount.toFixed(2), r.source, r.uploadId])).toEqual([
      [1, '100.00', 'bank_pdf', id],
      [2, '-50.00', 'bank_pdf', id],
      [3, '25.00', 'bank_pdf', id],
    ]);
    expect(rows[0]).toMatchObject({ accountId, kioskId: null, createdBy: 'Ana Pruebas' });
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'upload.confirmed' } });
    expect(event.data).toMatchObject({ entries: 3, model: 'fake', promptVersion: 'fake', ms: 1 });
  });

  it('AC-022-07 cargar y confirmar otro PDF de la misma cuenta y mes reemplaza al anterior sin duplicar', async () => {
    const first = (await send('estado.pdf', pdf('uno')).expect(201)).body.upload.id as string;
    await confirm(first).expect(200);
    const second = (await send('otro-mes.pdf', pdf('dos')).expect(201)).body.upload.id as string;

    await confirm(second).expect(200);

    expect((await t.db.sourceUpload.findUniqueOrThrow({ where: { id: first } })).status).toBe(
      'superseded',
    );
    const rows = await t.db.ledgerEntry.findMany();
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.uploadId))).toEqual(new Set([second]));
  });

  it('AC-022-08 si el modelo falla responde AI_UNAVAILABLE, deja la carga en failed y reintentar no duplica la carga ni la cuota', async () => {
    ai.failNext = 1;
    const content = pdf('reintento');
    const failed = await send('estado.pdf', content).expect(502);
    expect(failed.body.code).toBe('AI_UNAVAILABLE');
    const [upload] = await t.db.sourceUpload.findMany();
    expect(upload).toMatchObject({ status: 'failed', source: 'bank_pdf' });
    expect(await t.db.ledgerEntry.count()).toBe(0);
    expect(await actions()).toEqual(['upload.bank-pdf-failed']);

    const retried = await send('estado.pdf', content).expect(201);

    expect(retried.body.upload).toMatchObject({ id: upload!.id, status: 'previewed' });
    expect(await t.db.sourceUpload.count()).toBe(1);
    expect(storage.files.size).toBe(1);
    expect(await t.db.auditEvent.count({ where: { action: 'upload.bank-pdf-extracted' } })).toBe(1);
  });

  it('AC-022-08 un PDF sin movimientos legibles también queda en failed', async () => {
    const res = await send('sin-filas.pdf').expect(502);

    expect(res.body.code).toBe('AI_UNAVAILABLE');
    expect((await t.db.sourceUpload.findFirstOrThrow()).status).toBe('failed');
    expect(await t.db.ledgerEntry.count()).toBe(0);
  });

  it('AC-022-09 superada la cuota de IA responde 429 sin llamar al modelo; los fallos no cuentan', async () => {
    ai.failNext = 3;
    for (const tag of ['a', 'b', 'c']) await send('estado.pdf', pdf(tag)).expect(502);
    expect(ai.calls).toBe(3);

    await t.db.auditEvent.createMany({
      data: Array.from({ length: 30 }, () => ({
        actor: 'Ana Pruebas',
        requestId: 'previo',
        entity: 'upload',
        action: 'upload.bank-pdf-extracted',
      })),
    });
    const res = await send('estado.pdf', pdf('d')).expect(429);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(ai.calls).toBe(3);
  });

  it('AC-022-10 un PDF que da órdenes solo es texto: no cambia ningún estado y el concepto queda como dato', async () => {
    const res = await send('inyeccion.pdf').expect(201);

    expect(res.body.rows[0].concept).toContain('IGNORA LO ANTERIOR');
    expect(res.body.balanceCheck.ok).toBe(true);
    expect((await t.db.sourceUpload.findMany()).map((u) => u.status)).toEqual(['previewed']);
    expect(await t.db.ledgerEntry.count()).toBe(0);
    expect(await actions()).toEqual(['upload.bank-pdf-extracted']);

    await confirm(res.body.upload.id).expect(200);
    const [first] = await t.db.ledgerEntry.findMany({ orderBy: { rowNumber: 'asc' } });
    expect(first).toMatchObject({ source: 'bank_pdf', needsReview: false });
    expect(first!.amount.toFixed(2)).toBe('100.00');
  });

  it('AC-022-11 los números de tarjeta y cuenta se guardan solo con sus últimos 4 dígitos', async () => {
    const res = await send('tarjeta.pdf').expect(201);
    const id = res.body.upload.id as string;

    expect(res.body.rows[0].concept).toBe('COMPRA TARJETA ****5678 GASOLINERA');
    expect(res.body.rows[2].concept).toBe('SPEI A CUENTA ****4567');
    await edit(id, [{ row: 2, concept: 'REF 4000 1234 5678 9010' }]).expect(200);
    await confirm(id).expect(200);

    const stored = await t.db.sourceUpload.findUniqueOrThrow({ where: { id } });
    const everything = JSON.stringify([
      stored.draft,
      stored.meta,
      await t.db.ledgerEntry.findMany(),
      await t.db.auditEvent.findMany(),
    ]);
    for (const full of ['4152', '3131', '1234 5678', '0123456789', '4000', '9010 ']) {
      expect(everything).not.toContain(full);
    }
    expect(everything).toContain('****9010');
  });
});
