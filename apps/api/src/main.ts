import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';
import { configureApp, createLogger } from './configure-app.js';

// Entrada de Vercel: busca main/app/index/server que importe '@nestjs/core' y sirve la app
// con app.listen() como una sola función. Por eso NestFactory se importa aquí y ningún otro
// archivo de src/ se llama app.ts, index.ts ni server.ts (lo vigila main.test.ts).
async function bootstrap(): Promise<void> {
  const logger = createLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, logger ? { logger } : {});
  configureApp(app);
  await app.listen(env.PORT);
}

void bootstrap();
