import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConfirmPayable, useUploadPayable } from './payables.api';

const failure = () =>
  new Response(JSON.stringify({ code: 'INVALID_TRANSITION', message: 'No', requestId: 'r1' }), {
    status: 409,
    headers: { 'content-type': 'application/json' },
  });

function setup() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(failure())),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

afterEach(() => vi.unstubAllGlobals());

describe('payables.api: recarga lo que cambia', () => {
  it('AC-006-06 una acción sobre un expediente recarga también el tablero, aunque falle', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useConfirmPayable('p1'), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['payables'] });
  });

  it('AC-006-06 subir un documento recarga la lista y el tablero', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUploadPayable(), { wrapper });
    act(() => result.current.mutate(new FormData()));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['payables'] });
  });
});
