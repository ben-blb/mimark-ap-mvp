import type { Prisma } from '../../generated/prisma/client.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { MemoryStorage } from '../../../test/doubles.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { CLOSING_CATEGORIES } from '../closing/closing.catalog.js';
import { normalizeKey } from '../closing/closing.rules.js';

type Entry = Partial<Prisma.LedgerEntryUncheckedCreateInput> & { concept: string; amount: string };

describe('reportes del cierre (spec 024)', () => {
  let t: TestApp;
  let storage: MemoryStorage;
  let admin: Awaited<ReturnType<TestApp['agent']>>;
  let companyId: string;
  let periodId: string;
  let k1: string;
  let k2: string;
  const cat: Record<string, string> = {};

  beforeAll(async () => {
    storage = new MemoryStorage();
    t = await createTestApp((b) => b.overrideProvider(StorageClient).useValue(storage));
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    storage.files.clear();
    admin = await t.agent();
    await t.db.category.createMany({ data: [...CLOSING_CATEGORIES] });
    for (const c of await t.db.category.findMany()) cat[c.code] = c.id;
    companyId = (await t.db.company.create({ data: { name: 'Quima', nameKey: 'quima' } })).id;
    periodId = (await t.db.reportPeriod.create({ data: { companyId, month: '2026-09' } })).id;
    k1 = (await t.db.kiosk.create({ data: { companyId, name: 'Alfa' } })).id;
    k2 = (await t.db.kiosk.create({ data: { companyId, name: 'Beta' } })).id;
  });

  const entry = (code: string | null, amount: string, extra: Partial<Entry> = {}) =>
    t.db.ledgerEntry.create({
      data: {
        periodId,
        date: new Date('2026-09-10'),
        source: 'bank_csv',
        createdBy: 'Ana Pruebas',
        concept: 'x',
        categoryId: code ? (cat[code] as string) : null,
        amount,
        ...extra,
      },
    });
  /** El ejemplo de AC-024-01: ventas 463,989.77 y costo 281,893.94. */
  const seedExample = async () => {
    await entry('VENTAS', '400000.00', { source: 'parlevel_sales', kioskId: k1 });
    await entry('VENTAS', '63989.77', { source: 'parlevel_sales', kioskId: k2 });
    await entry('COSTO_VENDIDO', '-281893.94', { concept: 'COCA COLA FEMSA' });
  };
  const edo = (query = '') =>
    admin.get(`/api/reports/edo-res?companyId=${companyId}&month=2026-09${query}`);
  const row = (rows: { key: string }[], key: string) =>
    rows.find((r) => r.key === key) as Record<string, string | null>;

  it('AC-024-01 el EDO RES trae los renglones en orden con importe y porcentaje', async () => {
    await seedExample();
    const res = await edo().expect(200);
    const keys = res.body.rows.map((r: { key: string }) => r.key);
    expect(keys.indexOf('net_sales')).toBeLessThan(keys.indexOf('cost'));
    expect(keys.at(-1)).toBe('net_profit');
    expect(row(res.body.rows, 'net_sales')).toMatchObject({ amount: '463989.77', percentOfSales: '100.00' });
    expect(row(res.body.rows, 'cost')?.amount).toBe('281893.94');
    expect(row(res.body.rows, 'gross_profit')).toMatchObject({
      amount: '182095.83',
      percentOfSales: '39.25',
    });
  });

  it('AC-024-02 con movimientos por clasificar es provisional y los muestra; cerrado es final', async () => {
    await seedExample();
    await entry(null, '-10.50', { needsReview: true });
    const open = await edo().expect(200);
    expect(open.body.status).toBe('provisional');
    expect(row(open.body.rows, 'unclassified')).toMatchObject({
      label: 'Por clasificar',
      amount: '-10.50',
    });

    await t.db.reportPeriod.update({ where: { id: periodId }, data: { status: 'closed' } });
    const closed = await edo().expect(200);
    expect(closed.body.status).toBe('final');
  });

  it('AC-024-03 los traspasos, Cantaloupe y su cobranza no entran y la neta es la suma exacta', async () => {
    await seedExample();
    await entry(null, '-5000.00', { kind: 'internal_transfer' });
    await entry(null, '5000.00', { kind: 'internal_transfer' });
    await entry('VENTAS', '999.00', { source: 'cantaloupe' });
    await entry('COBRANZA_CANTALOUPE', '7777.00');
    await entry('RENTAS', '-0.10');
    await entry('RENTAS', '-0.20');
    const { rows } = (await edo().expect(200)).body;
    expect(row(rows, 'net_sales')?.amount).toBe('463989.77');
    expect(row(rows, 'Rentas')?.amount).toBe('0.30');
    expect(row(rows, 'net_profit')?.amount).toBe('182095.53');
  });

  it('AC-024-04 un mes sin datos responde 200 con ceros y status empty; empresa inexistente, 404', async () => {
    const res = await admin
      .get(`/api/reports/edo-res?companyId=${companyId}&month=2026-01`)
      .expect(200);
    expect(res.body.status).toBe('empty');
    expect(res.body.rows.every((r: { amount: string }) => r.amount === '0.00')).toBe(true);
    await admin.get('/api/reports/edo-res?companyId=nope&month=2026-09').expect(404);
    await admin.get(`/api/reports/edo-res?companyId=${companyId}&month=septiembre`).expect(400);
  });

  it('AC-024-05 compareTo agrega el importe anterior y la diferencia', async () => {
    await seedExample();
    const before = (
      await t.db.reportPeriod.create({ data: { companyId, month: '2026-08' } })
    ).id;
    await t.db.ledgerEntry.create({
      data: {
        periodId: before,
        date: new Date('2026-08-10'),
        source: 'parlevel_sales',
        createdBy: 'Ana',
        concept: 'x',
        categoryId: cat.VENTAS as string,
        amount: '400000.00',
      },
    });
    const { rows, compareTo } = (await edo('&compareTo=2026-08').expect(200)).body;
    expect(compareTo).toBe('2026-08');
    expect(row(rows, 'net_sales')).toMatchObject({ previousAmount: '400000.00', delta: '63989.77' });
    expect((await edo().expect(200)).body.rows[0].previousAmount).toBeUndefined();
  });

  it('AC-024-06 el detalle de un renglón suma exactamente su importe, con origen, paginado', async () => {
    const upload = await t.db.sourceUpload.create({
      data: {
        periodId,
        source: 'bank_csv',
        fileKey: 'test/1',
        fileName: 'banco septiembre.csv',
        sha256: 'x',
        uploadedBy: 'Ana',
        rowsRead: 3,
        rowsRejected: 0,
        status: 'confirmed',
      },
    });
    const account = await t.db.bankAccount.create({
      data: { companyId, name: 'Cheques', type: 'checking' },
    });
    for (const [i, amount] of ['-100.10', '-200.20', '-300.30'].entries()) {
      await entry('RENTAS', amount, {
        uploadId: upload.id,
        rowNumber: i + 2,
        accountId: account.id,
        kioskId: k1,
        concept: `=RENTA ${i}`,
      });
    }
    const url = `/api/reports/edo-res/lines/${encodeURIComponent('Rentas')}/entries?companyId=${companyId}&month=2026-09`;
    const all = (await admin.get(url).expect(200)).body;
    expect(all.amount).toBe('600.60');
    expect(all.total).toBe(3);
    expect(all.items[0]).toMatchObject({
      date: '2026-09-10',
      concept: '=RENTA 0',
      kioskName: 'Alfa',
      accountName: 'Cheques',
      fileName: 'banco septiembre.csv',
      rowNumber: 2,
      amount: '100.10',
    });
    const cents = all.items.reduce(
      (acc: number, i: { amount: string }) => acc + Math.round(Number(i.amount) * 100),
      0,
    );
    expect(cents).toBe(60060);
    expect(row((await edo().expect(200)).body.rows, 'Rentas')?.amount).toBe(all.amount);

    const page2 = (await admin.get(`${url}&pageSize=2&page=2`).expect(200)).body;
    expect(page2.items).toHaveLength(1);
    expect(page2).toMatchObject({ total: 3, page: 2, pageSize: 2 });

    await admin
      .get(`/api/reports/edo-res/lines/Inventada/entries?companyId=${companyId}&month=2026-09`)
      .expect(404);
    const unclassified = await admin
      .get(
        `/api/reports/edo-res/lines/${encodeURIComponent('Por clasificar')}/entries?companyId=${companyId}&month=2026-09`,
      )
      .expect(200);
    expect(unclassified.body.items).toEqual([]);
  });

  it('AC-024-07 el archivo de origen se descarga con cabeceras seguras; uno inexistente es 404', async () => {
    storage.files.set('test/1', Buffer.from('fecha,monto\n'));
    const upload = await t.db.sourceUpload.create({
      data: {
        periodId,
        source: 'bank_csv',
        fileKey: 'test/1',
        fileName: 'Banco ñ.csv',
        sha256: 'x',
        uploadedBy: 'Ana',
        rowsRead: 1,
        rowsRejected: 0,
        status: 'confirmed',
      },
    });
    const res = await admin.get(`/api/reports/uploads/${upload.id}/file`).expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe(
      "attachment; filename*=UTF-8''Banco%20%C3%B1.csv",
    );
    await admin.get('/api/reports/uploads/no-existe/file').expect(404);
  });

  it('AC-024-08 el detalle de un renglón agrupado trae el subtotal por categoría', async () => {
    await entry('VENTAS', '100.00', { source: 'parlevel_sales' });
    await entry('OTROS_INGRESOS', '5.00');
    await entry('OTROS_INGRESOS', '2.50');
    await entry('COBRANZA_CANTALOUPE', '900.00');
    const url = `/api/reports/edo-res/lines/${encodeURIComponent('Otros ingresos')}/entries?companyId=${companyId}&month=2026-09`;
    const { body } = await admin.get(url).expect(200);
    expect(body.categories).toEqual([
      { code: 'OTROS_INGRESOS', name: 'Otros ingresos', amount: '7.50', count: 2 },
    ]);
    expect(body.amount).toBe('7.50');
  });

  describe('kioskos', () => {
    const kiosks = () =>
      admin.get(`/api/reports/kiosks?companyId=${companyId}&month=2026-09`).expect(200);

    beforeEach(async () => {
      await entry('VENTAS', '1000.00', { source: 'parlevel_sales', kioskId: k1 });
      await entry('COSTO_VENDIDO', '-600.00', { kioskId: k1 });
      await entry('MERMAS', '-20.00', { source: 'parlevel_waste', kioskId: k1 });
      await entry('ROBOS', '-10.00', { source: 'parlevel_waste', kioskId: k1 });
      await entry('FEE_CANTALOUPE', '-5.00', { kioskId: k1 });
      await entry('VENTAS', '100.00', { source: 'parlevel_sales', kioskId: k2 });
      await entry('COSTO_VENDIDO', '-300.00', { kioskId: k2 });
      await entry('VENTAS', '20.00', { source: 'parlevel_sales' });
      await entry('RENTAS', '-40.00', { kioskId: k1 });
      await entry('IMPUESTOS', '-3.00');
    });

    it('AC-024-09 trae ventas, costo, margen, mermas, robos, comisiones y la fila «Sin kiosko»', async () => {
      const { body } = await kiosks();
      expect(body.rows.map((r: { name: string }) => r.name)).toEqual(['Alfa', 'Beta', 'Sin kiosko']);
      expect(body.rows[0]).toMatchObject({
        sales: '1000.00',
        cost: '600.00',
        margin: '400.00',
        marginPercent: '40.00',
        waste: '20.00',
        theft: '10.00',
        commissions: '5.00',
        profitBeforeOverhead: '365.00',
      });
      expect(body.rows[2]).toMatchObject({ kioskId: null, sales: '20.00' });
      const edoRows = (await edo().expect(200)).body.rows;
      expect(body.totals.sales).toBe(row(edoRows, 'net_sales')?.amount);
      const net =
        Math.round(Number(body.totals.profitBeforeOverhead) * 100) -
        Math.round(Number(body.overhead) * 100) +
        Math.round(Number(body.unclassified) * 100);
      expect(net / 100).toBe(Number(row(edoRows, 'net_profit')?.amount));
    });

    it('AC-024-10 y 11 marca el margen negativo y deja los gastos generales aparte, sin prorratear', async () => {
      const { body } = await kiosks();
      expect(body.rows[1]).toMatchObject({ margin: '-200.00', negativeMargin: true });
      expect(body.rows[0].negativeMargin).toBe(false);
      expect(body.overhead).toBe('43.00');
    });
  });

  describe('proveedores', () => {
    const rule = (pattern: string, code = 'COSTO_VENDIDO', priority = 0) =>
      t.db.classificationRule.create({
        data: {
          pattern,
          patternKey: normalizeKey(pattern),
          categoryId: cat[code] as string,
          priority,
        },
      });
    const suppliers = () =>
      admin.get(`/api/reports/suppliers?companyId=${companyId}&month=2026-09`).expect(200);

    it('AC-024-12 pago total, número, promedio, porcentaje y primer y último pago por proveedor', async () => {
      await rule('COCA COLA');
      await rule('BIMBO');
      await entry('COSTO_VENDIDO', '-300.00', { concept: 'PAGO COCA COLA FEMSA', date: new Date('2026-09-12') });
      await entry('COSTO_VENDIDO', '-100.00', { concept: 'COCA COLA', date: new Date('2026-09-03') });
      await entry('COSTO_VENDIDO', '-100.00', { concept: 'BIMBO SA' });
      const { body } = await suppliers();
      expect(body.totalSpend).toBe('500.00');
      expect(body.rows[0]).toEqual({
        name: 'COCA COLA',
        total: '400.00',
        count: 2,
        average: '200.00',
        percentOfSpend: '80.00',
        firstPaymentOn: '2026-09-03',
        lastPaymentOn: '2026-09-12',
      });
    });

    it('AC-024-13 los egresos sin regla de proveedor, de otra categoría o traspasos no aparecen', async () => {
      await rule('COCA COLA');
      await entry('COSTO_VENDIDO', '-50.00', { concept: 'PROVEEDOR SIN REGLA' });
      await entry('RENTAS', '-50.00', { concept: 'COCA COLA' });
      await entry('COSTO_VENDIDO', '-50.00', { concept: 'COCA COLA', kind: 'internal_transfer' });
      expect((await suppliers()).body.rows).toEqual([]);
    });
  });
});
