import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { z } from 'zod';

z.config(z.locales.es());

afterEach(() => {
  cleanup();
});

// Las gráficas miden su contenedor; jsdom no trae ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * `matchMedia` simulado: `setViewport(width)` decide qué consultas `min-width`/`max-width` se cumplen.
 * Sin llamarlo, ninguna se cumple (como antes: tabla y navegación compacta).
 */
let viewport: number | null = null;
export function setViewport(width: number | null) {
  viewport = width;
}
function matches(query: string) {
  if (viewport === null) return false;
  const min = /min-width:\s*([\d.]+)px/.exec(query);
  const max = /max-width:\s*([\d.]+)px/.exec(query);
  return (!min || viewport >= Number(min[1])) && (!max || viewport <= Number(max[1]));
}
window.matchMedia = (query: string) =>
  ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
afterEach(() => setViewport(null));
