# Arquitectura · MIMARK AP

Cada documento recorre una línea recta, en una sola petición: **subir → guardar original → IA extrae → reglas
deciden → humano confirma → programa → registra pago**. La IA solo llena un formulario; reglas puras deciden; una
persona confirma. Todo lo demás es soporte.

> Prueba KISS para cada pieza nueva: ¿esto lo hace más difícil de leer, mantener o editar? Si sí, necesita un
> criterio de una spec que lo pague.

## 1. Vista del sistema

```
Navegador ──HTTPS──> proyecto Vercel ──/api/*──> servicio "api" (NestJS = 1 función)
                                      └──resto──> servicio "web" (estático)
                                                                              │
                                     ┌────────────────────┬──────────────────┼───────────────────┐
                                     ▼                    ▼                  ▼                   ▼
                              Neon Postgres        Vercel Blob privado    API del LLM       Logs de Vercel
                              (4 tablas)           (originales)           (1 llamada/doc)   (1 línea/petición)
```

- El navegador ve un solo origen: Vercel enruta `/api/*` al servicio `api` (`vercel.json` de la raíz). Sin CORS y con cookie first-party.
- La API se construye con `nest build` y Vercel usa `dist/main.js` (`apps/api/vercel.json` → `outputDirectory`).
- En local: `pnpm dev` levanta la API en :3000 y Vite en :5173 con proxy de `/api`.

## 2. Monorepo

| Carpeta              | Qué es                                      | Por qué ahí                                                   |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `apps/api`           | Backend NestJS 12 (ESM) + Prisma 7          | Servicio `api` de Vercel; única pieza que toca BD, Blob y LLM |
| `apps/web`           | React 19 + Vite 8 + MUI 9                   | Servicio `web` de Vercel; sin reglas de negocio               |
| `packages/contracts` | Esquemas Zod (tipo + validación)            | Lo único que comparten web y api; se construye a `dist/`      |
| `specs`              | Specs con criterios, diseño y tareas        | Fuente de verdad del comportamiento (SDD)                     |
| `docs`               | Este documento y las decisiones (ADR)       | Se lee, no se despliega                                       |
| `infra`              | Postgres local, guía de entornos, probador  | Lo que opera y verifica el sistema, no lo que lo forma        |
| `scripts`            | `spec-check`, `bootstrap`, hooks de agentes | Herramientas del repo, sin lógica de producto                 |

pnpm workspaces sin Turborepo: `pnpm -r` ordena y Vercel omite proyectos sin cambios.

## 3. Flujo de datos en una dirección

```
UI (features/<x>) ──fetch /api──> Controller ──1 método──> Service ──┬──> Rules (puras, sin I/O)
                                                                     ├──> Repository ──> Postgres
                                                                     └──> Client ──> Blob / LLM
```

Las llamadas siempre bajan; las respuestas regresan por el mismo camino. Nadie llama hacia arriba ni a su mismo
nivel. Lo revisa `pnpm layers` (`.dependency-cruiser.cjs`).

| Capa       | Archivo                    | Responsabilidad                                                  | Nunca                         |
| ---------- | -------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| Controller | `*.controller.ts`          | HTTP, validación con `@Body/@Query/@Param({ schema })`, `@Ctx()` | Prisma, reglas, clients       |
| Service    | `*.service.ts`             | El caso de uso en orden lineal; transacciones; DTO               | otros services; `req`/`res`   |
| Rules      | `*.rules.ts`               | Decisiones de negocio: validar, transicionar, calcular           | Nest, Prisma, red, reloj, env |
| Repository | `*.repository.ts`          | Única puerta a su tabla, con métodos de negocio                  | services, reglas, HTTP        |
| Client     | `integrations/*.client.ts` | Un tercero; devuelve tipos de contracts                          | base de datos, reglas         |

Dos reglas mantienen el flujo plano: un service lee de cualquier repositorio pero cada tabla se escribe solo desde
su módulo; y un service nunca llama a otro (lo compartido es una regla pura o un método de repositorio).

Sin interfaces ni adaptadores: Nest sustituye dependencias en pruebas con `overrideProvider`. Una interfaz solo se
justifica con un segundo proveedor real para la misma capacidad.

## 4. Datos

Cuatro tablas al terminar el MVP: `Supplier`, `PurchaseOrder` (incluye la recepción), `Payable` (documento,
extracción, decisión y pago) y `AuditEvent`. Cada spec agrega lo suyo con su migración.

- Dinero en `Decimal(14,2)`, comparado en centavos enteros. Fechas de negocio con `@db.Date`; "hoy" se calcula en
  `America/Monterrey` (Vercel corre en UTC).
- La salida de la IA se guarda intacta (`Payable.extraction`); los campos vigentes son columnas corregibles; quién
  corrigió qué está en `AuditEvent`.
- Duplicados: índices únicos `uuidKey` y `folioKey` que se llenan al confirmar. La base impide un segundo pago igual.
- Concurrencia sin locks: `updateMany({ where: { id, status: desde } })`; 0 filas → 409 `STALE_STATUS`.

## 5. Estados del expediente

```
uploaded → processing ─┬→ pending_confirmation ─(humano: confirmar)→ confirmed ─(programar)→ scheduled ─(pagar)→ paid
                       ├→ requires_review ──(humano: corregir)──┘
                       ├→ out_of_scope ─────(humano: reclasificar)
                       └→ failed ───────────(humano: reintentar)
requires_review | pending_confirmation | out_of_scope | failed ─(humano: descartar)→ discarded
```

Las reglas mueven `processing` a su resultado; solo una persona confirma, programa y registra el pago. La IA no
mueve ningún estado. La tabla `TRANSITIONS` y `allowedActions` viven en `payables.state.rules.ts`; la UI dibuja
`allowedActions` del DTO. (`discarded` se agregó al SRS en la spec 005.)

## 6. IA y seguridad

- Un modelo multimodal lee el PDF o la imagen directamente (sin OCR aparte) vía AI SDK, con salida validada por
  `ExtractionSchema` (Zod). Temperatura 0, un reintento, 60 s de límite.
- El modelo no recibe datos de la base ni la OC esperada, y no tiene herramientas: lo peor que puede hacer es llenar
  mal un campo, y las reglas lo detectan. El prompt es un archivo versionado; cada auditoría guarda su versión.
- Modo `AI_PROVIDER=fake` para desarrollo sin llaves (prohibido en producción).

| Prueba                     | Defensa estructural                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| PS-01 contenido ejecutable | React escapa todo; lint prohíbe `dangerouslySetInnerHTML`; el original se sirve con su tipo validado, `nosniff` y `no-store` |
| PS-02 tamaño excesivo      | Firma de bytes + límite de 4 MB antes de guardar o llamar a la IA                                                            |
| PS-03 prompt injection     | Sin herramientas ni secretos en contexto; el documento es dato                                                               |
| PS-04 autoridad inventada  | Las reglas validan contra la base (recepción), no contra texto libre                                                         |
| PS-05 acción no permitida  | No existe ningún endpoint de transferencias; `paid` solo lo registra una persona                                             |
| PS-06 extracción masiva    | El modelo solo ve el archivo actual                                                                                          |

Acceso: código compartido (hash scrypt en `ACCESS_CODE_HASH`) → cookie HMAC HttpOnly de 8 h. Guard global; rutas
abiertas con `@Public()`. Cuotas contadas en `audit_events` (intentos fallidos por IP; extracciones por día).

## 7. Observabilidad y errores

Un `requestId` (el `x-vercel-id` de Vercel) une lo que ve el usuario, el log y la auditoría:

```
UI: "No pudimos leer el documento… Ref. iad1::7xk2p"  →  Logs de Vercel: buscar el requestId  →  audit_events WHERE requestId = …
```

- Una línea JSON por petición `{ requestId, method, route, status, ms, actor, code }`, sin contenido de documentos.
- El detalle de negocio (modelo, versión de prompt, duración, razones, cambios) vive en `audit_events`, que dura más
  que los logs de Vercel Hobby.
- Todo error sale como `{ code, message, requestId, fieldErrors?, details? }`; el stack solo va al log.

## 8. Frontend

`features/<recurso>/` con `<recurso>.api.ts` (hooks de TanStack Query), páginas, diálogos y formularios puros.
`lib/api-client.ts` es el único `fetch` y valida cada respuesta con su esquema. Formularios con `useZodForm` y el
mismo esquema que valida la API. Sin estado global.

## 9. Pruebas

| Nivel         | Qué                                               | Dónde                          | Corre en                          |
| ------------- | ------------------------------------------------- | ------------------------------ | --------------------------------- |
| Unitarias     | Reglas, contratos, formularios                    | `*.test.ts(x)`                 | `pnpm check:fast`, hook de agente |
| Integración   | HTTP + Postgres real, terceros sustituidos        | `*.int.test.ts`                | `pnpm check`, CI                  |
| Aceptación    | CA-01…06 y PS-01…06 contra la URL pública         | `infra/probador`               | Tras desplegar (spec 007)         |
| Evaluación IA | Exactitud por campo, inventados, fuera de alcance | `infra/probador` (`pnpm eval`) | Antes de cambiar modelo o prompt  |

Vitest en todo el repo; los decoradores de Nest los compila Oxc (Vite 8) leyendo `tsconfig.json`.

## 10. Entornos

|             | Local                | Preview (PR)                        | Producción                  |
| ----------- | -------------------- | ----------------------------------- | --------------------------- |
| Web         | Vite :5173           | URL preview de `web`                | URL de producción           |
| API         | Nest :3000           | URL preview de `api`                | `mimark-ap-api.vercel.app`  |
| BD          | Postgres en Docker   | Neon, rama `preview`                | Neon, rama `main`           |
| Archivos    | `apps/api/.storage/` | Blob, prefijo `preview/`            | Blob, prefijo `production/` |
| Migraciones | `pnpm db:migrate`    | `prisma migrate deploy` en el build | igual                       |

Detalle de configuración en `infra/README.md`. Riesgos conocidos: Hobby es para uso personal no comercial (un
piloto real pasa a Pro sin cambiar código); las previews de `web` apuntan a la API de producción; Blob privado está
en beta; Neon escala a cero (primera consulta lenta).

## 11. Harness para agentes

| Pieza               | Dónde                                                              | Para qué                                                          |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Mapa corto          | `AGENTS.md` (+ uno por app); `CLAUDE.md` lo importa                | Contexto suficiente sin llenar la ventana                         |
| Specs con IDs       | `specs/`, `pnpm spec:check`                                        | Qué construir y prueba de que se construyó                        |
| Reglas ejecutables  | `.dependency-cruiser.cjs`, `eslint.config.js`, TypeScript `strict` | Errores con la instrucción para arreglarlos                       |
| Un "terminado"      | `pnpm check` (rápido: `pnpm check:fast`)                           | Ciclo de corrección corto y objetivo                              |
| Hooks               | `.claude/settings.json` → `scripts/hooks/`                         | Formato automático, archivos protegidos, check al terminar        |
| Skills              | `.claude/skills/spec-*`                                            | Mismo flujo para cualquier agente: redactar, implementar, revisar |
| Plantillas          | `modules/suppliers`, `features/suppliers`                          | Todo módulo nuevo sale con la misma forma                         |
| Determinismo        | "hoy" como parámetro, IA sustituida en pruebas, semilla fija       | Pruebas que no fallan al azar                                     |
| Decisiones escritas | `docs/decisiones.md`, Bitácora de cada spec                        | No se reabren decisiones cerradas                                 |
