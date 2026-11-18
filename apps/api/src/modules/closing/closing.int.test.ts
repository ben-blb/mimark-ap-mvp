import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EDO_RES_LINES, type EdoResLine } from '@mimark/contracts/closing';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { CLOSING_CATEGORIES } from './closing.catalog.js';

describe('base del cierre (spec 020)', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<TestApp['agent']>>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    admin = await t.agent();
  });

  const newCompany = async (name = 'Quima Tlalnepantla') =>
    (await admin.post('/api/closing/companies').send({ name }).expect(201)).body as {
      id: string;
      name: string;
    };
  const seedCategories = () => t.db.category.createMany({ data: [...CLOSING_CATEGORIES] });
  const firstCategory = () => t.db.category.findFirstOrThrow({ where: { code: 'SEGURIDAD' } });

  it('AC-020-02 manager lee pero no escribe (403 y nada se guarda); sin sesión, 401', async () => {
    const company = await newCompany();
    const manager = await t.agent('Gerente', 'manager');
    const eventsBefore = await t.db.auditEvent.count();

    const writes = [
      manager.post('/api/closing/companies').send({ name: 'Otra' }),
      manager.patch(`/api/closing/companies/${company.id}`).send({ active: false }),
      manager.post('/api/closing/kiosks').send({ companyId: company.id, name: 'Kiosko Uno' }),
      manager
        .post('/api/closing/accounts')
        .send({ companyId: company.id, name: 'C', type: 'master' }),
      manager.post('/api/closing/categories').send({}),
      manager.post('/api/closing/rules').send({}),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    expect(await t.db.company.count()).toBe(1);
    expect((await t.db.company.findUniqueOrThrow({ where: { id: company.id } })).active).toBe(true);
    expect(await t.db.auditEvent.count()).toBe(eventsBefore);

    for (const path of ['companies', 'kiosks', 'accounts', 'categories', 'rules']) {
      await manager.get(`/api/closing/${path}`).expect(200);
    }
    await manager.post('/api/closing/rules/test').send({ concept: 'ADT' }).expect(200);
    await t.http().get('/api/closing/companies').expect(401);
    await t.http().post('/api/closing/companies').send({ name: 'X' }).expect(401);
  });

  it('AC-020-03 crea la empresa activa con su auditoría y rechaza un nombre repetido', async () => {
    const company = await newCompany();
    expect(company).toMatchObject({ name: 'Quima Tlalnepantla', active: true });
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'company.created' } });
    expect(event).toMatchObject({ entity: 'company', entityId: company.id });

    const dup = await admin
      .post('/api/closing/companies')
      .send({ name: '  QUÍMA tlalnepantla ' })
      .expect(409);
    expect(dup.body.code).toBe('CONFLICT');
    expect(await t.db.company.count()).toBe(1);
  });

  it('AC-020-04 crea kioskos con sus IDs y rechaza repetirlos indicando el campo', async () => {
    const { id: companyId } = await newCompany();
    const kiosk = {
      companyId,
      name: 'Kiosko Plaza',
      parlevelAsset: 'A-1',
      cantaloupeDeviceId: 'D-1',
    };
    const created = await admin.post('/api/closing/kiosks').send(kiosk).expect(201);
    expect(created.body).toMatchObject({ ...kiosk, active: true });
    expect(await t.db.auditEvent.count({ where: { action: 'kiosk.created' } })).toBe(1);

    // Sin IDs también es válido y puede haber varios.
    await admin.post('/api/closing/kiosks').send({ companyId, name: 'Sin IDs 1' }).expect(201);
    await admin.post('/api/closing/kiosks').send({ companyId, name: 'Sin IDs 2' }).expect(201);

    const dupAsset = await admin
      .post('/api/closing/kiosks')
      .send({ companyId, name: 'Otro', parlevelAsset: 'A-1' })
      .expect(409);
    expect(dupAsset.body.code).toBe('CONFLICT');
    expect(dupAsset.body.fieldErrors.parlevelAsset).toBeDefined();

    const dupDevice = await admin
      .post('/api/closing/kiosks')
      .send({ companyId, name: 'Otro', cantaloupeDeviceId: 'D-1' })
      .expect(409);
    expect(dupDevice.body.fieldErrors.cantaloupeDeviceId).toBeDefined();
    expect(await t.db.kiosk.count()).toBe(3);
  });

  it('AC-020-04 un kiosko de una empresa inexistente responde 404', async () => {
    const res = await admin
      .post('/api/closing/kiosks')
      .send({ companyId: 'no-existe', name: 'Kiosko Uno' })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('AC-020-05 crea cuentas con los últimos 4 dígitos y rechaza otro formato', async () => {
    const { id: companyId } = await newCompany();
    const ok = await admin
      .post('/api/closing/accounts')
      .send({ companyId, name: 'Cheques BBVA', type: 'checking', last4: '4321' })
      .expect(201);
    expect(ok.body).toMatchObject({ type: 'checking', last4: '4321', active: true });
    expect(await t.db.auditEvent.count({ where: { action: 'account.created' } })).toBe(1);

    const bad = await admin
      .post('/api/closing/accounts')
      .send({ companyId, name: 'Crédito', type: 'credit', last4: '1234567890123456' })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION');
    expect(bad.body.fieldErrors.last4).toBeDefined();
    expect(await t.db.bankAccount.count()).toBe(1);
  });

  it('AC-020-06 desactivar saca el registro de los listados salvo con includeInactive', async () => {
    const company = await newCompany();
    const kiosk = (
      await admin
        .post('/api/closing/kiosks')
        .send({ companyId: company.id, name: 'Kiosko Uno' })
        .expect(201)
    ).body;
    const account = (
      await admin
        .post('/api/closing/accounts')
        .send({ companyId: company.id, name: 'Maestra', type: 'master' })
        .expect(201)
    ).body;

    for (const [path, id] of [
      ['kiosks', kiosk.id],
      ['accounts', account.id],
      ['companies', company.id],
    ] as const) {
      const res = await admin
        .patch(`/api/closing/${path}/${id}`)
        .send({ active: false })
        .expect(200);
      expect(res.body.active).toBe(false);
      expect((await admin.get(`/api/closing/${path}`).expect(200)).body.items).toHaveLength(0);
      const all = await admin.get(`/api/closing/${path}?includeInactive=true`).expect(200);
      expect(all.body.items).toHaveLength(1);
    }
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'company.updated' } });
    expect(event.data).toEqual({ changes: { active: { from: true, to: false } } });
    await admin.delete(`/api/closing/companies/${company.id}`).expect(404);
  });

  it('AC-020-06 editar un registro que no existe responde 404', async () => {
    await admin.patch('/api/closing/companies/nada').send({ name: 'Algo' }).expect(404);
  });

  it('AC-020-07 las categorías vienen ordenadas por renglón y orden, con code, renglón y tipo', async () => {
    await seedCategories();
    const res = await admin.get('/api/closing/categories').expect(200);
    const items = res.body.items as { code: string; edoResLine: string; kind: string }[];
    expect(items).toHaveLength(CLOSING_CATEGORIES.length);
    expect(items[0]).toMatchObject({ code: 'VENTAS', edoResLine: 'Ventas', kind: 'income' });
    const positions = items.map((c) => EDO_RES_LINES.indexOf(c.edoResLine as EdoResLine));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('AC-020-08 crea una categoría con code único y rechaza un renglón desconocido', async () => {
    const body = {
      code: 'LIMPIEZA',
      name: 'Limpieza',
      edoResLine: 'Papelería y MKT',
      kind: 'expense',
    };
    const created = await admin.post('/api/closing/categories').send(body).expect(201);
    expect(created.body).toMatchObject(body);
    expect(await t.db.auditEvent.count({ where: { action: 'category.created' } })).toBe(1);

    const dup = await admin.post('/api/closing/categories').send(body).expect(409);
    expect(dup.body.code).toBe('CONFLICT');
    const bad = await admin
      .post('/api/closing/categories')
      .send({ ...body, code: 'OTRA', edoResLine: 'Inventado' })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION');
    expect(await t.db.category.count()).toBe(1);
  });

  it('AC-020-09 crea una regla y rechaza un patrón de menos de 3 caracteres', async () => {
    await seedCategories();
    const category = await firstCategory();
    const created = await admin
      .post('/api/closing/rules')
      .send({ pattern: 'ADT SECURITY', categoryId: category.id, priority: 10 })
      .expect(201);
    expect(created.body).toMatchObject({ pattern: 'ADT SECURITY', priority: 10, active: true });
    expect(await t.db.auditEvent.count({ where: { action: 'rule.created' } })).toBe(1);

    for (const pattern of ['', 'ab', '  a ']) {
      const res = await admin
        .post('/api/closing/rules')
        .send({ pattern, categoryId: category.id })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION');
    }
    await admin
      .post('/api/closing/rules')
      .send({ pattern: 'TELCEL', categoryId: 'no-existe' })
      .expect(404);
    expect(await t.db.classificationRule.count()).toBe(1);
  });

  it('AC-020-11 probar un concepto devuelve la regla y categoría ganadoras sin escribir nada', async () => {
    await seedCategories();
    const category = await firstCategory();
    await admin
      .post('/api/closing/rules')
      .send({ pattern: 'ADT SECURITY', categoryId: category.id })
      .expect(201);
    const eventsBefore = await t.db.auditEvent.count();

    const hit = await admin
      .post('/api/closing/rules/test')
      .send({ concept: 'adt  security CR MU RFC:XXX' })
      .expect(200);
    expect(hit.body.rule).toMatchObject({ pattern: 'ADT SECURITY' });
    expect(hit.body.category).toMatchObject({ code: 'SEGURIDAD' });

    const miss = await admin
      .post('/api/closing/rules/test')
      .send({ concept: 'COMPRA FERRETERIA' })
      .expect(200);
    expect(miss.body).toEqual({ rule: null, category: null });

    await admin.post('/api/closing/rules/test').send({ concept: '' }).expect(400);
    expect(await t.db.auditEvent.count()).toBe(eventsBefore);
    expect(await t.db.classificationRule.count()).toBe(1);
  });
});
