import { ModulesContainer, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { can, type Permission } from '@mimark/contracts/permissions';
import { ROLES, type Role } from '@mimark/contracts/session';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';

type Verb = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Una ruta por permiso; la prueba de cobertura exige que esta lista incluya todas las rutas con @Requires. */
const GUARDED: { verb: Verb; path: string; permission: Permission }[] = [
  { verb: 'post', path: '/api/suppliers', permission: 'suppliers:write' },
  { verb: 'patch', path: '/api/suppliers/x', permission: 'suppliers:write' },
  { verb: 'post', path: '/api/purchase-orders', permission: 'orders:write' },
  { verb: 'post', path: '/api/purchase-orders/extract', permission: 'orders:write' },
  { verb: 'patch', path: '/api/purchase-orders/x', permission: 'orders:write' },
  { verb: 'post', path: '/api/purchase-orders/x/receipt', permission: 'orders:receive' },
  { verb: 'get', path: '/api/payables', permission: 'payables:read' },
  { verb: 'get', path: '/api/payables/x', permission: 'payables:read' },
  { verb: 'get', path: '/api/payables/x/file', permission: 'payables:read' },
  { verb: 'get', path: '/api/payables/x/history', permission: 'payables:read' },
  { verb: 'post', path: '/api/payables', permission: 'payables:write' },
  { verb: 'post', path: '/api/payables/x/retry', permission: 'payables:write' },
  { verb: 'patch', path: '/api/payables/x/fields', permission: 'payables:write' },
  { verb: 'patch', path: '/api/payables/x/documents', permission: 'payables:write' },
  { verb: 'post', path: '/api/payables/x/discard', permission: 'payables:write' },
  { verb: 'post', path: '/api/payables/x/confirm', permission: 'payables:pay' },
  { verb: 'post', path: '/api/payables/x/schedule', permission: 'payables:pay' },
  { verb: 'post', path: '/api/payables/x/payment', permission: 'payables:pay' },
  { verb: 'get', path: '/api/dashboard', permission: 'dashboard:read' },
  { verb: 'post', path: '/api/assistant/turn', permission: 'assistant:use' },
  { verb: 'post', path: '/api/assistant/stream', permission: 'assistant:use' },
  { verb: 'get', path: '/api/conversations', permission: 'assistant:use' },
  { verb: 'get', path: '/api/conversations/x', permission: 'assistant:use' },
  { verb: 'put', path: '/api/conversations/x', permission: 'assistant:use' },
  { verb: 'delete', path: '/api/conversations/x', permission: 'assistant:use' },
  { verb: 'get', path: '/api/users', permission: 'users:manage' },
  { verb: 'post', path: '/api/users', permission: 'users:manage' },
  { verb: 'get', path: '/api/users/x', permission: 'users:manage' },
  { verb: 'patch', path: '/api/users/x', permission: 'users:manage' },
  { verb: 'post', path: '/api/users/x/reset-password', permission: 'users:manage' },
  { verb: 'delete', path: '/api/users/x', permission: 'users:manage' },
];

/** Rutas protegidas que a propósito solo piden sesión (lecturas abiertas y la sesión misma). */
const SESSION_ONLY = new Set([
  'GET /api/suppliers',
  'GET /api/suppliers/:id',
  'GET /api/purchase-orders',
  'GET /api/purchase-orders/:id',
  'GET /api/session',
  'POST /api/session/password',
]);

describe('permisos por rol (spec 013)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => t.reset());

  it('AC-013-13 cada rol recibe 403 sin ejecutar nada si no tiene el permiso, y nunca 403 si lo tiene', async () => {
    for (const role of ROLES) {
      const agent = await t.agent(`Persona ${role}`, role);
      const eventsBefore = await t.db.auditEvent.count();
      for (const { verb, path, permission } of GUARDED) {
        const res = await agent[verb](path).send({});
        const label = `${role} ${verb.toUpperCase()} ${path}`;
        if (can(role, permission)) {
          expect(res.status, label).not.toBe(403);
          expect(res.status, label).not.toBe(401);
        } else {
          expect(res.status, label).toBe(403);
          expect(res.body.code, label).toBe('FORBIDDEN');
        }
      }
      // Las respuestas 403 no escribieron nada: los eventos nuevos son solo de rutas permitidas.
      const forbiddenOnly = GUARDED.every(({ permission }) => !can(role, permission));
      if (forbiddenOnly) expect(await t.db.auditEvent.count()).toBe(eventsBefore);
    }
  });

  it('AC-013-13 toda ruta protegida con @Requires está en la lista de la prueba y las demás son las esperadas', () => {
    const reflector = new Reflector();
    const controllers = [...t.get(ModulesContainer).values()].flatMap((m) => [
      ...m.controllers.values(),
    ]);
    const found: { key: string; guarded: boolean }[] = [];

    for (const wrapper of controllers) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const prefix = String(Reflect.getMetadata(PATH_METADATA, metatype)).replace(/^\/|\/$/g, '');
      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (method === undefined) continue;
        if (reflector.getAllAndOverride<boolean>('isPublic', [handler, metatype])) continue;
        const sub = String(Reflect.getMetadata(PATH_METADATA, handler)).replace(/^\/|\/$/g, '');
        const verb = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'][method] ?? String(method);
        const path = `/api/${[prefix, sub === '/' ? '' : sub].filter(Boolean).join('/')}`;
        const guarded = !!reflector.getAllAndOverride('requiresPermission', [handler, metatype]);
        found.push({ key: `${verb} ${path}`, guarded });
      }
    }

    const normalize = (p: string) => p.replace(/\/x(\/|$)/g, '/:id$1');
    const covered = new Set(GUARDED.map((g) => `${g.verb.toUpperCase()} ${normalize(g.path)}`));
    const withoutRequires = found.filter((f) => !f.guarded).map((f) => f.key);
    expect(withoutRequires.filter((k) => !SESSION_ONLY.has(k))).toEqual([]);
    expect(found.filter((f) => f.guarded && !covered.has(f.key)).map((f) => f.key)).toEqual([]);
  });

  it('AC-013-14 warehouse no ve facturas ni cartera pero sí proveedores y órdenes', async () => {
    const warehouse = await t.agent('Wanda', 'warehouse');
    await warehouse.get('/api/suppliers').expect(200);
    await warehouse.get('/api/purchase-orders').expect(200);
    await warehouse.get('/api/payables').expect(403);
    await warehouse.get('/api/dashboard').expect(403);
    await warehouse.post('/api/payables/x/payment').send({}).expect(403);
  });

  it('AC-013-15 manager confirma y paga pero no sube ni corrige facturas', async () => {
    const manager = await t.agent('Mario', 'manager');
    for (const path of ['confirm', 'schedule', 'payment']) {
      const res = await manager.post(`/api/payables/x/${path}`).send({});
      expect(res.status, path).not.toBe(403);
    }
    await manager.post('/api/payables').expect(403);
    await manager.patch('/api/payables/x/fields').send({}).expect(403);
  });

  it('AC-013-17 solo admin llega a /api/users', async () => {
    for (const role of ROLES.filter((r): r is Exclude<Role, 'admin'> => r !== 'admin')) {
      const agent = await t.agent(`Persona ${role}`, role);
      const res = await agent.get('/api/users').expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
  });
});
