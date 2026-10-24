# MIMARK · Cuentas por pagar

MVP que centraliza órdenes de compra, recepciones, facturas y pagos a proveedores. La IA extrae los datos de cada
documento; reglas deterministas los validan contra la orden de compra; una persona confirma, programa y registra el
pago. El sistema nunca ejecuta pagos.

## Arrancar en local

Requisitos: Node 22.22+, pnpm 10 (`corepack enable`), Docker (o cualquier Postgres 16).

```bash
pnpm install
pnpm bootstrap   # .env, Postgres, migraciones y datos sintéticos
pnpm dev         # http://localhost:5173 · código de acceso local: mimark-local
```

## Comandos

| Comando                      | Qué hace                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`                   | API (:3000) y web (:5173) con recarga                                              |
| `pnpm check`                 | Tipos, lint, formato, capas, specs y todas las pruebas: la definición de terminado |
| `pnpm check:fast`            | Lo mismo sin lint, formato ni integración (~30 s)                                  |
| `pnpm spec:check`            | Estado de las specs y qué criterios tienen prueba                                  |
| `pnpm db:migrate --name <x>` | Nueva migración tras cambiar `apps/api/prisma/schema.prisma`                       |
| `pnpm db:seed`               | Datos sintéticos (proveedores y, desde la spec 003, órdenes de compra)             |

## Cómo está organizado

```
apps/api            NestJS 12 + Prisma 7 (una Vercel Function)
apps/web            React 19 + Vite 8 + MUI 9 (estático)
packages/contracts  esquemas Zod que comparten web y api
specs/              qué hace el sistema: criterios de aceptación, diseño y tareas
docs/               ARCHITECTURE.md y decisiones.md
infra/              Postgres local y guía de despliegue en Vercel + Neon
```

## Estado

| Spec                                             | Estado                                |
| ------------------------------------------------ | ------------------------------------- |
| 001 Acceso · 002 Proveedores                     | hechas (repositorio base funcionando) |
| 003 Órdenes de compra → 007 Evidencia de entrega | listas para implementar, en orden     |

El desarrollo sigue specs (`specs/README.md`). Con Claude Code: `/spec-implementar 003`, luego `/spec-revisar 003`,
y así hasta la 007. Lee `AGENTS.md` antes de cambiar código.

Despliegue: `infra/README.md`. Arquitectura y decisiones: `docs/`.
