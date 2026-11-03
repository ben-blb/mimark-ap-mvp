---
id: '014'
titulo: Partidas de OC, checklist de recepción y carga del PDF de ParLevel
estado: hecha # borrador | lista | en-progreso | hecha
depende_de: ['003', '004', '013']
requisitos: RF-02, RF-03 (extensión)
---

# 014 · Partidas de OC, checklist de recepción y carga del PDF de ParLevel

## Objetivo

Que una orden de compra (OC) tenga su lista de elementos (partidas), que confirmar su llegada sea marcar **todas**
las partidas en un checklist (cómodo desde un celular en el almacén) y que, al crear la OC, se pueda subir el PDF que
genera ParLevel para que la IA proponga la lista y una persona la verifique antes de guardar.

## Alcance

**Incluye:** partidas por OC (SKU opcional, descripción, cantidad, unidad, precio unitario, importe calculado);
captura manual de partidas en el formulario; edición de partidas mientras la recepción esté pendiente; checklist de
recepción obligatorio y completo; extracción con IA del PDF de ParLevel hacia un **borrador** y paso de verificación
antes de guardar; semilla con partidas; **modifica AC-003-01, AC-003-04, AC-003-08 y AC-003-09** (ver "Cambios a
specs anteriores").

**No incluye:** recepciones parciales ni cantidades recibidas distintas a las pedidas (el checklist es todo-o-nada,
igual que en 003; si falta algo, no se confirma y se anota fuera del sistema); guardar el PDF (solo se lee para
extraer; ver decisiones); validar la factura partida por partida contra la OC (la spec 004 sigue comparando
totales); catálogo de productos; dependencias nuevas.

> **Supuesto a validar:** no se tiene un PDF real de ParLevel. La extracción está pensada para un PDF típico de OC
> (encabezado con folio, proveedor con RFC, fecha y moneda; tabla con código, descripción, cantidad, unidad, precio e
> importe; subtotal, impuestos y total). El prompt es versionado y no depende de un diseño fijo, pero hay que
> evaluarlo con un PDF real antes de usarlo (tarea 9).

## Criterios de aceptación

- **AC-014-01** · Dada una OC nueva con 1 a 200 partidas, cuando se registra, entonces responde 201 con sus partidas
  en orden, cada una con `amount = round(quantity × unitPrice, 2)` calculado por el servidor (ej. 3 × 1,250.50 =
  3,751.50), y el evento `purchase_order.created` incluye las partidas. Una OC sin partidas responde 400
  `VALIDATION` con `fieldErrors.lines`.
- **AC-014-02** · Cada partida valida: descripción 1–200 caracteres, cantidad > 0 con hasta 3 decimales, unidad 1–20
  caracteres, precio unitario ≥ 0 con hasta 4 decimales, SKU opcional de hasta 60. Un error indica la partida y el
  campo (`fieldErrors['lines.2.quantity']`).
- **AC-014-03** · El total de la OC (con impuestos) no puede ser menor que la suma de los importes de las partidas;
  si lo es, responde 400 con `fieldErrors.total`. La diferencia (total − suma) se interpreta como impuestos y se
  devuelve como `taxes` en el DTO.
- **AC-014-04** · Mientras la recepción esté `pending`, `PATCH` con `lines` reemplaza toda la lista (se revalida el
  total contra la nueva suma) y deja `purchase_order.updated` con `changes.lines` (antes y después). Con la
  recepción `received` responde 409 `INVALID_TRANSITION`.
- **AC-014-05** · Al confirmar la recepción de una OC con partidas, el cuerpo debe traer `checkedLineIds` con **todas**
  las partidas y ninguna ajena. Si falta alguna o sobra una responde 400 `VALIDATION` con
  `fieldErrors.checkedLineIds` y la OC sigue `pending`. Con todas marcadas se comporta como AC-003-04 y el evento
  `purchase_order.received` registra `data.lineCount`.
- **AC-014-06** · Una OC creada antes de esta spec (sin partidas) se sigue recibiendo con el formulario de 003 y
  `checkedLineIds` vacío o ausente. Si trae ids, responde 400.
- **AC-014-07** · `POST /api/purchase-orders/extract` recibe un PDF (campo `file`, mismo límite de tamaño y mismo
  chequeo de firma `%PDF-` que la spec 004; solo PDF) y responde 201 (como todo `POST` de la API) con un **borrador** (`PurchaseOrderDraft`):
  folio, RFC y nombre del proveedor leídos, el proveedor activo que coincide por RFC (o `null`), fecha, moneda,
  referencia de ParLevel, partidas, subtotal, impuestos, total, `uncertainFields` y `warnings`. **No crea ni
  modifica ninguna OC.** Requiere `orders:write`.
- **AC-014-08** · Sin archivo responde 400 `VALIDATION` (`fieldErrors.file`); un archivo que no es PDF por su
  contenido o está vacío, 415 `FILE_TYPE_NOT_ALLOWED`; uno demasiado grande, 413 `FILE_TOO_LARGE`. Si la IA falla o
  devuelve algo fuera del esquema responde 502 `AI_UNAVAILABLE` (el mismo error que la extracción de facturas) y la
  persona puede capturar a mano.
- **AC-014-09** · `warnings` avisa, sin bloquear, cuando: el folio ya existe; el RFC no coincide con un proveedor
  activo; la suma de `quantity × unitPrice` de una partida no coincide con el importe que trae el PDF (tolerancia de
  0.01); la suma de partidas no coincide con el subtotal del PDF; falta algún dato obligatorio de una partida.
  Cada aviso dice a qué partida o campo se refiere.
- **AC-014-10** · Cada extracción cuenta contra las cuotas diarias de IA (`DAILY_AI_LIMIT` por persona y
  `DAILY_AI_LIMIT_GLOBAL`) y deja `purchase_order.extracted` con modelo, versión del prompt, duración y número de
  partidas; nunca el contenido del documento. Pasada la cuota responde 429 `QUOTA_EXCEEDED`.
- **AC-014-11** · La extracción trata el documento como dato (regla 6 de AGENTS.md): el cliente de IA no recibe
  herramientas ni datos de la base y el prompt ordena ignorar instrucciones dentro del documento. Una OC solo
  existe si una persona la guarda desde el paso de verificación con `POST /api/purchase-orders`.
- **AC-014-12** · En "Nueva OC" hay dos caminos: "Subir PDF de ParLevel" o "Capturar a mano". Con el PDF, el
  formulario se abre prellenado en un paso de **verificación** que muestra el borrador, resalta los campos dudosos y
  los avisos, permite editar, agregar y quitar partidas, y muestra suma de partidas, impuestos implícitos y total. No
  se puede guardar con avisos de campos obligatorios vacíos; los demás avisos se aceptan marcando "Revisé las
  partidas contra el PDF".
- **AC-014-13** · Si el proveedor del borrador coincide, queda elegido y la moneda sale del PDF; si no coincide, la
  persona debe elegirlo (solo activos) antes de guardar.
- **AC-014-14** · Confirmar la recepción abre un checklist con una fila por partida (descripción, SKU, cantidad y
  unidad), cada una con casilla; el botón "Confirmar recepción" está deshabilitado hasta marcar todas; "Marcar todo"
  marca el resto; hay contador "3 de 8 recibidas". Para una OC sin partidas se muestra el diálogo de 003.
- **AC-014-15** [manual] · Responsivo: a 375 px de ancho el checklist ocupa toda la pantalla, cada fila es un blanco
  táctil de al menos 48 px (se puede tocar la fila entera, no solo la casilla), la fecha y las notas van arriba y el
  botón de confirmar queda fijo abajo con el contador; no hay scroll horizontal. Cómo verificarlo: con `pnpm dev`,
  abrir `/ordenes` en un viewport de 375 px, confirmar `OC-1003` y ver el flujo completo con el dedo/ratón.
- **AC-014-16** [manual] · En "Nueva OC" se sube un PDF de OC de ParLevel (o uno sintético equivalente), se revisa el
  borrador, se corrige una partida y se guarda; la lista y el detalle muestran las partidas. Cómo verificarlo:
  `pnpm dev` con `AI_PROVIDER=fake` y con un PDF real cuando exista.
- **AC-014-17** · La API devuelve las partidas en la lista y en el detalle de OC; la lista de `/ordenes` muestra el
  número de partidas, el diálogo de edición las muestra (de solo lectura si ya está recibida) y el checklist las
  muestra sin precios (almacén no los necesita).

## Diseño

### Datos

Migración `014-partidas-de-oc`:

```prisma
model PurchaseOrderLine {
  id              String        @id @default(cuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  /// Orden en el documento, desde 1.
  position        Int
  sku             String?
  description     String
  quantity        Decimal       @db.Decimal(12, 3)
  unit            String
  unitPrice       Decimal       @db.Decimal(14, 4)
  /// round(quantity × unitPrice, 2), calculado por la regla `lineAmount`.
  amount          Decimal       @db.Decimal(14, 2)

  @@unique([purchaseOrderId, position])
}
```

Agrega `lines PurchaseOrderLine[]` a `PurchaseOrder`. Sin relleno de OC existentes. La tabla se escribe solo desde
`PurchaseOrdersRepository` (regla 3). `PurchaseOrder.total` se conserva tal cual (con impuestos).

### Contratos

`contracts/purchase-orders.ts`:

```ts
export const PoLineInput = z.object({
  sku: z.string().trim().max(60).optional(),
  description: z.string().trim().min(1, 'Escribe la descripción').max(200),
  quantity: Quantity, // texto decimal > 0, hasta 3 decimales
  unit: z.string().trim().min(1, 'Escribe la unidad').max(20),
  unitPrice: UnitPrice, // texto decimal ≥ 0, hasta 4 decimales
});
export const PoLineDto = PoLineInput.extend({ id: Id, position: z.number().int(), amount: Money });
// CreatePurchaseOrderInput += lines: z.array(PoLineInput).min(1).max(200)
// UpdatePurchaseOrderInput += lines (opcional)
// PurchaseOrderDto += lines: z.array(PoLineDto), taxes: Money.nullable()   // null si no hay partidas
// ReceiptInput += checkedLineIds: z.array(Id).default([])
export const PurchaseOrderDraft = z.object({
  number: z.string().nullable(),
  supplierName: z.string().nullable(),
  supplierTaxId: z.string().nullable(),
  supplier: z
    .object({
      id: Id,
      name: z.string(),
      taxId: z.string(),
      creditDays: z.number().int(),
      currency: Currency,
    })
    .nullable(),
  issuedOn: LocalDate.nullable(),
  currency: Currency.nullable(),
  parlevelRef: z.string().nullable(),
  lines: z.array(PoLineDraft), // campos de PoLineInput como texto/nulo + `statedAmount: Money.nullable()`
  subtotal: Money.nullable(),
  taxes: Money.nullable(),
  total: Money.nullable(),
  uncertainFields: z.array(z.string()),
  warnings: z.array(z.object({ field: z.string(), message: z.string() })),
});
```

`contracts/extraction.ts` agrega `PoExtractionSchema` (lo único que la IA puede devolver para una OC: folio, nombre y
RFC del proveedor, fecha, moneda, referencia, partidas con `sku`, `description`, `quantity`, `unit`, `unitPrice`,
`amount`, subtotal, impuestos, total, `missingFields`, `uncertainFields`). Sin `min/max/regex` (como `ExtractionSchema`);
los formatos los revisa `normalizePoExtraction`.

### API

| Método y ruta                           | Entrada                              | Salida                   | Errores                                  |
| --------------------------------------- | ------------------------------------ | ------------------------ | ---------------------------------------- |
| `POST /api/purchase-orders/extract`     | multipart `file` (PDF)               | 201 `PurchaseOrderDraft` | 400, 413, 415, 429, 502 `AI_UNAVAILABLE` |
| `POST /api/purchase-orders`             | `CreatePurchaseOrderInput` + `lines` | 201 `PurchaseOrderDto`   | 400, 409                                 |
| `PATCH /api/purchase-orders/:id`        | `UpdatePurchaseOrderInput` + `lines` | `PurchaseOrderDto`       | 400, 404, 409 `INVALID_TRANSITION`       |
| `POST /api/purchase-orders/:id/receipt` | `ReceiptInput` + `checkedLineIds`    | `PurchaseOrderDto`       | 400, 404, 409                            |

`POST /extract` lleva `@Requires('orders:write')` y se declara **antes** de `:id`. Integración nueva:
`ExtractionClient.extractPurchaseOrder` (mismo cliente y modelo que las facturas, otro método: instrucciones
versionadas `prompts/extract-purchase-order.v1.ts`, un archivo, sin herramientas, `fake` para desarrollo con
`fake-po-extraction.ts`). El service del módulo `purchase-orders` revisa cuota con `AuditRepository.countSince`,
valida el archivo con las reglas de archivo de la spec 004 (`payables/file.rules.ts`, que son funciones puras) y arma el borrador con `SuppliersRepository` y
`PurchaseOrdersRepository.findByNumber`. La respuesta de la IA nunca llega al repositorio de escritura.

### Reglas

`purchase-orders.rules.ts` (puras):

```ts
lineAmount(quantity: string, unitPrice: string): Money          // centavos, mitad hacia arriba
linesSubtotal(lines): Money
checkTotalCoversLines(total: Money, subtotal: Money): void       // AC-014-03
checkChecklist(lineIds: string[], checkedIds: string[]): void   // AC-014-05/06: mismos ids, sin repetidos
buildDraftWarnings(draft, existingNumber: boolean): Warning[]    // AC-014-09
```

| Caso                                                   | Resultado                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `lineAmount('3', '1250.50')`                           | `3751.50`                                                              |
| `lineAmount('0.333', '10')`                            | `3.33`                                                                 |
| `checkChecklist(['a','b'], ['b','a'])`                 | sin error                                                              |
| `checkChecklist(['a','b'], ['a'])`                     | 400 `checkedLineIds`: «Marca todas las partidas»                       |
| `checkChecklist(['a'], ['a','z'])`                     | 400 `checkedLineIds`: «Hay partidas que no son de esta OC»             |
| `checkChecklist([], [])` · `checkChecklist([], ['a'])` | sin error · 400                                                        |
| total 1,160.00, partidas 1,000.00                      | sin error, `taxes = 160.00`                                            |
| total 900.00, partidas 1,000.00                        | 400 `total`: «El total no puede ser menor que la suma de las partidas» |

### UI

- `PurchaseOrderDialog` pasa a dos pasos: **Origen** (subir PDF / capturar a mano) → **Verificar y guardar**
  (formulario con tabla editable de partidas). En móvil las partidas son tarjetas apiladas en vez de tabla.
- `PoLinesEditor` (tarjetas editables con totales); los avisos y campos dudosos se muestran dentro de
  `PurchaseOrderForm`. El contenido del documento siempre se muestra como texto (regla 7).
- `ReceiptDialog` → `ReceiptChecklist`: pantalla completa en móvil (`fullScreen` bajo `sm`), filas con
  `ListItemButton` + `Checkbox`, contador y barra de acción fija abajo; sin partidas, el diálogo actual.
- `PurchaseOrdersPage` agrega la columna «Partidas»; no hay pantalla de detalle aparte: las partidas se ven en el
  diálogo de edición (`PurchaseOrderDialog`) y en el checklist.
- Warehouse no necesita ver precios para recibir: el checklist muestra descripción, SKU y cantidad.

### Auditoría

`purchase_order.created` (+ `data.after.lines`), `purchase_order.updated` (+ `changes.lines`),
`purchase_order.received` (+ `data.lineCount`), `purchase_order.extracted` (nueva; `data: { model, promptVersion,
ms, lineCount }`, `entityId` nulo porque aún no hay OC).

### Semilla

Partidas sintéticas para OC-1001…1005, con subtotal = total / 1.16 redondeado (los impuestos implícitos cuadran) y
al menos 3 partidas en OC-1003 (la pendiente) para probar el checklist. Los totales de 003 no cambian.

## Cambios a specs anteriores

| Criterio        | Cambio                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-003-01       | Registrar una OC exige `lines` (≥ 1). Cubierto por AC-014-01.                                                                                                                                                                |
| AC-003-04       | Confirmar recepción exige además el checklist completo si la OC tiene partidas (AC-014-05).                                                                                                                                  |
| AC-003-08       | El formulario añade partidas y el paso de verificación (AC-014-12).                                                                                                                                                          |
| AC-003-09       | La verificación manual incluye el checklist (AC-014-15).                                                                                                                                                                     |
| Asistente (008) | `createPurchaseOrder` hereda `lines` (la IA puede proponerlas; la persona confirma, ADR-14). `recordReceipt` no puede marcar un checklist: pierde `checkedLineIds` y solo sirve para OC sin partidas (prompt `assistant@3`). |

## Tareas

- [x] 1. Contratos: `PoLineInput/Dto`, `lines`, `taxes`, `checkedLineIds`, `PurchaseOrderDraft`, `PoExtractionSchema`, con pruebas.
- [x] 2. Reglas `lineAmount`, `linesSubtotal`, `checkTotalCoversLines`, `checkChecklist`, `buildDraftWarnings` con pruebas (tabla).
- [x] 3. Modelo y migración `pnpm db:migrate --name 014-partidas-de-oc`; semilla y `seedCatalog` con partidas.
- [x] 4. Repositorio y service: crear/editar con partidas, checklist en la recepción, DTO con `lines` y `taxes`; pruebas de integración AC-014-01…06, 17.
- [x] 5. `po-extraction.client` + prompt `extract-purchase-order@1` + `fake`; prueba de la forma de la llamada (AC-014-11).
- [x] 6. `POST /purchase-orders/extract`: archivo, cuota, borrador, auditoría; pruebas AC-014-07…10 y permisos.
- [x] 7. Web: `PoLinesEditor`, paso de verificación en `PurchaseOrderDialog`, subida del PDF; pruebas AC-014-12 y 13.
- [x] 8. Web: `ReceiptChecklist` responsivo, detalle con partidas; pruebas AC-014-14 y 17.
- [x] 9. Ajustar herramientas del asistente (`createPurchaseOrder`, `recordReceipt`); verificación manual AC-014-15 y 16 (con PDF real si existe, evaluar el prompt); `pnpm check` y estado `hecha`.

## Fuera de alcance y decisiones

- **El PDF no se guarda.** Se lee en memoria y se descarta; el rastro es el evento `purchase_order.extracted` y la
  OC final. Si se quiere conservarlo como evidencia, es una spec aparte que reutiliza `storage.client` (como las
  facturas).
- **Checklist todo-o-nada.** Es lo que pidió el negocio («confirmación de checklist de todo»). Recepciones
  parciales o con diferencias de cantidad requieren una tabla `Receipt` y spec propia (ya anotado en 003).
- **Importe de partida calculado, no capturado.** Evita que el total y las partidas se contradigan; el importe del
  PDF solo se usa para avisar.
- **Impuestos implícitos** (`total − suma de partidas`). No se modelan tasas ni partidas de impuesto; basta para
  que 004 siga comparando contra el total con impuestos.
- **Asistente y recepción.** Propuesta: `recordReceipt` queda solo para OC sin partidas; para las demás el
  asistente responde con un enlace a `/ordenes` (la casilla la marca una persona viendo la lista).
- **Warehouse sin precios** en el checklist, aunque la API de lectura de OC sigue abierta a cualquier sesión (013).

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-02 · Spec redactada en `borrador`. No hay PDF de ParLevel: el esquema de extracción y el prompt son una
  suposición razonable de una OC de compras.
- 2026-11-02 · Spec aprobada por el dueño y puesta en `en-progreso`. Implementada en `main` (CLAUDE.md pide no crear ramas).
  Entorno: Postgres 16 de `pnpm db:up` (Docker).
- 2026-11-02 · Diferencias con el diseño escrito, ya reflejadas arriba: la extracción es un método más de
  `ExtractionClient` (no un cliente nuevo); los errores del archivo reutilizan los de 004 (415, 413 y 502
  `AI_UNAVAILABLE`, en vez de 400 `VALIDATION`/`EXTRACTION_FAILED`); `POST /extract` responde 201; no hay pantalla de
  detalle de OC, así que AC-014-17 se cumple con la lista, el diálogo de edición y el checklist. `detectFileType` y
  `checkQuota` se importan de `payables/file.rules.ts` (reglas puras: `pnpm layers` lo permite).
- 2026-11-02 · Cambió el prompt del asistente a `assistant@3` (archivo nuevo `assistant.v3.ts`; el v2 se retiró porque
  ya no lo usa nadie). La spec 011 sigue citando `assistant@2` en su texto: no se reescribe (una spec `hecha` no se
  edita). Para el alta guiada de una factura sin OC, el asistente propone una sola partida «Según factura …» por el
  subtotal, y para recibir una OC con partidas manda a `/ordenes`. `recordReceipt` ya no acepta `checkedLineIds`.
- 2026-11-02 · Efectos en otras specs (que siguen `hecha`): AC-003-01/04/08/09 ahora exigen partidas y checklist; las
  pruebas de 003 se actualizaron para crear OC con partidas y recibirlas con `checkedLineIds`. El probador (007) crea y
  recibe su OC con una partida.
- 2026-11-02 · Verificación manual con `pnpm dev`-equivalente (API con `AI_PROVIDER=fake`, porque el `.env` local apunta
  a Anthropic y el PDF de prueba era sintético): AC-014-16, el PDF `oc-parlevel.pdf` abre el paso de verificación con
  el aviso de folio repetido (OC-3001 ya existía en la base local), se cambió el folio y una cantidad (el importe y los
  impuestos se recalcularon) y se guardó con 2 partidas en orden (`taxes` 600.00). AC-014-15: a 375 px, como almacén,
  `OC-1003` abre el checklist a pantalla completa, filas de 70 px, contador «2 de 3» con el botón deshabilitado, sin
  scroll horizontal; al marcar la tercera se confirmó y la OC quedó `received` por «Demo Almacén». Se retiraron los
  usuarios y la OC de prueba de la base local y se volvió a correr la semilla.
- 2026-11-02 · Pendiente real: evaluar el prompt `extract-purchase-order@1` con un PDF auténtico de ParLevel. Mientras
  tanto la extracción es una suposición razonable del formato; los avisos y el paso de verificación cubren las
  diferencias.
