import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Back-office interno: un solo bundle (~220 KB gzip con MUI) es aceptable. Revisar si pasa de 1 MB.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    // Mismo camino que en producción: la web llama a /api en su propio origen.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
