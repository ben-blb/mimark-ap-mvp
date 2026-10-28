import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';

const body = (title: string, text = 'Hola') => ({
  title,
  messages: [
    { role: 'user', text },
    { role: 'assistant', text: 'Hola, ¿en qué te ayudo?', toolCalls: [] },
  ],
  decisions: { c1: { status: 'confirmed', at: '2026-10-28T12:00:00.000Z' } },
});

describe('conversaciones del asistente (spec 011)', () => {
  let t: TestApp;
  let ana: Awaited<ReturnType<TestApp['agent']>>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    ana = await t.agent();
  });

  it('AC-011-11 sin sesión responde 401 UNAUTHENTICATED en todas las rutas', async () => {
    const anon = t.http();
    const id = randomUUID();
    for (const res of [
      await anon.get('/api/conversations'),
      await anon.get(`/api/conversations/${id}`),
      await anon.put(`/api/conversations/${id}`).send(body('x')),
      await anon.delete(`/api/conversations/${id}`),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    }
  });

  it('AC-011-12 la primera vez crea, la siguiente reemplaza los mensajes y audita sin texto', async () => {
    const id = randomUUID();
    const first = await ana.put(`/api/conversations/${id}`).send(body('Primera')).expect(200);
    expect(first.body).toMatchObject({ id, title: 'Primera', decisions: body('').decisions });
    expect(first.body.messages).toHaveLength(2);

    const next = {
      ...body('Renombrada'),
      messages: [...body('').messages, { role: 'user', text: 'Otra cosa' }],
    };
    const second = await ana.put(`/api/conversations/${id}`).send(next).expect(200);
    expect(second.body.title).toBe('Renombrada');
    expect(second.body.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(await t.db.conversationMessage.count({ where: { conversationId: id } })).toBe(3);

    const events = await t.db.auditEvent.findMany({ where: { action: 'conversation.saved' } });
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain('Otra cosa');
    expect(events[0]).toMatchObject({ entity: 'conversation', entityId: id, actor: 'Ana Pruebas' });
  });

  it('AC-011-13 cada persona ve solo las suyas, la más reciente primero; la ajena responde 404', async () => {
    const bruno = await t.agent('Bruno Pruebas');
    const mine = [randomUUID(), randomUUID(), randomUUID()];
    for (const [i, id] of mine.entries()) {
      await ana
        .put(`/api/conversations/${id}`)
        .send(body(`A${i}`))
        .expect(200);
    }
    const theirs = randomUUID();
    await bruno.put(`/api/conversations/${theirs}`).send(body('B0')).expect(200);
    await bruno.put(`/api/conversations/${randomUUID()}`).send(body('B1')).expect(200);

    const list = await ana.get('/api/conversations').expect(200);
    expect(list.body.items.map((c: { title: string }) => c.title)).toEqual(['A2', 'A1', 'A0']);

    await ana.get(`/api/conversations/${theirs}`).expect(404);
    await ana.put(`/api/conversations/${theirs}`).send(body('pisada')).expect(404);
    expect((await bruno.get(`/api/conversations/${theirs}`).expect(200)).body.title).toBe('B0');
  });

  it('AC-011-14 un cuerpo fuera de topes o un id que no es UUID responde 400 VALIDATION', async () => {
    const id = randomUUID();
    const user = { role: 'user', text: 'Hola' };
    for (const [path, payload] of [
      [id, { title: 'x', messages: Array(201).fill(user) }],
      [id, { title: 'x'.repeat(121), messages: [user] }],
      ['no-es-uuid', body('x')],
    ] as const) {
      const res = await ana.put(`/api/conversations/${path}`).send(payload).expect(400);
      expect(res.body.code).toBe('VALIDATION');
    }
  });

  it('AC-011-15 borra la propia con sus mensajes y audita; la ajena responde 404', async () => {
    const bruno = await t.agent('Bruno Pruebas');
    const id = randomUUID();
    await ana.put(`/api/conversations/${id}`).send(body('Mía')).expect(200);

    await bruno.delete(`/api/conversations/${id}`).expect(404);
    await ana.delete(`/api/conversations/${id}`).expect(204);
    expect(await t.db.conversation.count()).toBe(0);
    expect(await t.db.conversationMessage.count()).toBe(0);
    await t.db.auditEvent.findFirstOrThrow({ where: { action: 'conversation.deleted' } });
    await ana.get(`/api/conversations/${id}`).expect(404);
  });
});
