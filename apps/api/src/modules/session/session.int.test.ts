import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { TEST_ACCESS_CODE } from '../../../test/env.js';
import { SuppliersRepository } from '../suppliers/suppliers.repository.js';

const login = { code: TEST_ACCESS_CODE, name: 'Ana', role: 'payables' };

describe('acceso (spec 001)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => t.reset());

  it('AC-001-01 con el código correcto crea una sesión de 8 h en una cookie HttpOnly', async () => {
    const res = await t.http().post('/api/session').send(login).expect(200);

    expect(res.body).toMatchObject({ actor: 'Ana', role: 'payables' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^mimark_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const hours = (Date.parse(String(res.body.expiresAt)) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(7.9);
    expect(hours).toBeLessThanOrEqual(8);
    expect(
      await t.db.auditEvent.count({ where: { action: 'session.started', actor: 'Ana' } }),
    ).toBe(1);
  });

  it('AC-001-02 con un código incorrecto responde 401 ACCESS_DENIED sin cookie y lo audita', async () => {
    const res = await t
      .http()
      .post('/api/session')
      .send({ ...login, code: 'incorrecto' })
      .expect(401);

    expect(res.body.code).toBe('ACCESS_DENIED');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await t.db.auditEvent.count({ where: { action: 'session.failed' } })).toBe(1);
  });

  it('AC-001-03 tras 10 intentos fallidos desde una IP la bloquea, incluso con el código correcto', async () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 10; i++) {
      await t
        .http()
        .post('/api/session')
        .set('x-real-ip', ip)
        .send({ ...login, code: 'x' })
        .expect(401);
    }

    const blocked = await t
      .http()
      .post('/api/session')
      .set('x-real-ip', ip)
      .send(login)
      .expect(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    await t.http().post('/api/session').set('x-real-ip', '198.51.100.1').send(login).expect(200);
  });

  it('AC-001-04 las rutas protegidas exigen una cookie válida', async () => {
    const res = await t.http().get('/api/suppliers').expect(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');

    await t.http().get('/api/suppliers').set('Cookie', 'mimark_session=alterada.firma').expect(401);
    const agent = await t.agent();
    await agent.get('/api/suppliers').expect(200);
  });

  it('AC-001-05 /api/health es público e informa el estado de la base de datos', async () => {
    const res = await t.http().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('AC-001-06 todo error responde { code, message, requestId } y coincide con x-request-id', async () => {
    const res = await t.http().get('/api/no-existe').expect(404);

    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String),
      requestId: res.headers['x-request-id'],
    });
  });

  it('AC-001-06 una falla inesperada responde INTERNAL sin detalles ni stack', async () => {
    const broken = await createTestApp((b) =>
      b.overrideProvider(SuppliersRepository).useValue({
        list: () => Promise.reject(new Error('detalle interno con secreto')),
      }),
    );
    try {
      const agent = await broken.agent();
      const res = await agent.get('/api/suppliers').expect(500);

      expect(res.body.code).toBe('INTERNAL');
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
      expect(JSON.stringify(res.body)).not.toMatch(/secreto|stack|\.ts:/);
    } finally {
      await broken.close();
    }
  });

  it('AC-001-07 cerrar sesión borra la cookie', async () => {
    const agent = await t.agent();
    await agent.get('/api/session').expect(200);

    const res = await agent.delete('/api/session').expect(204);
    expect(String(res.headers['set-cookie'])).toMatch(/mimark_session=;/);
    await agent.get('/api/session').expect(401);
  });
});
