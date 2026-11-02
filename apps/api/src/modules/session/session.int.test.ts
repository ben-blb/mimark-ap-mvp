import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { TEST_PASSWORD } from '../../../test/env.js';
import { SuppliersRepository } from '../suppliers/suppliers.repository.js';

describe('acceso (specs 001 y 013)', () => {
  let t: TestApp;
  const credentials = (email: string, password = TEST_PASSWORD) => ({ email, password });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => t.reset());

  it('AC-001-01 · AC-013-05 con correo y contraseña crea una sesión de 8 h en una cookie HttpOnly', async () => {
    const user = await t.createUser('Ana', 'payables');
    const res = await t
      .http()
      .post('/api/session')
      .send(credentials(user.email.toUpperCase()))
      .expect(200);

    expect(res.body).toMatchObject({
      userId: user.id,
      actor: 'Ana',
      role: 'payables',
      mustChangePassword: false,
    });
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

  it.each([
    ['contraseña incorrecta', 'ana@x.mx', 'otra-contrasena-larga'],
    ['correo inexistente', 'nadie@x.mx', TEST_PASSWORD],
  ])(
    'AC-001-02 · AC-013-06 %s: 401 ACCESS_DENIED sin cookie y lo audita',
    async (_name, email, password) => {
      await t.db.user.create({
        data: { email: 'ana@x.mx', name: 'Ana', role: 'payables', passwordHash: 'scrypt$a$b' },
      });
      const res = await t.http().post('/api/session').send({ email, password }).expect(401);

      expect(res.body.code).toBe('ACCESS_DENIED');
      expect(res.headers['set-cookie']).toBeUndefined();
      const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'session.failed' } });
      expect(event.data).toMatchObject({ email, ip: expect.any(String) });
    },
  );

  it('AC-013-06 · AC-013-09 un usuario inactivo recibe el mismo 401 aunque la contraseña sea correcta', async () => {
    const user = await t.createUser('Baja', 'payables', { active: false });
    const res = await t.http().post('/api/session').send(credentials(user.email)).expect(401);
    expect(res.body.code).toBe('ACCESS_DENIED');
  });

  it('AC-001-03 · AC-013-07 tras 10 intentos fallidos desde una IP la bloquea, incluso con la contraseña correcta', async () => {
    const user = await t.createUser('Ana', 'payables');
    const ip = '203.0.113.7';
    for (let i = 0; i < 10; i++) {
      await t
        .http()
        .post('/api/session')
        .set('x-real-ip', ip)
        .send(credentials(`nadie${i}@x.mx`, 'x'))
        .expect(401);
    }

    const blocked = await t
      .http()
      .post('/api/session')
      .set('x-real-ip', ip)
      .send(credentials(user.email))
      .expect(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    await t
      .http()
      .post('/api/session')
      .set('x-real-ip', '198.51.100.1')
      .send(credentials(user.email))
      .expect(200);
  });

  it('AC-013-07 tras 5 intentos fallidos de un correo lo bloquea desde cualquier IP; otros correos no', async () => {
    const ana = await t.createUser('Ana', 'payables');
    const beto = await t.createUser('Beto', 'manager');
    for (let i = 0; i < 5; i++) {
      await t
        .http()
        .post('/api/session')
        .set('x-real-ip', `192.0.2.${i + 1}`)
        .send(credentials(ana.email, 'incorrecta-incorrecta'))
        .expect(401);
    }

    const blocked = await t
      .http()
      .post('/api/session')
      .set('x-real-ip', '192.0.2.99')
      .send(credentials(ana.email))
      .expect(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    await t
      .http()
      .post('/api/session')
      .set('x-real-ip', '192.0.2.99')
      .send(credentials(beto.email))
      .expect(200);
  });

  it('AC-013-09 la cookie ya emitida de un usuario desactivado sigue vigente hasta vencer', async () => {
    const user = await t.createUser('Ana', 'payables');
    const agent = await t.agent('Ana', 'payables');
    await t.db.user.update({ where: { id: user.id }, data: { active: false } });

    await agent.get('/api/session').expect(200);
    await t.http().post('/api/session').send(credentials(user.email)).expect(401);
  });

  it('AC-013-08 una cookie con el formato anterior (sin userId) responde 401', async () => {
    const legacy = Buffer.from(
      JSON.stringify({ a: 'Ana', r: 'admin', e: Date.now() + 1e6 }),
    ).toString('base64url');
    await t
      .http()
      .get('/api/suppliers')
      .set('Cookie', `mimark_session=${legacy}.firma`)
      .expect(401);
  });

  it('AC-013-11 con cambio de contraseña pendiente solo se permite consultar la sesión y cambiarla', async () => {
    const user = await t.createUser('Nueva', 'payables', { mustChangePassword: true });
    const agent = await t.login(user.email);

    await agent.get('/api/session').expect(200);
    const blocked = await agent.get('/api/suppliers').expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('AC-013-12 cambiar la contraseña emite una cookie nueva sin la bandera y lo audita', async () => {
    const user = await t.createUser('Nueva', 'payables', { mustChangePassword: true });
    const agent = await t.login(user.email);

    const bad = await agent
      .post('/api/session/password')
      .send({ currentPassword: 'incorrecta-larga', newPassword: 'contrasena-nueva-1' })
      .expect(401);
    expect(bad.body.code).toBe('ACCESS_DENIED');
    await agent
      .post('/api/session/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })
      .expect(400);

    const ok = await agent
      .post('/api/session/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'contrasena-nueva-1' })
      .expect(200);
    expect(ok.body.mustChangePassword).toBe(false);
    await agent.get('/api/suppliers').expect(200);
    await t.http().post('/api/session').send(credentials(user.email)).expect(401);
    await t
      .http()
      .post('/api/session')
      .send(credentials(user.email, 'contrasena-nueva-1'))
      .expect(200);
    expect(await t.db.auditEvent.count({ where: { action: 'user.password_changed' } })).toBe(1);
  });

  it('AC-001-04 · AC-013-08 las rutas protegidas exigen una cookie válida', async () => {
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
