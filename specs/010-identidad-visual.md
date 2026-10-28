---
id: '010'
titulo: Identidad visual y asistente con componentes
estado: en-progreso
depende_de: ['009']
requisitos: Usabilidad (extensión); modifica AC-009-01, AC-009-02 (apariencia), AC-009-03 y la UI de 008
---

# 010 · Identidad visual y asistente con componentes

## Objetivo

Que MIMARK AP se vea como una herramienta contable bien hecha y no como una plantilla genérica: "libro mayor
moderno", con los números como protagonistas y color solo cuando algo pide acción. Y que el asistente responda con
componentes (tablas, detalle, confirmaciones) y en streaming, en lugar de solo texto. El sistema visual vive en
`apps/web/DESIGN.md`.

## Alcance

**Incluye:** tema nuevo claro/oscuro (tokens de `DESIGN.md`, IBM Plex), navegación lateral pegada al borde,
tablero con franja de resumen, línea de tiempo de días de pago y barra apilada por vencimiento, tabla compartida
`DataTable` en órdenes, expedientes y proveedores, `dueOn` en la lista de expedientes, endpoint de streaming del
asistente y asistente con renderers por herramienta, confirmaciones antes → después, sugerencias, adjuntos por
arrastre y atajo `⌘K`.

**No incluye:** cambios de reglas de negocio, de rutas de la web o de los endpoints existentes (salvo `dueOn` en la
lista de expedientes); que el servidor ejecute herramientas (sigue la regla 6 y ADR-14); XML como adjunto
(`ALLOWED_MIME_TYPES` sigue siendo PDF/PNG/JPG); selector manual de tema; guardar conversaciones.

## Criterios de aceptación

- **AC-010-01** · El tema sigue `prefers-color-scheme` con los tokens de `DESIGN.md`: fondo plano (sin gradientes,
  blur ni `backdrop-filter`), un solo acento (`primary`) distinto de `#0A84FF`, radios de 6 px (controles) y 8 px
  (contenedores), IBM Plex Sans en la UI e IBM Plex Mono en folios; las transiciones se quitan con
  `prefers-reduced-motion: reduce`. Modifica AC-009-01.
- **AC-010-02** · Desde `md` la barra lateral mide 220 px, está pegada al borde con un divisor de 1 px, marca la ruta
  activa con `aria-current="page"` y una barra de 2 px, muestra la marca como texto ("MIMARK" y "Cuentas por
  pagar") y abajo el nombre y el rol de la sesión. Abajo de `md` se conserva la barra inferior de AC-009-02.
- **AC-010-03** · Dado el tablero con datos de ejemplo, entonces muestra: una línea "N expedientes en revisión" con
  el enlace "Revisar →" (solo si N > 0); una franja con 4 cifras (por pagar, vencido, próximos N días, pagado este
  mes) sin centavos y con la moneda como sufijo, MXN y USD por separado (se mantienen AC-006-02 y AC-006-06); si
  lo vencido es 0, la cifra dice "Al corriente" y no usa color de error; los días de pago como filas con fecha,
  total, número de expedientes y una barra proporcional, y un clic en uno filtra la tabla del tablero a ese día; y la cartera por
  vencimiento como barra apilada (vencido / ≤ 7 días / ≤ 15 días / después) con montos, o como una frase si solo
  hay un segmento con datos. El horizonte 7/15/30 se elige con pestañas. Cada gráfica tiene su alternativa en
  texto. Modifica AC-009-03.
- **AC-010-04** · En órdenes de compra, expedientes y proveedores, la tabla (`DataTable`) tiene filas de 40–44 px
  con divisores de 1 px y sin tarjeta contenedora; una fila con destino se abre con clic y con Enter desde el
  teclado; el texto largo se corta con "…" y muestra el texto completo en un tooltip. En órdenes: la recepción es un
  punto de color con la fecha corta ("25 oct"; el año solo si no es el actual) y quién recibió en texto
  secundario; la columna Estado aparece solo con el filtro "Todas"; "Confirmar recepción" se ve completo; los
  filtros son un solo select más el buscador; el folio va en monoespaciada. Abajo de `sm` se conservan las
  tarjetas de AC-009-04.
- **AC-010-05** · Dado un expediente con vencimiento calculado, cuando se llama `GET /api/payables`, entonces su
  item trae `dueOn` (`YYYY-MM-DD`); sin vencimiento, `dueOn` es `null`. La herramienta `listPayables` del asistente
  lo recibe igual (usa el mismo endpoint).
- **AC-010-06** · `POST /api/assistant/stream` recibe `AssistantTurnInput` y responde `text/event-stream` con
  eventos `delta { text }` mientras el modelo escribe y al final un evento `done { text, toolCalls }` con las
  mismas llamadas filtradas que `/turn` (AC-008-03), o `error { code, message }` si el modelo falla. Sin sesión,
  con cuerpo inválido o sin cuota responde 401/400/429 en JSON como `/turn`, sin abrir el stream ni llamar al LLM.
  Si la persona corta la conexión, se aborta la llamada al modelo. Cada turno (también uno abortado) deja
  `assistant.answered` y ninguna tabla de negocio cambia (AC-008-05).
- **AC-010-07** · En `/asistente`, el texto del asistente aparece mientras llega (región `aria-live`) y "Detener"
  corta la respuesta; cada herramienta se muestra como una fila de estado (corriendo, ✓ con su tiempo, ✕ con su
  error) que se expande para ver parámetros y resultado como texto; `listPayables` se dibuja como mini tabla
  (folio con enlace, proveedor, monto, vencimiento, estado con punto), `getPayable` como factura vs OC vs
  recepción con ✓/✕ por campo, y cada escritura como confirmación antes → después en lenguaje de negocio (p. ej.
  "Programar pago · F-120 · vie 30 oct · $8,352.00 MXN") con Confirmar y Cancelar, que tras confirmar queda "Hecho"
  con la hora. Todo el contenido del modelo y de los documentos se muestra como texto (AC-008-10).
- **AC-010-08** · Sin mensajes, el asistente sugiere 3–4 preguntas armadas con datos del tablero; después de cada
  respuesta sugiere 2–3 seguimientos según el último resultado. Soltar un archivo sobre el panel muestra una capa
  "Suelta la factura" y el archivo queda en el compositor con nombre y tamaño. En el compositor, Enter envía y
  Mayús+Enter hace salto de línea (hasta 6 líneas); `⌘K` o `Ctrl+K` lleva al compositor desde cualquier pantalla.
  El desplazamiento automático se pausa si la persona sube en la conversación.
- **AC-010-09** [manual] · Revisión visual contra la lista de anti-patrones de `DESIGN.md`. Cómo verificarlo:
  `pnpm dev` y el navegador a 1440 px (claro y oscuro) y 375 px en tablero, órdenes, expedientes, proveedores y
  asistente; sin desbordes, contraste AA y foco visible; capturas antes/después en la bitácora.

## Diseño

### Datos

Sin cambios en `schema.prisma` ni migración (`dueOn` ya existe en `payables`).

### Contratos

- `payables.ts`: `PayableSummaryDto` agrega `dueOn: LocalDate.nullable()`.
- `assistant.ts`: `AssistantStreamEvent = discriminatedUnion('type', [delta { text }, done AssistantTurnOutput,
error { code: ErrorCode, message }])`.

### API

| Método y ruta                | Entrada              | Salida                                        | Errores                                                             |
| ---------------------------- | -------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `POST /api/assistant/stream` | `AssistantTurnInput` | `text/event-stream` de `AssistantStreamEvent` | `UNAUTHENTICATED`, `VALIDATION`, `QUOTA_EXCEEDED`, `AI_UNAVAILABLE` |

- `assistant.client.ts`: `stream(input, signal, onDelta)` con `streamText` (mismas opciones y herramientas sin
  `execute`); con `AI_PROVIDER=fake` emite la respuesta fake en trozos.
- `assistant.service.ts`: la cuota y el cierre (filtrar + auditar) se comparten entre `turn` y `stream`.
- `assistant.controller.ts`: `POST stream` escribe los eventos y aborta al cerrarse la petición. `/turn` se queda.

### UI

- `DESIGN.md` y `app/theme.ts`: tokens, tipografía y anti-patrones. Fuentes con `@fontsource`.
- `components/`: `Money`, `StatusDot`, `SummaryStrip`, `DataTable`; salen `StatCard`, `BrandMark`, `StatusChip` y las
  gráficas de `@mui/x-charts`.
- `lib/api-client.ts`: `api.stream(...)` lee el SSE y valida cada evento con su esquema (sigue siendo la única puerta).
- `features/assistant/`: `toolRenderers` (nombre de herramienta → componente), `ToolCallRow`, `ConfirmAction`
  (reemplaza `ProposalCard`), `suggestions.ts` (puro).

### Auditoría

Sin acciones nuevas: el streaming registra `assistant.answered` como `/turn`.

## Tareas

- [x] 1. `DESIGN.md`, tema nuevo y fuentes (AC-010-01).
- [x] 2. `AppShell` y `PageHeader` sin subtítulo (AC-010-02).
- [x] 3. Componentes `Money`, `StatusDot`, `SummaryStrip`, `DataTable` con pruebas.
- [x] 4. Tablero (AC-010-03).
- [x] 5. Órdenes, expedientes y proveedores con `DataTable` (AC-010-04).
- [ ] 6. `dueOn` en la lista de expedientes (AC-010-05).
- [ ] 7. Endpoint `/assistant/stream` y `api.stream` (AC-010-06).
- [ ] 8. Asistente con renderers, confirmaciones, sugerencias, adjuntos y atajo (AC-010-07, AC-010-08).
- [ ] 9. Revisión visual (AC-010-09) y bitácora.

## Fuera de alcance y decisiones

- **Streaming real por SSE** (decisión del usuario, 2026-10-28) en un endpoint nuevo; `/turn` se conserva para las
  pruebas y el probador. Modifica el "No incluye: streaming" de la spec 008.
- **Claro y oscuro** (decisión del usuario): el oscuro "papel oscuro" es el de referencia; el claro es "papel claro"
  con el mismo sistema.
- **IBM Plex con `@fontsource`** (decisión del usuario): se sirven desde la app, sin depender de Google Fonts.
- **Sin `@mui/x-charts`**: la línea de tiempo y la barra apilada son `Box` con anchos proporcionales; no hace falta
  una librería de gráficas.
- Depende solo de 009 (como 009 de 006): el asistente de 008 cambia de aspecto y de transporte, no de reglas.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-10-28 · Spec redactada a partir del brief de rediseño del usuario.
- 2026-10-28 · Dependencias: `+@fontsource/ibm-plex-sans`, `+@fontsource/ibm-plex-mono` (fuentes del sistema
  visual); `-@mui/x-charts` (sin uso tras el tablero nuevo).
- 2026-10-28 · El terciario del brief (`#6E6A64`) da 3.5:1 sobre el fondo: no pasa AA. Se usa `#8A857E` (5.1:1).
- 2026-10-28 · El clic en un día de pago filtra la tabla del propio tablero: `GET /api/payables` no filtra por día de
  pago y la spec no cambia endpoints.
- 2026-10-28 · La barra apilada se calcula en la web (`features/dashboard/portfolio.ts`) desde `items` (vencidos y
  próximos del horizonte) y `totals.pending`; una barra por moneda para no sumar MXN y USD.
- 2026-10-28 · Órdenes de compra no tiene página de detalle: la fila abre la edición (`DataRow onOpen`).
- 2026-10-28 · La sesión no trae email (solo `actor` y `role`): la barra lateral muestra nombre y rol.
- 2026-10-28 · Los colores viven en `app/tokens.ts` (el tema pasaba el tope de 300 líneas del lint).
