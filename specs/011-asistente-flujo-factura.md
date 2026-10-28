---
id: '011'
titulo: Asistente · factura en un paso, alta guiada y conversaciones guardadas
estado: hecha
depende_de: ['010']
requisitos: Extensión posterior al SRS; modifica AC-008-08 y el alcance de 008; respeta la regla 6
---

# 011 · Asistente: factura en un paso, alta guiada y conversaciones guardadas

## Objetivo

Tres mejoras al chat de `/asistente`:

1. **Subir una factura es un solo paso.** Adjuntar el archivo y enviar el mensaje sube la factura; ya no hay una
   tarjeta "Confirmar subida" aparte.
2. **Alta guiada.** Si la factura no coincide con ningún proveedor u OC, el asistente guía desde el chat el alta del
   proveedor, de la OC y de la recepción, y vuelve a evaluar la factura. Cada alta sigue siendo una propuesta que una
   persona confirma.
3. **Varias conversaciones guardadas** por persona, en la base de datos.

## Alcance

**Incluye:** subida directa al enviar con adjunto; prompt `assistant@2` con el flujo de alta guiada;
tablas `conversations` y `conversation_messages`; módulo `conversations` (`/api/conversations`); lista de
conversaciones en `/asistente`; enmienda de ADR-14.

**No incluye:** que el modelo lea los bytes del archivo; ejecutar altas sin clic (solo la subida se dispara por el
envío de la persona); compartir conversaciones entre personas; búsqueda dentro de conversaciones; guardar los archivos
adjuntos (solo queda su nombre); un motivo de revisión nuevo `SUPPLIER_NOT_FOUND` en la validación (spec 004 no cambia).

## Criterios de aceptación

### Subida en un paso

- **AC-011-01** · Dado un archivo adjunto válido y un texto, cuando la persona envía el mensaje, entonces la web sube
  la factura a `POST /api/payables` sin mostrar tarjeta de confirmación, la conversación registra la subida como una
  herramienta ya ejecutada (con su resultado) y el asistente continúa con ese resultado.
- **AC-011-02** · Dado que la subida falla (p. ej. cuota diaria), cuando la persona envía, entonces se muestra el error,
  el asistente no responde, el mensaje no se agrega a la conversación y el archivo sigue adjunto.
- **AC-011-03** · Dado el catálogo del asistente, cuando el modelo devuelve `uploadPayable`, entonces se descarta
  (`pickToolCalls`): solo la web sube facturas; el prompt es `assistant@2`.
- **AC-011-04** · Dado un archivo adjunto sin texto, cuando la persona envía (Enter o botón), entonces se sube igual y
  el mensaje enviado al asistente es "Revisa la factura adjunta".

### Alta guiada

- **AC-011-05** · Dado un expediente con `PO_NOT_FOUND`, cuando el asistente lo revisa, entonces busca al proveedor por
  RFC con `listSuppliers` y, si no existe, propone `createSupplier` con nombre, RFC y moneda del expediente y
  `creditDays` solo si la persona lo dio (si no, lo pregunta).
- **AC-011-06** · Dado que el proveedor ya existe (o se acaba de crear), cuando falta la OC, entonces propone
  `createPurchaseOrder` con el folio, el total y la moneda del expediente y el `supplierId` real; la fecha de la OC la
  da la persona (no se infiere de la factura).
- **AC-011-07** · Dado que la OC existe pero la recepción no está confirmada (`RECEIPT_NOT_CONFIRMED`), cuando el
  asistente lo detecta, entonces pregunta si la mercancía se recibió y solo entonces propone `recordReceipt`.
- **AC-011-08** · Dado que se creó el proveedor o la OC, cuando termina el alta, entonces el asistente propone
  `correctFields { id, poNumber }` con el mismo folio de OC para volver a evaluar el expediente y lee el resultado.
- **AC-011-09** · Dado cualquier alta propuesta, cuando la tarjeta se muestra, entonces nada se escribe hasta
  Confirmar, de a una propuesta por vez, con las etiquetas de `lib/labels.ts` y todo como texto.
- **AC-011-10** [manual] · Con `AI_PROVIDER=anthropic` y una factura sintética de `infra/probador` con proveedor y OC
  inexistentes: sube con Enter, propone proveedor → OC → recepción → reevaluación, y el expediente queda en
  `pending_confirmation` sin salir del chat.

### Conversaciones guardadas

- **AC-011-11** · Dado que no hay sesión, cuando se llama cualquier ruta de `/api/conversations`, entonces responde 401
  `UNAUTHENTICATED`.
- **AC-011-12** · Dado `PUT /api/conversations/:id` con título y mensajes válidos, cuando es la primera vez, entonces
  crea la conversación; cuando ya existe, reemplaza sus mensajes; en ambos casos deja un evento `conversation.saved`
  (sin texto de mensajes) en la misma transacción y devuelve `ConversationDto`.
- **AC-011-13** · Dado `GET /api/conversations`, cuando la persona A tiene 3 y la persona B 2, entonces A ve solo las
  suyas, ordenadas por última actualización; `GET /api/conversations/:id` de otra persona responde 404 `NOT_FOUND`.
- **AC-011-14** · Dado un cuerpo con más de 200 mensajes, un título de más de 120 caracteres o un id que no es UUID,
  cuando se llama el `PUT`, entonces responde 400 `VALIDATION`.
- **AC-011-15** · Dado `DELETE /api/conversations/:id` propio, cuando se llama, entonces la borra con sus mensajes y deja
  `conversation.deleted`; sobre una ajena responde 404.
- **AC-011-16** · Dado que se terminó un turno del asistente, cuando la persona espera, entonces la web guarda la
  conversación sola; al recargar `/asistente`, la lista muestra las conversaciones y abrir una restaura sus mensajes.
- **AC-011-17** · Dado que se abre una conversación guardada, cuando se muestra, entonces las propuestas ya decididas
  aparecen como resueltas (Hecho / Cancelada) y las que quedaron pendientes aparecen como "Sin decidir" sin botones; el
  guardado no ejecuta ninguna herramienta.
- **AC-011-18** · Dado "Nueva conversación" y "Eliminar" en la lista, cuando se usan, entonces la primera limpia el chat
  sin perder la actual (queda guardada) y la segunda pide confirmación antes de borrar.

## Diseño

### Subida directa

La web, en `send()`, si hay adjunto ejecuta `runTool` con una llamada sintética `uploadPayable` (id local
`upload-<uuid>`), antes de pedir el turno. Si sale bien agrega a la conversación un mensaje del asistente con esa
llamada y su resultado como mensaje `tool`, y llama a `advance`. Si falla, `setError` y no se toca la conversación.
Es la persona (adjuntar + enviar) quien ejecuta; el modelo no interviene (regla 6 intacta). `uploadPayable` sale del
catálogo que se le describe al modelo (`pickToolCalls` lo descarta) pero sigue en `ASSISTANT_TOOLS` para el runner y
los renderers.

### Alta guiada

Sin endpoints nuevos. Solo prompt `assistant@2` y copy: tras la subida lee el expediente con `getPayable`; si hay
`PO_NOT_FOUND`: `listSuppliers` por RFC → `createSupplier` si no existe → `createPurchaseOrder` → (si
`RECEIPT_NOT_CONFIRMED`) `recordReceipt` → `correctFields { poNumber }` con el mismo folio, que es la forma de
reevaluar (`PayablesReviewService.correct` vuelve a cargar el contexto aunque el campo no cambie). Una escritura por
vez, porque cada una depende del id de la anterior.

### Datos

Migración `011-conversaciones`:

```prisma
model Conversation {
  id        String   @id @db.Uuid
  actor     String
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  ConversationMessage[]
  @@index([actor, updatedAt(sort: Desc)])
  @@map("conversations")
}

model ConversationMessage {
  conversationId String       @db.Uuid
  seq            Int
  payload        Json
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@id([conversationId, seq])
  @@map("conversation_messages")
}
```

`payload` es un `AssistantMessage` más, opcionalmente, el estado de ejecución de cada propuesta.

### Contratos

`packages/contracts/src/conversations.ts`: `ConversationSummary { id, title, updatedAt }`, `ConversationDto`
(`+ messages: StoredMessage[]`), `SaveConversationInput { title (≤120), messages (≤200) }`. `StoredMessage` =
`AssistantMessage` + `decisions` por id de llamada (`confirmed | cancelled | failed | pending`) para reconstruir las
tarjetas (AC-011-17). Los resultados de herramientas ya viajan truncados (`MAX_TOOL_RESULT`).

### API

| Método y ruta                   | Entrada                 | Salida                  | Errores                                                           |
| ------------------------------- | ----------------------- | ----------------------- | ----------------------------------------------------------------- |
| `GET /api/conversations`        | —                       | `ConversationSummary[]` | `UNAUTHENTICATED`                                                 |
| `GET /api/conversations/:id`    | —                       | `ConversationDto`       | `UNAUTHENTICATED`, `NOT_FOUND`                                    |
| `PUT /api/conversations/:id`    | `SaveConversationInput` | `ConversationDto`       | `UNAUTHENTICATED`, `VALIDATION`, `NOT_FOUND` (id de otra persona) |
| `DELETE /api/conversations/:id` | —                       | 204                     | `UNAUTHENTICATED`, `NOT_FOUND`                                    |

Módulo `apps/api/src/modules/conversations/` con la forma de `suppliers` (controller → service → repository). Solo
el repositorio escribe las tablas (regla 3). El título lo calcula la web (primeras palabras del primer mensaje).

### UI

`features/assistant/conversations.api.ts` (query keys + mutaciones), lista lateral/superior en `AssistantPage`
(`ConversationList.tsx`), ruta `asistente/:id?`. Autoguardado con `PUT` al terminar cada turno o decisión. Una conversación
nueva usa un UUID generado en el cliente. Reabrir una conversación reconstruye `messages`, `runs` y `decisions`; las
pendientes se muestran sin botones.

### Auditoría

`conversation.saved` y `conversation.deleted` (entidad `conversation`, `entityId` = id, sin texto). La cuota diaria de
turnos (`assistant.answered`) no cambia.

## Tareas

- [x] 1. ADR-14 y spec 008 enmendados; `docs/decisiones.md`, `specs/README.md` (mapa).
- [x] 2. `assistant@2`, `pickToolCalls` descarta `uploadPayable`, fake actualizado (AC-011-03, 05–08).
- [x] 3. Web: subida directa en `send()` con pruebas (AC-011-01, 02, 04, 09).
- [x] 4. Contratos `conversations.ts` y su prueba (AC-011-14).
- [x] 5. Migración y módulo `conversations` con `conversations.int.test.ts` (AC-011-11, 12, 13, 15).
- [x] 6. Web: `conversations.api.ts`, lista, autoguardado y restauración con pruebas (AC-011-16, 17, 18).
- [x] 7. Verificación manual (AC-011-10) y bitácora.

## Fuera de alcance y decisiones

- **Subir con adjunto + envío es una acción de la persona** (decisión del usuario, 2026-10-28): se enmienda ADR-14; el
  modelo sigue sin ejecutar nada ni leer el archivo.
- **Conversaciones en la base de datos** (decisión del usuario, 2026-10-28), no en el navegador.
- **Reevaluar con `correctFields { poNumber }`** y no con un endpoint nuevo ni `retryPayable` (este solo reintenta
  extracciones fallidas).
- **La fecha de la OC la da la persona**: la fecha de la factura no es la de la OC.
- No se agrega `SUPPLIER_NOT_FOUND` a la validación: spec 004 no cambia.

## Bitácora

<!-- AAAA-MM-DD · nota -->

- 2026-10-28 · Spec redactada a partir del plan aprobado por el usuario y aprobada ("Aprobada, implementa").
- 2026-10-28 · `assistant.v1.ts` se renombró a `assistant.v2.ts` (nadie más importaba v1). `uploadPayable` sigue en `ASSISTANT_TOOLS` para el runner y los renderers de la web, y `WEB_ONLY_TOOLS` (contracts) lo oculta al modelo y lo descarta en `pickToolCalls`.
- 2026-10-28 · `depende_de` quedó en `['010']`: `spec:check` no deja cerrar una spec que depende de otra en progreso, y 008 sigue abierta solo por la verificación manual contra la URL pública (AC-008-12) y su tarea de documentación. 011 modifica el comportamiento de 008 y 010 (ya hecha) ya trae el asistente con streaming.
- 2026-10-28 · Las decisiones de las propuestas se guardan en una columna `decisions Json` de `conversations` (no en cada mensaje): se escriben junto con la conversación completa y mantienen `conversation_messages.payload` igual al `AssistantMessage` del contrato. Las lecturas (`runs`) no se guardan: se reconstruyen del mensaje `tool`; si el resultado fue recortado por el tope, la fila se ve sin su componente.
- 2026-10-28 · `configureApp` sube el límite del JSON a 4 MB: el cuerpo por defecto (100 KB) no alcanzaba para conversaciones con resultados de herramientas de hasta 20 000 caracteres.
- 2026-10-28 · `⌘K` dentro de `/asistente/...` se queda en la conversación abierta; fuera del asistente abre una nueva.
- 2026-10-28 · AC-011-10 verificado en local (`pnpm dev`, `AI_PROVIDER=anthropic`, `claude-haiku-5-5`, navegador integrado; el PDF se adjuntó con `DataTransfer` por JavaScript). Factura sintética de `infra/probador` con proveedor «Herrajes del Pacífico» (RFC `HPA110203QW4`) y OC `OC-9901` inexistentes. Un solo Enter la sube sin tarjeta; el asistente consulta proveedores y OC, no los encuentra y pregunta días de crédito y fecha de la OC. Propone y, al confirmar una por una, queda: proveedor → OC → `correctFields { poNumber }` → recepción → `correctFields` otra vez; el expediente termina en `pending_confirmation`. Reabrir la conversación desde la lista restaura todo con las propuestas como "Hecho".
- 2026-10-28 · Hallazgo: registrar la recepción por sí sola no reevalúa el expediente (el modelo lo había dado por hecho). El prompt `assistant@2` ahora pide `correctFields { poNumber }` también tras la recepción. La tarjeta de `correctFields` mostraba `poNumber`; ahora dice "Orden de compra".
- 2026-10-28 · Pendiente menor: la tarjeta de `createPurchaseOrder` muestra el id del proveedor, no su nombre.
