import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Back-office interno: pocos archivos son aceptables. Las gráficas (spec 009) van en su propio archivo
  // para que el resto no crezca; revisar si alguno pasa de 1 MB.
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'charts', test: /node_modules[\\/](@mui[\\/]x-|d3-|@mui[\\/]x-internals)/ },
          ],
        },
      },
    },
  },
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
