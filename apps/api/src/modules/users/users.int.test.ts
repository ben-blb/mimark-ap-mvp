import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { TEST_ACCESS_CODE, TEST_PASSWORD } from '../../../test/env.js';

const setupBody = {
  code: TEST_ACCESS_CODE,
  name: 'Dueña Inicial',
  email: 'Duena@Mimark.MX',
  password: 'una-contrasena-larga',
};

describe('configuración inicial (spec 013)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => t.reset());

  it('AC-013-01 informa si falta la configuración inicial, sin sesión', async () => {
    expect((await t.http().get('/api/setup').expect(200)).body).toEqual({ needsSetup: true });
    await t.createUser('Ana', 'admin');
    expect((await t.http().get('/api/setup').expect(200)).body).toEqual({ needsSetup: false });
  });

  it('AC-013-02 con el código correcto crea al primer admin y abre su sesión', async () => {
    const res = await t.http().post('/api/setup').send(setupBody).expect(200);

    expect(res.body).toMatchObject({
      actor: 'Dueña Inicial',
      role: 'admin',
      mustChangePassword: false,
    });
    expect(String(res.headers['set-cookie'])).toMatch(/^mimark_session=/);
    const user = await t.db.user.findFirstOrThrow();
    expect(user).toMatchObject({ email: 'duena@mimark.mx', role: 'admin', active: true });
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'user.created' } });
    expect(event.data).toMatchObject({ setup: true });
    await t.login('duena@mimark.mx', 'una-contrasena-larga');
  });

  it('AC-013-03 con un código incorrecto responde 401, no crea nada y cuenta como intento fallido', async () => {
    const res = await t
      .http()
      .post('/api/setup')
      .send({ ...setupBody, code: 'incorrecto' })
      .expect(401);

    expect(res.body.code).toBe('ACCESS_DENIED');
    expect(await t.db.user.count()).toBe(0);
    expect(await t.db.auditEvent.count({ where: { action: 'session.failed' } })).toBe(1);

    const ip = '203.0.113.50';
    for (let i = 0; i < 10; i++) {
      await t
        .http()
        .post('/api/setup')
        .set('x-real-ip', ip)
        .send({ ...setupBody, code: 'x' });
    }
    await t.http().post('/api/setup').set('x-real-ip', ip).send(setupBody).expect(429);
  });

  it('AC-013-04 si ya existe un usuario responde 409 SETUP_DONE', async () => {
    await t.createUser('Ana', 'admin');
    const res = await t.http().post('/api/setup').send(setupBody).expect(409);
    expect(res.body.code).toBe('SETUP_DONE');
    expect(await t.db.user.count()).toBe(1);
  });

  it('AC-013-04 dos peticiones simultáneas crean un solo administrador', async () => {
    const results = await Promise.all([
      t.http().post('/api/setup').send(setupBody),
      t
        .http()
        .post('/api/setup')
        .send({ ...setupBody, email: 'otra@mimark.mx' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await t.db.user.count()).toBe(1);
  });

  it('AC-013-10 rechaza una contraseña de menos de 10 caracteres', async () => {
    const res = await t
      .http()
      .post('/api/setup')
      .send({ ...setupBody, password: '123456789' })
      .expect(400);
    expect(res.body.fieldErrors.password).toBeTruthy();
  });
});

describe('usuarios (spec 013)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => t.reset());

  const newUser = {
    name: 'Carla Compras',
    email: 'Carla@Mimark.mx',
    role: 'purchasing',
    password: 'temporal-larga-1',
  };

  it('AC-013-18 un admin crea un usuario con contraseña temporal y queda auditado', async () => {
    const admin = await t.agent('Ada', 'admin');
    const res = await admin.post('/api/users').send(newUser).expect(201);

    expect(res.body).toMatchObject({
      name: 'Carla Compras',
      email: 'carla@mimark.mx',
      role: 'purchasing',
      active: true,
      mustChangePassword: true,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|passwordHash|temporal-larga/);
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'user.created' } });
    expect(event).toMatchObject({ actor: 'Ada', entityId: res.body.id });
    expect(JSON.stringify(event.data)).not.toMatch(/temporal-larga|scrypt/);

    const dup = await admin
      .post('/api/users')
      .send({ ...newUser, email: 'CARLA@mimark.mx' })
      .expect(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
    await t.login('carla@mimark.mx', 'temporal-larga-1');
  });

  it('AC-013-19 lista y consulta usuarios activos e inactivos sin exponer el hash', async () => {
    const admin = await t.agent('Ada', 'admin');
    const baja = await t.createUser('Baja', 'manager', { active: false });

    const list = await admin.get('/api/users').expect(200);
    expect(list.body.items.map((u: { name: string }) => u.name).sort()).toEqual(['Ada', 'Baja']);
    expect(JSON.stringify(list.body)).not.toMatch(/scrypt|passwordHash/);
    const one = await admin.get(`/api/users/${baja.id}`).expect(200);
    expect(one.body).toMatchObject({ id: baja.id, active: false });
    await admin.get('/api/users/no-existe').expect(404);
  });

  it('AC-013-20 un admin cambia nombre, rol y estado y queda auditado', async () => {
    const admin = await t.agent('Ada', 'admin');
    const user = await t.createUser('Beto', 'warehouse');

    const res = await admin
      .patch(`/api/users/${user.id}`)
      .send({ name: 'Beto Almacén', role: 'manager' })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Beto Almacén', role: 'manager' });
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'user.updated' } });
    expect(event).toMatchObject({ fromStatus: 'warehouse', toStatus: 'manager' });
    expect(event.data).toMatchObject({ changes: { role: { from: 'warehouse', to: 'manager' } } });
  });

  it('AC-013-21 restablecer la contraseña devuelve una temporal, exige cambiarla y no la audita', async () => {
    const admin = await t.agent('Ada', 'admin');
    const user = await t.createUser('Beto', 'warehouse');

    const res = await admin.post(`/api/users/${user.id}/reset-password`).expect(200);
    const temporary = String(res.body.temporaryPassword);
    expect(temporary).toHaveLength(16);
    expect((await t.db.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(
      true,
    );
    await t.login(user.email, temporary);
    await t
      .http()
      .post('/api/session')
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(401);
    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'user.password_reset' },
    });
    expect(JSON.stringify(event)).not.toContain(temporary);
    expect(JSON.stringify(event)).not.toMatch(/scrypt/);
  });

  it('AC-013-22 «borrar» desactiva al usuario, conserva su fila y es idempotente', async () => {
    const admin = await t.agent('Ada', 'admin');
    const user = await t.createUser('Beto', 'warehouse');

    await admin.delete(`/api/users/${user.id}`).expect(204);
    await admin.delete(`/api/users/${user.id}`).expect(204);
    expect((await t.db.user.findUniqueOrThrow({ where: { id: user.id } })).active).toBe(false);
    expect(await t.db.auditEvent.count({ where: { action: 'user.deactivated' } })).toBe(1);
    await t
      .http()
      .post('/api/session')
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(401);
  });

  it('AC-013-23 un admin no puede quitarse el rol ni desactivarse a sí mismo', async () => {
    const admin = await t.agent('Ada', 'admin');
    const me = await t.db.user.findFirstOrThrow({ where: { name: 'Ada' } });
    await t.createUser('Otro admin', 'admin');

    const demote = await admin.patch(`/api/users/${me.id}`).send({ role: 'manager' }).expect(409);
    expect(demote.body.code).toBe('SELF_PROTECTED');
    const off = await admin.delete(`/api/users/${me.id}`).expect(409);
    expect(off.body.code).toBe('SELF_PROTECTED');
    expect((await t.db.user.findUniqueOrThrow({ where: { id: me.id } })).role).toBe('admin');
  });

  it('AC-013-23 no se puede dejar al sistema sin administrador activo', async () => {
    const admin = await t.agent('Ada', 'admin');
    const other = await t.createUser('Otro admin', 'admin');
    // Ada ya no es admin activa en la base (su cookie sigue vigente): solo queda «Otro admin».
    await t.db.user.updateMany({ where: { name: 'Ada' }, data: { active: false } });

    const res = await admin.patch(`/api/users/${other.id}`).send({ active: false }).expect(409);
    expect(res.body.code).toBe('LAST_ADMIN');
    expect((await t.db.user.findUniqueOrThrow({ where: { id: other.id } })).active).toBe(true);
  });
});
