# Backend · apps/api

NestJS 12 en ESM, Prisma 7 sobre Postgres. Vercel lo despliega como una sola función: elige como entrada el
primer `main|app|index|server` que importa `@nestjs/core`, así que la entrada es `src/main.ts` y en `src/` no
debe existir `app.ts`, `index.ts` ni `server.ts` (lo vigila `src/main.test.ts`). La configuración compartida con
las pruebas vive en `src/configure-app.ts`.

## Capas (una por archivo; el nombre dice el rol)

| Archivo                    | Hace                                                                                            | Puede usar                                                             | Nunca                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| `*.controller.ts`          | Rutas, valida con `@Body/@Query/@Param({ schema })`, arma `@Ctx()`, llama UN método del service | su service, contracts                                                  | Prisma, repositorios, clients |
| `*.service.ts`             | El caso de uso en orden lineal; abre transacciones; mapea a DTO                                 | repositorios (de cualquier módulo, para leer), rules, clients          | otro service, `req`/`res`     |
| `*.rules.ts`               | Decisiones de negocio puras                                                                     | contracts, `common/dates.ts`, `common/money.ts`, `common/app-error.ts` | Nest, Prisma, red, reloj, env |
| `*.repository.ts`          | Única puerta a su tabla, con métodos de negocio                                                 | `common/db.ts`, tipos de Prisma                                        | services, reglas, HTTP        |
| `integrations/*.client.ts` | Habla con UN tercero y devuelve tipos de contracts                                              | SDK del tercero, `config/env.ts`                                       | base de datos, reglas         |

`common/` es transversal (errores, validación, contexto, fechas, dinero) y no depende de ningún módulo.

## Convenciones

- Imports relativos con extensión `.js` (ESM): `import { X } from './x.service.js'`.
- Variables de entorno solo a través de `config/env.ts` (validadas con Zod al arrancar).
- Errores: `throw new AppError('CODIGO', 'mensaje para el usuario', { fieldErrors?, details? })`. El código debe
  existir en `contracts/errors.ts` y su estado HTTP en `common/app-error.ts`.
- Escrituras: `this.db.$transaction(async (tx) => { repo.x(..., tx); audit.log({ ...ctx, ... }, tx) })`.
- Cambios de estado: `moveStatus(id, [desde], hacia, tx)` con `updateMany` condicionado al estado actual.
- Fechas de negocio: `LocalDate` (`'AAAA-MM-DD'`); "hoy" = `toLocalDate(new Date(), env.BUSINESS_TZ)` en el
  service, y se pasa a las reglas. Dinero: `Decimal(14,2)` en la base, `Money` (texto) en contratos, centavos
  (`moneyToCents`) para comparar.
- Sin `console.*`: la línea de log por petición ya existe (`common/request-context.ts`) y el detalle de negocio va
  a `audit_events`. Nunca registres el contenido de un documento.
- Auditoría: `entity` en singular (`supplier`) y `action` = `entidad.verbo_en_pasado` (`supplier.updated`).

## Base de datos

1. Cambia `prisma/schema.prisma`.
2. `pnpm db:migrate --name <spec>-<cambio>` crea y aplica la migración (nunca la escribas ni la edites a mano).
3. CI verifica que el esquema y las migraciones coincidan.

## Pruebas

- Unitarias (`*.test.ts`): reglas y utilidades, sin base de datos. `pnpm --filter @mimark/api test:unit`.
- Integración (`*.int.test.ts`): HTTP contra la app completa y Postgres de pruebas, con
  `createTestApp()` de `test/app.ts`; `t.agent()` da un cliente con sesión y `t.reset()` vacía las tablas.
  Sustituye terceros con `createTestApp(b => b.overrideProvider(Client).useValue(fake))`.
- La base de pruebas se recrea desde las migraciones en cada corrida (`test/global-setup.ts`).
