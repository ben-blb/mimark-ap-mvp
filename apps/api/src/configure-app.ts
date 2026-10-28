import { ConsoleLogger, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { requestContext } from './common/request-context.js';
import { env } from './config/env.js';

/**
 * Configuración que comparten main.ts (producción) y test/app.ts (pruebas), para que las
 * pruebas corran exactamente la misma app que Vercel.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  (app as NestExpressApplication).set('trust proxy', true);
  // Una conversación guardada puede traer resultados de herramientas de hasta 20 000 caracteres cada uno.
  (app as NestExpressApplication).useBodyParser('json', { limit: '4mb' });
  app.use(requestContext);
}

/** En producción, una línea JSON por evento (fácil de buscar en los logs de Vercel). */
export function createLogger(): ConsoleLogger | undefined {
  return env.NODE_ENV === 'production'
    ? new ConsoleLogger({ json: true, colors: false })
    : undefined;
}
