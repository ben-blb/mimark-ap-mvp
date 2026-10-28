# Decisiones de arquitectura (ADR)

Una entrada por elección con alternativas reales. No se editan: si una decisión cambia, se agrega una nueva que
diga cuál reemplaza. Formato: decisión · alternativas · por qué · revisar si.

## ADR-01 · Monorepo con pnpm workspaces, sin Turborepo

- **Decisión:** un repositorio con `apps/api`, `apps/web`, `packages/contracts`, `infra`, `specs`, `docs`.
- **Alternativas:** tres repositorios; Turborepo o Nx.
- **Por qué:** los contratos se comparten sin publicar paquetes, un PR cambia web y api juntos y los agentes ven todo
  el sistema. `pnpm -r` ya ordena por dependencias y Vercel omite proyectos sin cambios.
- **Revisar si:** el CI tarda más de 5 minutos → Turborepo con caché remota.

## ADR-02 · Dos proyectos de Vercel y reescritura de `/api`

- **Decisión:** `web` (estático) y `api` (NestJS) desde el mismo repo; `web` reenvía `/api/*` a `api`.
- **Alternativas:** un proyecto con una función que envuelve Nest a mano; CORS entre dos dominios.
- **Por qué:** cada app usa su preset de Vercel; el navegador ve un solo origen (sin CORS, cookie first-party).
- **Revisar si:** se necesitan previews de punta a punta → dominio propio con subdominios.

## ADR-03 · Neon Postgres con Prisma 7 y `@prisma/adapter-pg`

- **Decisión:** Postgres gratuito de Neon (ramas `main` y `preview`); Prisma 7 con el adaptador `pg`.
- **Alternativas:** Supabase (pausa proyectos inactivos), Prisma Postgres, `adapter-neon`.
- **Por qué:** plan gratuito permanente (0.5 GB y 100 CU-hora por proyecto) que escala a cero; `adapter-pg` funciona
  igual contra Postgres local y contra Neon.
- **Revisar si:** más de 0.5 GB o cómputo agotado → plan Launch. Prisma 8 estable → evaluar migración.

## ADR-04 · Vercel Blob privado para los originales

- **Decisión:** un store privado con prefijo por entorno; disco local cuando no hay token.
- **Alternativas:** `bytea` en Postgres; S3 o R2.
- **Por qué:** nativo en Vercel, token inyectado, lectura solo autenticada; deja los 0.5 GB de Neon para datos.
- **Revisar si:** la beta cambia su API → el cambio cabe en `integrations/storage.client.ts`.

## ADR-05 · Un LLM multimodal vía AI SDK, sin OCR aparte

- **Decisión:** una llamada por documento con salida validada por Zod (`Output.object`).
- **Alternativas:** OCR dedicado + LLM; parser propio de PDF.
- **Por qué:** una llamada, un esquema, un tipo de error. Cambiar de proveedor es un `case` y una variable.
- **Revisar si:** exactitud < 95 % → modelo mayor o prompt v2 medidos con `pnpm eval`; para CFDI, leer el XML sin IA.

## ADR-06 · Procesamiento síncrono

- **Decisión:** subir, extraer, validar y guardar en una petición.
- **Alternativas:** cola + worker + polling.
- **Por qué:** un documento tarda segundos y Hobby permite 300 s. Un flujo que se lee en un solo método.
- **Revisar si:** cargas por lote o p95 mayor a 60 s → cola con un solo consumidor.

## ADR-07 · Código de acceso y cookie firmada

- **Decisión:** entrada con código, nombre y rol; cookie HMAC HttpOnly de 8 h; sin tabla de sesiones.
- **Alternativas:** Auth.js, Clerk u otro proveedor de identidad.
- **Por qué:** el SRS no exige identidad corporativa para la entrega; actor y rol bastan para la auditoría.
- **Revisar si:** piloto real → proveedor de identidad reemplazando el módulo `session`; el resto no cambia.

## ADR-08 · Cuotas contadas en Postgres

- **Decisión:** intentos fallidos de acceso y extracciones diarias se cuentan en `audit_events`.
- **Alternativas:** Redis con rate limit; firewall de Vercel.
- **Por qué:** un `count()` sobre una tabla que ya existe; sin servicio, cuenta ni secreto extra.
- **Revisar si:** tráfico público real → reglas de firewall.

## ADR-09 · Contratos Zod compartidos y validación nativa de Nest 12

- **Decisión:** `packages/contracts` con un archivo por recurso; Nest valida con `@Body({ schema })` (Standard
  Schema) y la web con el mismo esquema en `useZodForm`.
- **Alternativas:** OpenAPI con generador de código; class-validator.
- **Por qué:** un esquema es tipo y validación en los tres bordes (formulario, API, salida de la IA), sin paso de
  generación.
- **Revisar si:** clientes externos consumen la API → generar OpenAPI desde los mismos esquemas.

## ADR-10 · Capas simples y reglas puras

- **Decisión:** controller, service, rules, repository y client; sin puertos ni adaptadores.
- **Alternativas:** arquitectura hexagonal con interfaces por dependencia.
- **Por qué:** separa lo que cambia por motivos distintos sin duplicar cada clase; Nest sustituye dependencias en
  pruebas sin interfaces.
- **Revisar si:** aparece un segundo proveedor real de la misma capacidad → interfaz solo para esa capacidad.

## ADR-11 · Vitest en todo el repositorio

- **Decisión:** una herramienta de pruebas para api, web, contracts y probador.
- **Alternativas:** Jest.
- **Por qué:** una configuración y un estilo; Vite 8 (Oxc) compila los decoradores de Nest con su metadata.

## ADR-12 · ESM en todo el monorepo, TypeScript 6

- **Decisión:** API en ESM (`"type": "module"`, imports con `.js`), NestJS 12, TypeScript 6.0.
- **Alternativas:** CommonJS; TypeScript 7.
- **Por qué:** NestJS 12, Prisma 7 y Zod 4 publican ESM; un solo formato evita paquetes duales. TypeScript 7 aún no es
  compatible con typescript-eslint ni con el CLI de Nest (octubre 2026).
- **Revisar si:** typescript-eslint y `@nestjs/cli` soportan TypeScript 7.

## ADR-13 · Desarrollo guiado por specs con trazabilidad verificable

- **Decisión:** una spec por archivo con criterios `AC-NNN-NN`; las pruebas citan el ID; `pnpm spec:check` exige una
  prueba por criterio en specs `hecha`. Skills de Claude Code para redactar, implementar y revisar.
- **Alternativas:** Spec Kit u otras herramientas con varios archivos por spec; issues sin trazabilidad.
- **Por qué:** con pocos devs y muchos agentes, la spec es el contrato y la máquina verifica que se cumplió.
- **Revisar si:** las specs crecen tanto que un archivo deja de leerse de una vez → dividir la spec, no el formato.

## ADR-14 · Asistente con herramientas que solo proponen

- **Decisión:** el asistente (spec 008) llama al LLM con herramientas sin `execute`, descritas desde
  `contracts/assistant.ts`. La API valida las llamadas y las devuelve; la web ejecuta las lecturas y, tras un clic de
  la persona, las escrituras, por los endpoints existentes. Sin streaming ni conversación guardada.
- **Alternativas:** ejecutar las herramientas en el servidor (agente con `execute`); servidor MCP; `useChat` de
  `@ai-sdk/react` con streaming.
- **Por qué:** la IA nunca ejecuta una acción (regla 6) y una factura con instrucciones ocultas a lo más produce una
  propuesta cancelable (PS-03). Cada escritura conserva su validación, sus reglas de estado y su auditoría con el
  actor real, sin duplicar lógica ni llamar services entre módulos. `useChat` saltaría `lib/api-client.ts` (regla 7).
- **Revisar si:** se necesitan respuestas largas en tiempo real → streaming sobre el mismo contrato; o se quiere
  operar desde otro cliente → MCP sobre el mismo catálogo, manteniendo la confirmación humana.
