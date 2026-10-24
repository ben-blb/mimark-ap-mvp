import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/env.js';

// Los decoradores de Nest (y su metadata) los compila Oxc a partir de tsconfig.json.
export default defineConfig({
  test: {
    env: TEST_ENV,
    setupFiles: ['reflect-metadata'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'int',
          include: ['src/**/*.int.test.ts'],
          globalSetup: ['test/global-setup.ts'],
          // Comparten una sola base de pruebas: un archivo a la vez.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
