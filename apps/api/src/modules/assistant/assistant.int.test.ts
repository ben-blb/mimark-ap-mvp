import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { AssistantClient } from '../../integrations/assistant.client.js';

const ask = (text: string) => ({ messages: [{ role: 'user', text }] });

describe('asistente (spec 008)', () => {
  let t: TestApp;
  let agent: Awaited<ReturnType<TestApp['agent']>>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    vi.restoreAllMocks();
    await t.reset();
    agent = await t.agent();
  });

  it('AC-008-01 sin sesión responde 401', async () => {
    const res = await t.http().post('/api/assistant/turn').send(ask('hola')).expect(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('AC-008-02 una entrada fuera de topes responde 400 sin llamar al modelo', async () => {
    const spy = vi.spyOn(t.get(AssistantClient), 'turn');
    const res = await agent
      .post('/api/assistant/turn')
      .send(ask('a'.repeat(2001)))
      .expect(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(spy).not.toHaveBeenCalled();
  });

  it('AC-008-03 devuelve texto y las llamadas válidas; descarta las inválidas', async () => {
    vi.spyOn(t.get(AssistantClient), 'turn').mockResolvedValue({
      text: 'Reviso.',
      toolCalls: [
        { id: 'c1', name: 'getDashboard', input: { horizon: 7 } },
        { id: 'c2', name: 'deleteEverything', input: {} },
        { id: 'c3', name: 'schedulePayable', input: { id: 'x', payOn: 'viernes' } },
      ],
      model: 'mock',
      promptVersion: 'assistant@2',
      ms: 1,
    });
    const res = await agent.post('/api/assistant/turn').send(ask('¿qué vence?')).expect(200);
    expect(res.body).toEqual({
      text: 'Reviso.',
      toolCalls: [{ id: 'c1', name: 'getDashboard', input: { horizon: 7 } }],
    });
  });

  it('AC-008-04 cada turno queda auditado sin el texto y la cuota agotada responde 429', async () => {
    await agent.post('/api/assistant/turn').send(ask('¿qué vence?')).expect(200);
    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'assistant.answered' },
    });
    expect(event).toMatchObject({ actor: 'Ana Pruebas', entity: 'assistant' });
    expect(event.data).toMatchObject({ model: 'fake', tools: ['getDashboard'] });
    expect(JSON.stringify(event.data)).not.toContain('vence');

    await t.db.auditEvent.createMany({
      data: Array.from({ length: 99 }, () => ({
        actor: 'Ana Pruebas',
        requestId: 'seed',
        entity: 'assistant',
        action: 'assistant.answered',
      })),
    });
    const spy = vi.spyOn(t.get(AssistantClient), 'turn');
    const res = await agent.post('/api/assistant/turn').send(ask('otra')).expect(429);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(spy).not.toHaveBeenCalled();

    // La cuota es por persona.
    const other = await t.agent('Beto Pruebas');
    await other.post('/api/assistant/turn').send(ask('otra')).expect(200);
  });

  it('AC-008-05 proponer un pago no cambia ninguna tabla de negocio', async () => {
    const res = await agent
      .post('/api/assistant/turn')
      .send(ask('registra el pago cmh0payable0000000000000'))
      .expect(200);
    expect(res.body.toolCalls).toMatchObject([{ name: 'recordPayment' }]);

    const [suppliers, orders, payables, events] = await Promise.all([
      t.db.supplier.count(),
      t.db.purchaseOrder.count(),
      t.db.payable.count(),
      t.db.auditEvent.findMany({ select: { action: true } }),
    ]);
    expect([suppliers, orders, payables]).toEqual([0, 0, 0]);
    expect(events.map((e) => e.action).filter((a) => a !== 'session.started')).toEqual([
      'assistant.answered',
    ]);
  });

  it('AC-008-04 una falla del modelo responde 502 AI_UNAVAILABLE', async () => {
    vi.spyOn(t.get(AssistantClient), 'turn').mockRejectedValue(new Error('caído'));
    const res = await agent.post('/api/assistant/turn').send(ask('hola')).expect(502);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
  });

  describe('streaming (spec 010)', () => {
    /** Eventos del SSE en orden. */
    const events = (text: string) =>
      text
        .split('\n\n')
        .filter((chunk) => chunk.startsWith('data: '))
        .map((chunk) => JSON.parse(chunk.slice('data: '.length)) as Record<string, unknown>);

    it('AC-010-06 entrega el texto en trozos y termina con las llamadas filtradas', async () => {
      vi.spyOn(t.get(AssistantClient), 'stream').mockImplementation((_input, _signal, onDelta) => {
        onDelta('Reviso ');
        onDelta('la cartera.');
        return Promise.resolve({
          text: 'Reviso la cartera.',
          toolCalls: [
            { id: 'c1', name: 'getDashboard', input: { horizon: 7 } },
            { id: 'c2', name: 'deleteEverything', input: {} },
          ],
          model: 'mock',
          promptVersion: 'assistant@2',
          ms: 1,
        });
      });
      const res = await agent.post('/api/assistant/stream').send(ask('¿qué vence?')).expect(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(events(res.text)).toEqual([
        { type: 'delta', text: 'Reviso ' },
        { type: 'delta', text: 'la cartera.' },
        {
          type: 'done',
          text: 'Reviso la cartera.',
          toolCalls: [{ id: 'c1', name: 'getDashboard', input: { horizon: 7 } }],
        },
      ]);
      const event = await t.db.auditEvent.findFirstOrThrow({
        where: { action: 'assistant.answered' },
      });
      expect(event.data).toMatchObject({ tools: ['getDashboard'] });
    });

    it('AC-010-06 sin sesión, con cuerpo inválido o sin cuota responde JSON sin llamar al modelo', async () => {
      const spy = vi.spyOn(t.get(AssistantClient), 'stream');
      expect(
        (await t.http().post('/api/assistant/stream').send(ask('hola')).expect(401)).body.code,
      ).toBe('UNAUTHENTICATED');
      expect(
        (
          await agent
            .post('/api/assistant/stream')
            .send(ask('a'.repeat(2001)))
            .expect(400)
        ).body.code,
      ).toBe('VALIDATION');
      await t.db.auditEvent.createMany({
        data: Array.from({ length: 100 }, () => ({
          actor: 'Ana Pruebas',
          requestId: 'seed',
          entity: 'assistant',
          action: 'assistant.answered',
        })),
      });
      expect(
        (await agent.post('/api/assistant/stream').send(ask('hola')).expect(429)).body.code,
      ).toBe('QUOTA_EXCEEDED');
      expect(spy).not.toHaveBeenCalled();
    });

    it('AC-010-06 si el modelo falla a media respuesta, el stream termina con un evento de error', async () => {
      vi.spyOn(t.get(AssistantClient), 'stream').mockImplementation((_input, _signal, onDelta) => {
        onDelta('Empiezo');
        return Promise.reject(new Error('caído'));
      });
      const res = await agent.post('/api/assistant/stream').send(ask('hola')).expect(200);
      expect(events(res.text)).toEqual([
        { type: 'delta', text: 'Empiezo' },
        {
          type: 'error',
          code: 'AI_UNAVAILABLE',
          message: 'El asistente no está disponible. Intenta de nuevo.',
        },
      ]);
    });

    it('AC-010-06 con el modelo fake el texto llega en trozos y ninguna tabla de negocio cambia', async () => {
      const res = await agent.post('/api/assistant/stream').send(ask('hola')).expect(200);
      const list = events(res.text);
      expect(list.filter((e) => e.type === 'delta').length).toBeGreaterThan(1);
      expect(list.at(-1)).toMatchObject({ type: 'done', toolCalls: [] });
      expect(await t.db.payable.count()).toBe(0);
      expect(await t.db.supplier.count()).toBe(0);
    });
  });
});
