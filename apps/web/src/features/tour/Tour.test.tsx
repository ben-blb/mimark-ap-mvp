import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tour } from './Tour';
import { TOUR_STEPS } from './tour.steps';

function setup() {
  const onClose = vi.fn();
  const view = render(
    <>
      <button type="button">antes</button>
      <a href="/proveedores" data-tour="proveedores">
        Proveedores
      </a>
      <Tour onClose={onClose} />
    </>,
  );
  return { onClose, user: userEvent.setup(), ...view };
}

const N = TOUR_STEPS.length;

describe('Tour', () => {
  it('AC-012-05 es un diálogo con título, «Paso 1 de N», sin Atrás en el primero', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: TOUR_STEPS[0]?.title });
    expect(dialog).toHaveTextContent(`Paso 1 de ${N}`);
    expect(screen.queryByRole('button', { name: 'Atrás' })).not.toBeInTheDocument();
  });

  it('AC-012-05 al abrir, el foco queda dentro del diálogo', () => {
    setup();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('AC-012-05 Siguiente y Atrás avanzan y retroceden', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('dialog', { name: TOUR_STEPS[1]?.title })).toHaveTextContent(
      `Paso 2 de ${N}`,
    );
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByRole('dialog', { name: TOUR_STEPS[0]?.title })).toBeInTheDocument();
  });

  it('AC-012-05 en el último paso Siguiente es «Terminar» y cierra', async () => {
    const { user, onClose } = setup();
    for (let i = 1; i < N; i++) await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Terminar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('AC-012-05 Saltar y Esc cierran', async () => {
    const first = setup();
    await first.user.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(first.onClose).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = setup();
    await second.user.keyboard('{Escape}');
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });

  it('AC-012-05 devuelve el foco al cerrar', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(<Tour onClose={() => undefined} />);
    expect(trigger).not.toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('AC-012-06 resalta el elemento del paso y no resalta si no está en pantalla', async () => {
    const { user } = setup();
    expect(document.querySelector('[data-tour-highlight]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Siguiente' })); // Tablero: no existe
    expect(document.querySelector('[data-tour-highlight]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Siguiente' })); // Proveedores
    expect(document.querySelector('[data-tour-highlight="proveedores"]')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Proveedores' })).toBeInTheDocument();
  });

  it('AC-012-07 recorre el flujo completo en orden', async () => {
    const { user } = setup();
    const seen: string[] = [];
    for (let i = 0; i < N; i++) {
      seen.push(screen.getByRole('heading').textContent ?? '');
      if (i < N - 1) await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    }
    expect(seen).toEqual(TOUR_STEPS.map((s) => s.title));
    expect(TOUR_STEPS.map((s) => s.title.toLowerCase()).join('|')).toMatch(
      /bienvenida.*tablero.*proveedores.*órdenes.*expedientes.*asistente.*repetirlo/,
    );
    expect(TOUR_STEPS[4]?.body).toMatch(/nunca paga/);
  });
});
