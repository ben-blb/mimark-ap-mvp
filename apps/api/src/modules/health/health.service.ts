import { Injectable } from '@nestjs/common';
import { Db } from '../../common/db.js';
import { env } from '../../config/env.js';

export interface HealthDto {
  status: 'ok' | 'degraded';
  db: 'ok' | 'error';
  version: string;
  environment: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly db: Db) {}

  async check(): Promise<HealthDto> {
    const db = await this.db.$queryRaw`SELECT 1`.then(
      () => 'ok' as const,
      () => 'error' as const,
    );
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      environment: env.VERCEL_ENV ?? env.NODE_ENV,
    };
  }
}
