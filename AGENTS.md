# MIMARK AP · guía para agentes

MVP de cuentas por pagar para MIMARK: se sube una factura, la IA extrae sus datos, reglas deterministas los
validan contra la orden de compra, una persona confirma y registra el pago. El sistema nunca ejecuta pagos.

## Mapa

```
apps/api/            NestJS 12 (ESM) + Prisma 7 → una Vercel Function     guía: apps/api/AGENTS.md
apps/web/            React 19 + Vite 8 + MUI 9 → estático en Vercel        guía: apps/web/AGENTS.md
packages/contracts/  esquemas Zod compartidos (tipo + validación)
specs/               qué debe hacer el sistema (fuente de verdad)          guía: specs/README.md
docs/                ARCHITECTURE.md (cómo y por qué) · decisiones.md (ADR)
infra/               Postgres local, guía de entornos · probador (spec 007)
scripts/             spec-check, bootstrap, hooks de agentes
```

## Comandos

| Comando                                  | Para qué                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm bootstrap`                         | Entorno local listo: `.env`, Postgres (Docker), migraciones y semilla                            |
| `pnpm dev`                               | API en :3000 y web en :5173 (contratos en watch)                                                 |
| `pnpm check:fast`                        | Tipos + capas + specs + pruebas unitarias. Antes de cada commit                                  |
| `pnpm check`                             | Todo lo anterior + lint + formato + integración (necesita Postgres). **Definición de terminado** |
| `pnpm spec:check`                        | Estado de las specs y trazabilidad criterio ↔ prueba                                             |
| `pnpm db:migrate --name <spec>-<cambio>` | Migración nueva después de cambiar `schema.prisma`                                               |

## Cómo se trabaja: la spec manda

1. Todo comportamiento nuevo o distinto empieza en una spec (`specs/README.md`). Sin spec `lista`, no hay código.
2. Implementa tarea por tarea: primero la prueba (su nombre empieza con el ID del criterio, `AC-004-03`), luego el
   código, luego `pnpm check:fast`, luego commit.
3. Si la spec es ambigua o está mal, detente y corrígela (o pregunta). No implementes otra cosa.
4. Terminas cuando `pnpm check` está en verde y la spec pasa a `hecha` (`pnpm spec:check` lo valida).

## Reglas de arquitectura (las revisa una máquina)

1. Backend en una dirección: `controller → service → (rules | repository | client)`. Nunca al revés ni entre
   services. (`pnpm layers`)
2. La lógica de negocio vive solo en `*.rules.ts`: funciones puras, sin I/O, sin `new Date()`, sin `process.env`.
   (`pnpm lint`, `pnpm layers`)
3. Cada tabla se escribe solo desde el repositorio de su módulo; otros módulos solo la leen.
4. Cada escritura va con su evento de auditoría en la misma transacción.
5. Los tipos que comparten web y api viven en `packages/contracts` (Zod). Los errores usan el catálogo de
   `contracts/errors.ts`.
6. La IA solo extrae datos. Nada que venga de un documento decide un estado ni ejecuta una acción.
7. La web habla con la API solo por `lib/api-client.ts` y muestra el contenido de documentos y de la IA siempre
   como texto.
8. Nada de secretos ni documentos reales en el repositorio. Los datos de prueba son sintéticos.

Ante cada pieza nueva: ¿esto lo hace más difícil de leer, mantener o editar? Si sí, necesita un criterio de una
spec que lo justifique. Nada de puertos/adaptadores, buses de eventos, colas ni capas extra (ver
`docs/decisiones.md`).

## Plantillas

- Módulo de backend: copia `apps/api/src/modules/suppliers` (controller, service, repository, module, pruebas).
- Pantalla: copia `apps/web/src/features/suppliers` (`*.api.ts`, página, diálogo, formulario y su prueba).

## Límites

- No edites migraciones aplicadas, archivos `.env`, `pnpm-lock.yaml` ni `src/generated` (un hook lo bloquea).
- No desactives reglas de lint, de capas ni pruebas para pasar el check: arregla la causa.
- Dependencias nuevas solo si la spec las pide; si no, justifícalo en la Bitácora de la spec.
- Nunca digas "listo" sin la salida de `pnpm check:fast` (o `pnpm check` al cerrar una spec).
