import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { DbModule } from './common/db.js';
import { ErrorFilter } from './common/error.filter.js';
import { validationPipe } from './common/validation.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PayablesModule } from './modules/payables/payables.module.js';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module.js';
import { SessionGuard } from './modules/session/session.guard.js';
import { SessionModule } from './modules/session/session.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';

/** Todo lo que existe en el backend, de un vistazo. Cada spec agrega aquí su módulo. */
@Module({
  imports: [
    DbModule,
    AuditModule,
    HealthModule,
    SessionModule,
    SuppliersModule,
    PurchaseOrdersModule,
    PayablesModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_PIPE, useValue: validationPipe },
  ],
})
export class AppModule {}
