import { defineConfig } from 'prisma/config';

// Prisma 7 no carga .env por su cuenta. En Vercel las variables ya vienen en el entorno.
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se usan las variables del entorno.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Las migraciones necesitan conexión directa; en Neon el pooler no sirve para migrar.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
});
