import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/** Responde los turnos en orden y los endpoints de las herramientas con datos fijos. */
function setup(turns: Turn[]) {
  const queue = [...turns, { text: 'Listo.', toolCalls: [] }];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/assistant/turn') return Promise.resolve(json(queue.shift()));
    if (url.startsWith('/api/dashboard')) return Promise.resolve(json(dashboard));
    if (url.startsWith('/api/payables')) return Promise.resolve(json(payable));
    return Promise.reject(new Error(`sin respuesta para ${init?.method ?? 'GET'} ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AssistantPage />
    </QueryClientProvider>,
  );
  const calls = (prefix: string) => fetchMock.mock.calls.filter(([url]) => url.startsWith(prefix));
  const turnBodies = () =>
    calls('/api/assistant/turn').map(([, init]) => JSON.parse(init?.body as string));
  return { calls, turnBodies, user: userEvent.setup() };
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
    expect(calls('/api/dashboard').map(([url]) => url)).toEqual(['/api/dashboard?horizon=7']);
    const second = turnBodies()[1];
    expect(second.messages.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'c1',
      name: 'getDashboard',
    });
    expect(JSON.parse(second.messages.at(-1).result)).toMatchObject({ horizon: 7 });
  });

  it('AC-008-07 una escritura se muestra como propuesta y no llama al endpoint hasta confirmar', async () => {
    const { calls, turnBodies, user } = setup([{ text: 'Te propongo:', toolCalls: [schedule] }]);
    await say(user, 'Programa p1 para el viernes');

    const card = await screen.findByLabelText('Propuesta: Programar un pago');
    expect(card).toHaveTextContent('payOn: 2026-10-30');
    expect(calls('/api/payables')).toHaveLength(0);
    expect(screen.getByLabelText('Mensaje')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Listo.')).toBeInTheDocument();
    const [url, init] = calls('/api/payables')[0] ?? [];
    expect(url).toBe('/api/payables/p1/schedule');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ payOn: '2026-10-30' });
    expect(turnBodies()[1].messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'c1' });
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
  });

  it('AC-008-07 cancelar no llama a ningún endpoint y avisa al asistente', async () => {
    const { calls, turnBodies, user } = setup([{ text: '', toolCalls: [schedule] }]);
    await say(user, 'Programa p1');
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('Listo.')).toBeInTheDocument();
    expect(calls('/api/payables')).toHaveLength(0);
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
    const { calls, turnBodies, user } = setup([{ text: '', toolCalls: [upload] }]);
    await say(user, 'Sube la factura');

    expect(await screen.findByText('Adjunta la factura')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

    const pdf = new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Archivo de la factura'), pdf);
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(calls('/api/payables')).toHaveLength(1));
    const [url, init] = calls('/api/payables')[0] ?? [];
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
});
