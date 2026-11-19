import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequirePermission } from '../../app/RequirePermission';
import { setViewport } from '../../test/setup';
import { sessionKey } from '../session/session.api';
import { UploadsPage } from './UploadsPage';

const stamp = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const company = { id: 'co1', name: 'Quima Tlalnepantla', active: true, ...stamp };
const upload = {
  id: 'u1',
  companyId: 'co1',
  month: '2026-09',
  source: 'parlevel_sales',
  accountId: null,
  fileName: 'ventas.xlsx',
  status: 'previewed',
  uploadedBy: 'Ana',
  rowsRead: 1,
  rowsRejected: 0,
  entriesCount: 0,
  createdAt: '2026-10-01T10:00:00.000Z',
};
const previewBody = {
  upload,
  rowsRead: 1,
  rowsRejected: 0,
  rowsUnknownKiosk: 0,
  total: '100.00',
  rejected: [],
  sample: [
    { row: 2, date: '2026-09-01', kioskId: null, concept: 'Ventas', amount: '100.00', flags: [] },
  ],
};

const account = {
  id: 'a1',
  companyId: 'co1',
  name: 'Cheques',
  type: 'checking',
  last4: null,
  active: true,
  ...stamp,
};
const pdfUpload = {
  ...upload,
  id: 'u2',
  source: 'bank_pdf',
  accountId: 'a1',
  fileName: 'estado.pdf',
  month: '2026-10',
};
const draftBody = {
  upload: pdfUpload,
  openingBalance: '1000.00',
  closingBalance: '1100.01',
  rows: [
    {
      row: 1,
      date: '2026-10-02',
      concept: 'SPEI',
      withdrawal: null,
      deposit: '100.00',
      balance: '1100.00',
      discarded: false,
      flags: [],
    },
  ],
  balanceCheck: { ok: false, difference: '0.01' },
  warnings: [],
};
let confirmBody: unknown = null;

let uploads: unknown[] = [];
const calls: { method: string; url: string }[] = [];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url });
      const json = (body: unknown, status = 200) =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        );
      if (method === 'POST' && url === '/api/closing/uploads') {
        uploads = [upload];
        return json(previewBody, 201);
      }
      if (method === 'POST' && url === '/api/closing/uploads/bank-pdf') {
        uploads = [pdfUpload];
        return json(draftBody, 201);
      }
      if (method === 'PATCH' && url === '/api/closing/uploads/u2/draft') {
        return json({
          ...draftBody,
          closingBalance: '1100.00',
          balanceCheck: { ok: true, difference: '0.00' },
        });
      }
      if (method === 'POST' && url === '/api/closing/uploads/u2/confirm') {
        confirmBody = JSON.parse(String(init?.body));
        uploads = [{ ...pdfUpload, status: 'confirmed', entriesCount: 1 }];
        return json(uploads[0]);
      }
      if (method === 'POST' && url === '/api/closing/uploads/u1/confirm') {
        uploads = [{ ...upload, status: 'confirmed', entriesCount: 1 }];
        return json(uploads[0]);
      }
      const path = url.split('?')[0] ?? '';
      if (path === '/api/closing/companies') return json({ items: [company] });
      if (path === '/api/closing/accounts') return json({ items: [account] });
      if (path === '/api/closing/uploads') return json({ items: uploads });
      return json({ items: [] });
    }),
  );
}

function setup(role: 'admin' | 'manager') {
  uploads = [];
  confirmBody = null;
  calls.length = 0;
  stubApi();
  setViewport(1440);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionKey, {
    userId: 'u1',
    actor: 'Ana',
    role,
    mustChangePassword: false,
    expiresAt: '2026-12-28T00:00:00.000Z',
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RequirePermission permission="reports:write">
          <UploadsPage />
        </RequirePermission>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // La página valida el tipo por su cuenta: el filtro `accept` del input no debe esconder ese camino.
  return userEvent.setup({ applyAccept: false });
}

/** Espera a que lleguen las empresas: sin empresa elegida las tarjetas no aceptan archivos. */
async function ready() {
  await waitFor(() => expect(screen.getByLabelText('Empresa')).toHaveValue('co1'));
}

afterEach(() => vi.unstubAllGlobals());

describe('UploadsPage (spec 021)', () => {
  it('AC-021-01 muestra una tarjeta por fuente, todas «sin cargar», con empresa y mes', async () => {
    setup('admin');
    await ready();
    expect(screen.getByLabelText('Mes')).toBeInTheDocument();
    for (const title of [
      'Ventas Parlevel',
      'Mermas y robos Parlevel',
      'Cantaloupe',
      'Banco',
      'Banco (PDF)',
      'Caja',
      'Nómina',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getAllByText('Sin cargar')).toHaveLength(7);
  });

  it('AC-021-01 AC-021-08 sube un archivo, muestra la vista previa y al confirmar queda «Confirmada»', async () => {
    const user = setup('admin');
    await ready();
    const card = screen.getByRole('region', { name: 'Ventas Parlevel' });
    const file = new File(['x'], 'ventas.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(within(card).getByLabelText('Archivo'), file);

    expect(await within(card).findByText(/Filas leídas: 1/)).toBeInTheDocument();
    expect(within(card).getByText('Vista previa pendiente')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Confirmar' }));

    expect(await within(card).findByText(/Confirmada/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/uploads/u1/confirm'))).toBe(
      true,
    );
    expect(within(card).queryByRole('button', { name: 'Confirmar' })).toBeNull();
  });

  it('AC-021-02 un archivo que no es .xlsx ni .csv se rechaza en el navegador, sin llamar a la API', async () => {
    const user = setup('admin');
    await ready();
    const card = screen.getByRole('region', { name: 'Caja' });
    await user.upload(
      within(card).getByLabelText('Archivo'),
      new File(['%PDF'], 'factura.pdf', { type: 'application/pdf' }),
    );
    expect(
      await within(card).findByText('Solo se aceptan archivos .xlsx o .csv.'),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('AC-021-02 un archivo de más de 4 MB se rechaza en el navegador', async () => {
    const user = setup('admin');
    await ready();
    const card = screen.getByRole('region', { name: 'Caja' });
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'caja.csv', { type: 'text/csv' });
    await user.upload(within(card).getByLabelText('Archivo'), big);
    expect(await within(card).findByText(/pesa más de 4 MB/)).toBeInTheDocument();
  });

  it('AC-021-01 gerencia no ve esta pantalla: solo quien tiene reports:write carga', () => {
    setup('manager');
    expect(screen.getByText('Tu rol no tiene acceso a esta página.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('AC-022-01 AC-022-03 sube el PDF, muestra el borrador y confirma aceptando la diferencia de saldos', async () => {
    const user = setup('admin');
    await ready();
    const card = screen.getByRole('region', { name: 'Banco (PDF)' });
    await waitFor(() => expect(within(card).getByLabelText('Cuenta')).toHaveValue('a1'));
    await user.upload(
      within(card).getByLabelText('Archivo'),
      new File(['%PDF-'], 'estado.pdf', { type: 'application/pdf' }),
    );

    expect(await within(card).findByLabelText('Concepto fila 1')).toHaveValue('SPEI');
    expect(within(card).getByText('Borrador pendiente de confirmar')).toBeInTheDocument();
    const confirm = within(card).getByRole('button', { name: 'Confirmar' });
    expect(confirm).toBeDisabled();

    await user.click(within(card).getByRole('checkbox', { name: /Acepto la diferencia/ }));
    await user.click(confirm);

    expect(await within(card).findByText(/Confirmada/)).toBeInTheDocument();
    expect(confirmBody).toEqual({ acceptDifference: true });
  });

  it('AC-022-06 editar una fila actualiza el semáforo de saldos con la respuesta de la API', async () => {
    const user = setup('admin');
    await ready();
    const card = screen.getByRole('region', { name: 'Banco (PDF)' });
    await waitFor(() => expect(within(card).getByLabelText('Cuenta')).toHaveValue('a1'));
    await user.upload(
      within(card).getByLabelText('Archivo'),
      new File(['%PDF-'], 'estado.pdf', { type: 'application/pdf' }),
    );
    const concept = await within(card).findByLabelText('Concepto fila 1');
    await user.clear(concept);
    await user.type(concept, 'SPEI corregido');
    await user.tab();

    expect(await within(card).findByText('Los saldos cuadran')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/u2/draft'))).toBe(true);
    expect(within(card).getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('AC-022-01 un archivo que no es PDF se rechaza en el navegador, sin llamar a la API', async () => {
    const user = setup('admin');
    await ready();
    const card = screen.getByRole('region', { name: 'Banco (PDF)' });
    await waitFor(() => expect(within(card).getByLabelText('Cuenta')).toHaveValue('a1'));
    await user.upload(
      within(card).getByLabelText('Archivo'),
      new File(['x'], 'estado.xlsx', { type: 'application/vnd.ms-excel' }),
    );

    expect(await within(card).findByText('Solo se aceptan archivos PDF.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});
