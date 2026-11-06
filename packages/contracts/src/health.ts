import { z } from 'zod';

/** Respuesta de `GET /api/health`: 200 aunque la base no responda (`db: 'error'`). */
export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'error']),
  version: z.string(),
  environment: z.string(),
});
export type Health = z.infer<typeof Health>;
