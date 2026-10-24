import { Global, Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository.js';

/** Global: todos los módulos registran auditoría. */
@Global()
@Module({ providers: [AuditRepository], exports: [AuditRepository] })
export class AuditModule {}
