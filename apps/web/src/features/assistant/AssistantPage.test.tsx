import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PayableDto } from '@mimark/contracts/payables';
import { AssistantPage } from './AssistantPage';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const dashboard = {
  today: '2026-10-27',
  horizon: 7,
  totals: Object.fromEntries(
    ['pending', 'overdue', 'upcoming', 'paidThisMonth'].map((k) => [
      k,
      { count: 0, amount: { MXN: '0.00', USD: '0.00' } },
    ]),
  ),
  inReview: 0,
  byPayDay: [],
  items: [],
};

const payable: PayableDto = {
  id: 'p1',
  status: 'scheduled',
  createdBy: 'Ana',
  createdAt: '2026-10-20T15:00:00.000Z',
  updatedAt: '2026-10-20T15:00:00.000Z',
  file: { name: 'factura.pdf', mimeType: 'application/pdf', size: 100 },
  invoiceReceivedOn: '2026-10-20',
  selectedPoNumber: null,
  isApDocument: true,
  fields: {
    docType: 'factura',
    supplierName: 'Proveedor Demo',
    supplierTaxId: 'DAN010203AB1',
    invoiceNumber: 'A-1',
    issueDate: '2026-10-06',
    poNumber: null,
    subtotal: '100.00',
    taxes: '16.00',
    total: '116.00',
    currency: 'MXN',
    taxUuid: null,
  },
  uncertainFields: [],
  reviewReasons: [],
  evidence: [],
  failureCode: null,
  purchaseOrder: null,
  supplier: null,
  extraction: null,
  schedule: null,
  payment: null,
  documents: null,
  discardReason: null,
  allowedActions: [],
};

type Turn = { text: string; toolCalls: { id: string; name: string; input: unknown }[] };

/** Un turno como SSE: el texto en dos trozos y luego `done`. Si `hold`, el stream no termina hasta abortarse. */
function sse(turn: Turn, signal?: AbortSignal | null, hold = false) {
  const encoder = new TextEncoder();
  const half = Math.ceil(turn.text.length / 2);
  const events = [
    ...[turn.text.slice(0, half), turn.text.slice(half)]
      .filter(Boolean)
      .map((text) => ({ type: 'delta', text })),
    ...(hold ? [] : [{ type: 'done', ...turn }]),
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      if (!hold) controller.close();
      signal?.addEventListener('abort', () =>
        controller.error(new DOMException('Detenido', 'AbortError')),
      );
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const list = {
  items: [
    {
      id: 'p1',
      status: 'confirmed',
      createdAt: '2026-10-20T15:00:00.000Z',
      createdBy: 'Ana',
      reviewReasons: [],
      fileName: 'factura.pdf',
      supplierName: 'Proveedor Demo',
      invoiceNumber: 'F-D0AEEB',
      poNumber: 'OC-1001',
      total: '8352.00',
      currency: 'MXN',
      dueOn: '2026-10-30',
    },
  ],
};

/** Responde los turnos en orden y los endpoints de las herramientas con datos fijos. */
function setup(turns: Turn[], options: { hold?: boolean; board?: typeof dashboard } = {}) {
  const queue = [...turns, { text: 'Listo.', toolCalls: [] }];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/assistant/stream') {
      const turn = queue.shift()!;
      return Promise.resolve(
        sse(turn, init?.signal, options.hold && queue.length === turns.length),
      );
    }
    if (url.startsWith('/api/dashboard')) return Promise.resolve(json(options.board ?? dashboard));
    if (url === '/api/payables' && (init?.method ?? 'GET') === 'GET')
      return Promise.resolve(json(list));
    if (url.startsWith('/api/payables')) return Promise.resolve(json(payable));
    return Promise.reject(new Error(`sin respuesta para ${init?.method ?? 'GET'} ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AssistantPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const calls = (prefix: string) => fetchMock.mock.calls.filter(([url]) => url.startsWith(prefix));
  /** Llamadas que cambian datos (no GET). */
  const writes = (prefix: string) =>
    calls(prefix).filter(([, init]) => init?.method && init.method !== 'GET');
  const turnBodies = () =>
    calls('/api/assistant/stream').map(([, init]) => JSON.parse(init?.body as string));
  return { calls, writes, turnBodies, user: userEvent.setup() };
}

async function say(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText('Mensaje'), text);
  await user.click(screen.getByRole('button', { name: 'Enviar' }));
}

afterEach(() => vi.unstubAllGlobals());

const schedule = {
  id: 'c1',
  name: 'schedulePayable',
  input: { id: 'p1', payOn: '2026-10-30' },
};

describe('AssistantPage', () => {
  it('AC-008-06 ejecuta sola una lectura y envía su resultado en el siguiente turno', async () => {
    const { calls, turnBodies, user } = setup([
      { text: '', toolCalls: [{ id: 'c1', name: 'getDashboard', input: { horizon: 7 } }] },
    ]);
    await say(user, '¿Qué vence?');

    expect(await screen.findByText('Listo.')).toBeInTheDocument();
    // Una consulta es de las sugerencias de la conversación vacía; la otra, la herramienta.
    expect(calls('/api/dashboard').map(([url]) => url)).toEqual([
      '/api/dashboard?horizon=7',
      '/api/dashboard?horizon=7',
    ]);
    const second = turnBodies()[1];
    expect(second.messages.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'c1',
      name: 'getDashboard',
    });
    expect(JSON.parse(second.messages.at(-1).result)).toMatchObject({ horizon: 7 });
  });

  it('AC-008-07 una escritura se muestra como propuesta y no llama al endpoint hasta confirmar', async () => {
    const { writes, turnBodies, user } = setup([{ text: 'Te propongo:', toolCalls: [schedule] }]);
    await say(user, 'Programa p1 para el viernes');

    const card = await screen.findByLabelText('Propuesta: Programar un pago');
    expect(writes('/api/payables')).toHaveLength(0);
    expect(screen.getByLabelText('Mensaje')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Listo.')).toBeInTheDocument();
    expect(card).toHaveTextContent(/Hecho · \d{2}:\d{2}/);
    const [url, init] = writes('/api/payables')[0] ?? [];
    expect(url).toBe('/api/payables/p1/schedule');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ payOn: '2026-10-30' });
    expect(turnBodies()[1].messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'c1' });
  });

  it('AC-008-07 cancelar no llama a ningún endpoint y avisa al asistente', async () => {
    const { writes, turnBodies, user } = setup([{ text: '', toolCalls: [schedule] }]);
    await say(user, 'Programa p1');
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('Listo.')).toBeInTheDocument();
    expect(writes('/api/payables')).toHaveLength(0);
    expect(turnBodies()[1].messages.at(-1)).toMatchObject({
      role: 'tool',
      result: '{"cancelled":true}',
    });
  });

  it('AC-008-08 sin adjunto la carga queda bloqueada; con adjunto envía el multipart al endpoint de carga', async () => {
    const upload = {
      id: 'c1',
      name: 'uploadPayable',
      input: { purchaseOrderNumber: 'OC-1001' },
    };
    const { writes, turnBodies, user } = setup([{ text: '', toolCalls: [upload] }]);
    await say(user, 'Sube la factura');

    expect(await screen.findByText('Adjunta la factura')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

    const pdf = new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Archivo de la factura'), pdf);
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(writes('/api/payables')).toHaveLength(1));
    const [url, init] = writes('/api/payables')[0] ?? [];
    expect(url).toBe('/api/payables');
    const form = init?.body as FormData;
    expect((form.get('file') as File).name).toBe('factura.pdf');
    expect(form.get('purchaseOrderNumber')).toBe('OC-1001');
    // El siguiente turno ya no describe el adjunto: se subió.
    await waitFor(() => expect(turnBodies()).toHaveLength(2));
    expect(turnBodies()[1].attachment).toBeUndefined();
  });

  it('AC-008-08 el turno describe el adjunto solo con nombre, tipo y tamaño', async () => {
    const { turnBodies, user } = setup([]);
    const pdf = new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Archivo de la factura'), pdf);
    await say(user, 'Hola');
    await screen.findByText('Listo.');
    expect(turnBodies()[0].attachment).toEqual({
      fileName: 'factura.pdf',
      mimeType: 'application/pdf',
      size: 8,
    });
  });

  it('AC-008-10 muestra el contenido del asistente como texto, sin interpretar HTML', async () => {
    const { user } = setup([{ text: '<b>Hola</b> <img src=x onerror=alert(1)>', toolCalls: [] }]);
    await say(user, 'Hola');
    expect(await screen.findByText('<b>Hola</b> <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('AC-010-07 la escritura se resume en lenguaje de negocio, antes → después', async () => {
    const { user } = setup([{ text: '', toolCalls: [schedule] }]);
    await say(user, 'Programa p1');
    const card = await screen.findByLabelText('Propuesta: Programar un pago');
    await waitFor(() =>
      expect(card).toHaveTextContent('Programar pago · A-1 · vie 30 oct · $116.00 MXN'),
    );
    expect(card).toHaveTextContent('Fecha de pagoSin programar → vie 30 oct');
  });

  it('AC-010-07 una lectura es una fila de estado y listPayables se dibuja como mini tabla', async () => {
    const { user } = setup([
      { text: 'Busco.', toolCalls: [{ id: 'c1', name: 'listPayables', input: {} }] },
    ]);
    await say(user, '¿Qué vence?');
    expect(await screen.findByText('Listo.')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Consultando expedientes/ });
    expect(row).toHaveTextContent(/✓.*\d+ ms/);
    const table = screen.getByRole('table', { name: 'Expedientes encontrados' });
    expect(within(table).getByRole('link', { name: 'F-D0AEEB' })).toHaveAttribute(
      'href',
      '/expedientes/p1',
    );
    expect(table).toHaveTextContent('30 oct');
    expect(table).toHaveTextContent('$8,352.00MXN');

    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"invoiceNumber": "F-D0AEEB"/)).toBeInTheDocument();
  });

  it('AC-010-08 después de la respuesta sugiere seguimientos con el último resultado', async () => {
    const { user } = setup([
      { text: '', toolCalls: [{ id: 'c1', name: 'listPayables', input: {} }] },
    ]);
    await say(user, '¿Qué vence?');
    await screen.findByText('Listo.');
    const chips = screen.getByRole('group', { name: 'Seguimientos' });
    await user.click(within(chips).getByText('Programar F-D0AEEB'));
    expect(screen.getByLabelText('Mensaje')).toHaveValue('Programa el pago de F-D0AEEB');
  });

  it('AC-010-07 el texto llega en trozos y «Detener» corta la respuesta', async () => {
    const { user } = setup([{ text: 'Estoy revisando la cartera', toolCalls: [] }], { hold: true });
    await say(user, 'Hola');
    expect(await screen.findByText('Estoy revisando la cartera')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Detener' }));
    expect(await screen.findByText('Respuesta detenida.')).toBeInTheDocument();
    expect(screen.getByText('Estoy revisando la cartera')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
  });

  it('AC-010-08 sin mensajes sugiere preguntas con datos del tablero', async () => {
    const board = {
      ...dashboard,
      totals: {
        ...dashboard.totals,
        upcoming: { count: 2, amount: { MXN: '100.00', USD: '0.00' } },
      },
    };
    const { user } = setup([], { board });
    const chips = await screen.findByRole('group', { name: 'Sugerencias' });
    await waitFor(() =>
      expect(
        within(chips).getByText('2 facturas vencen esta semana — ¿cuáles?'),
      ).toBeInTheDocument(),
    );
    await user.click(within(chips).getByText('2 facturas vencen esta semana — ¿cuáles?'));
    expect(screen.getByLabelText('Mensaje')).toHaveValue(
      '¿Qué facturas vencen en los próximos 7 días?',
    );
  });

  it('AC-010-08 Enter envía y Mayús+Enter hace salto de línea', async () => {
    const { turnBodies, user } = setup([]);
    await user.type(screen.getByLabelText('Mensaje'), 'Hola{Shift>}{Enter}{/Shift}mundo');
    expect(screen.getByLabelText('Mensaje')).toHaveValue('Hola\nmundo');
    await user.keyboard('{Enter}');
    await screen.findByText('Listo.');
    expect(turnBodies()[0].messages[0]).toEqual({ role: 'user', text: 'Hola\nmundo' });
  });

  it('AC-010-08 soltar un archivo en el panel lo deja en el compositor con nombre y tamaño', () => {
    setup([]);
    const pdf = new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' });
    const panel = screen.getByRole('log', { name: 'Conversación' });
    const dataTransfer = { types: ['Files'], files: [pdf] };
    fireEvent.dragEnter(panel, { dataTransfer });
    expect(screen.getByText('Suelta la factura (PDF, PNG o JPG)')).toBeInTheDocument();
    fireEvent.drop(panel, { dataTransfer });
    expect(screen.queryByText('Suelta la factura (PDF, PNG o JPG)')).not.toBeInTheDocument();
    expect(screen.getByText('factura.pdf · 8 B')).toBeInTheDocument();
  });
});
