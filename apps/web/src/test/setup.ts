import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { z } from 'zod';

z.config(z.locales.es());

afterEach(() => {
  cleanup();
});
