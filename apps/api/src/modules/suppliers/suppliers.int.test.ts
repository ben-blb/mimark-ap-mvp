import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';

const norte = {
  name: 'Distribuidora Alimentos del Norte SA de CV',
  taxId: 'DAN010203AB1',
  creditDays: 15,
  currency: 'MXN',
};

describe('proveedores (spec 002)', () => {
  let t: TestApp;
  let agent: Awaited<ReturnType<TestApp['agent']>>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    agent = await t.agent();
  });

  it('AC-002-01 registra un proveedor, aparece en la lista y queda auditado', async () => {
    const created = await agent.post('/api/suppliers').send(norte).expect(201);
    expect(created.body).toMatchObject({ ...norte, active: true });

    const list = await agent.get('/api/suppliers').expect(200);
    expect(list.body.items.map((s: { taxId: string }) => s.taxId)).toEqual(['DAN010203AB1']);

    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'supplier.created' } });
    expect(event).toMatchObject({ actor: 'Ana Pruebas', entityId: created.body.id });
  });

  it('AC-002-02 normaliza el RFC y rechaza uno inválido indicando el campo', async () => {
    const created = await agent
      .post('/api/suppliers')
      .send({ ...norte, taxId: ' dan010203ab1 ' })
      .expect(201);
    expect(created.body.taxId).toBe('DAN010203AB1');

    const invalid = await agent
      .post('/api/suppliers')
      .send({ ...norte, taxId: 'NO-ES-RFC' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION');
    expect(invalid.body.fieldErrors.taxId).toMatch(/RFC inválido/);
  });

  it('AC-002-03 rechaza un RFC repetido con 409 CONFLICT', async () => {
    await agent.post('/api/suppliers').send(norte).expect(201);
    const res = await agent
      .post('/api/suppliers')
      .send({ ...norte, name: 'Otro nombre' })
      .expect(409);

    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.fieldErrors.taxId).toBeDefined();
  });

  it('AC-002-04 edita un proveedor y audita qué cambió', async () => {
    const { body } = await agent.post('/api/suppliers').send(norte).expect(201);
    const updated = await agent
      .patch(`/api/suppliers/${body.id}`)
      .send({ creditDays: 30 })
      .expect(200);
    expect(updated.body.creditDays).toBe(30);

    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'supplier.updated' } });
    expect(event.data).toEqual({ changes: { creditDays: { from: 15, to: 30 } } });
  });

  it('AC-002-05 un proveedor inactivo sale de la lista por defecto pero sigue consultable', async () => {
    const { body } = await agent.post('/api/suppliers').send(norte).expect(201);
    await agent.patch(`/api/suppliers/${body.id}`).send({ active: false }).expect(200);

    expect((await agent.get('/api/suppliers').expect(200)).body.items).toHaveLength(0);
    expect((await agent.get('/api/suppliers?status=all').expect(200)).body.items).toHaveLength(1);
    expect((await agent.get('/api/suppliers?status=inactive').expect(200)).body.items).toHaveLength(
      1,
    );
    await agent.get(`/api/suppliers/${body.id}`).expect(200);
  });

  it('AC-002-06 busca por nombre (sin distinguir mayúsculas) o por parte del RFC', async () => {
    await agent.post('/api/suppliers').send(norte).expect(201);
    await agent
      .post('/api/suppliers')
      .send({ ...norte, name: 'Bebidas Frías de Monterrey', taxId: 'BFM980512KL3' })
      .expect(201);

    const byName = await agent.get('/api/suppliers?search=bebidas').expect(200);
    expect(byName.body.items.map((s: { taxId: string }) => s.taxId)).toEqual(['BFM980512KL3']);
    const byTaxId = await agent.get('/api/suppliers?search=dan0102').expect(200);
    expect(byTaxId.body.items.map((s: { taxId: string }) => s.taxId)).toEqual(['DAN010203AB1']);
  });

  it('responde 404 para un proveedor que no existe', async () => {
    const res = await agent.get('/api/suppliers/no-existe').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
