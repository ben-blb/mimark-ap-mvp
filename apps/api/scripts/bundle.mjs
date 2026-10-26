// Vercel pone dist/main.js en la raíz de la función (/var/task) pero deja package.json y node_modules en
// apps/api/, así que ahí no hay "type": "module" ni dependencias. Se empaqueta todo en dist/server.mjs (ESM por su
// extensión) y dist/main.js queda como cargador de una línea que funciona como CJS o como ESM.
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['dist/main.js'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Dependencias CJS que hacen require() de módulos de Node dentro de un bundle ESM.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  // Paquetes opcionales que Nest carga bajo demanda (con try/catch) y que la API no usa.
  external: [
    'class-transformer',
    'class-validator',
    '@nestjs/microservices',
    '@nestjs/websockets',
    '@nestjs/websockets/*',
    '@nestjs/platform-socket.io',
    '@nestjs/platform-fastify',
    '@nestjs/mapped-types',
    '@nestjs/mapped-types/*',
    '@fastify/static',
    '@fastify/view',
    'cache-manager',
  ],
  logLevel: 'warning',
});

writeFileSync('dist/main.js', "import('./server.mjs');\n");
