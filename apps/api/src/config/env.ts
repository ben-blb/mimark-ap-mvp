import { z } from 'zod';

// Mensajes de validación en español para cualquier campo sin mensaje propio.
z.config(z.locales.es());

// En local se lee apps/api/.env. En Vercel y en las pruebas las variables ya vienen en el entorno.
if (!process.env.VERCEL && !process.env.VITEST) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Sin .env: se usan las variables del entorno.
  }
}

const DEV_SECRET_PREFIX = 'dev-only';

const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.string().min(1, 'Falta DATABASE_URL'),
    ACCESS_CODE_HASH: z
      .string()
      .regex(
        /^scrypt\$[\w-]+\$[\w-]+$/,
        'ACCESS_CODE_HASH inválido. Genéralo con: pnpm --filter @mimark/api access:hash "<código>"',
      ),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET necesita al menos 32 caracteres aleatorios'),
    BUSINESS_TZ: z.string().default('America/Monterrey'),
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
    AI_PROVIDER: z.enum(['anthropic', 'google', 'fake']).default('fake'),
    AI_MODEL: z.string().optional(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    DAILY_AI_LIMIT: z.coerce.number().int().min(1).default(30),
    DAILY_AI_LIMIT_GLOBAL: z.coerce.number().int().min(1).default(200),
  })
  .refine((e) => e.VERCEL_ENV !== 'production' || !e.SESSION_SECRET.startsWith(DEV_SECRET_PREFIX), {
    message: 'SESSION_SECRET de desarrollo en producción: genera uno nuevo',
    path: ['SESSION_SECRET'],
  })
  .refine((e) => e.VERCEL_ENV !== 'production' || e.AI_PROVIDER !== 'fake', {
    message: 'AI_PROVIDER=fake no se permite en producción',
    path: ['AI_PROVIDER'],
  })
  .refine((e) => e.AI_PROVIDER === 'fake' || !!e.AI_MODEL, {
    message: 'Falta AI_MODEL (obligatorio si AI_PROVIDER no es fake)',
    path: ['AI_MODEL'],
  })
  .refine((e) => !e.VERCEL_ENV || !!e.BLOB_READ_WRITE_TOKEN, {
    message: 'Falta BLOB_READ_WRITE_TOKEN (obligatorio en Vercel)',
    path: ['BLOB_READ_WRITE_TOKEN'],
  });

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Variables de entorno inválidas:\n${z.prettifyError(parsed.error)}`);
}

/** Configuración validada. Es el único lugar del backend que lee process.env. */
export const env = parsed.data;
