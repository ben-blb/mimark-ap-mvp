---
id: '015'
titulo: Proceso de OC desde el PDF real de ParLevel, con alta del proveedor
estado: en-progreso # borrador | lista | en-progreso | hecha
depende_de: ['002', '003', '014']
requisitos: RF-01, RF-02, RF-03 (extensión)
---

# 015 · Proceso de OC desde el PDF real de ParLevel, con alta del proveedor

## Objetivo

Que con solo subir el PDF que genera **ParLevel Warehouse** se pueda crear la OC **y**, si el proveedor no existe,
registrarlo en el mismo flujo, sin capturar las partidas a mano. La spec 014 dejó la carga del PDF hecha sobre un
formato supuesto; ya tenemos un PDF real (OC P3062) y no se parece a lo supuesto: no trae RFC, ni moneda, ni
impuestos, ni total; la fecha viene en formato de EE. UU. y las unidades son cajas.

## El proceso completo de una OC (cómo queda)

```
ParLevel ──PDF──> 1. Subir PDF ──> 2. Borrador (IA lee, reglas revisan) ──> 3. Proveedor
                                                                             ├─ coincide → queda elegido
                                                                             └─ no existe → «Registrar proveedor»
                                                                                (prellenado, la persona pone RFC,
                                                                                 crédito y moneda) ──┐
              4. Verificar partidas y capturar el total con impuestos  <──────────────────────────────┘
              5. Guardar OC (POST /purchase-orders, una persona)
              6. Almacén recibe: checklist «cajas recibidas» (spec 014)
              7. Llega la factura: se valida contra la OC por folio y total (spec 004)
              8. Revisión, programación y registro del pago (spec 005) · cartera (006)
```

Cada escritura (proveedor, OC, recepción) la confirma una persona con su propio botón (regla 6, ADR-14). La IA
solo lee el PDF.

## Lo que trae el PDF real (OC P3062, ParLevel Warehouse)

| Dato del PDF                           | Valor de ejemplo                           | Cómo se usa                                                   |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `Order #P3062`                         | `P3062`                                    | Folio de la OC (`number`) y `parlevelRef`                     |
| `Order Date: 08-05-2026`               | MM-DD-AAAA → 2026-08-05                    | `issuedOn` (ver decisiones: fecha ambigua)                    |
| Bloque `From:`                         | SMART KIOSKO, dirección                    | **Comprador** (nosotros). Nunca es el proveedor               |
| Bloque `To:`                           | Pepsico · Monterrey, Nuevo León 64890      | **Proveedor**: nombre y ciudad. **Sin RFC**                   |
| Columnas `Supplier #`, `Cst ID`        | vacías                                     | `sku` si vienen; si no, nulo                                  |
| `Product`                              | «Pepsi Black Botella 600 ml» (2 renglones) | `description` (une renglones partidos)                        |
| `Cases Ordered`                        | 40                                         | `quantity`, `unit = caja`                                     |
| `Cases Received`                       | 0                                          | Se ignora al crear (la recepción es el checklist de 014)      |
| `Unit Cost (act.)`                     | $149.50                                    | `unitPrice`                                                   |
| `Deposit`                              | $0.00                                      | `deposit` en el borrador (envase); aviso si ≠ 0               |
| `Order Total`                          | $5,980.00                                  | `statedAmount` (solo para avisar, 014)                        |
| `Received Total`                       | $0.00                                      | Se ignora                                                     |
| `Est. Subtotal`                        | $30,875.50                                 | `subtotal`                                                    |
| Moneda, impuestos, total con impuestos | **no vienen**                              | Moneda del proveedor; total lo captura la persona (AC-015-07) |

El PDF de ejemplo es un documento real: **no se versiona** (regla 8). Las pruebas usan la extracción simulada
(`fake`) de una OC con el mismo diseño y los mismos importes, pero con proveedor y productos inventados.

## Alcance

**Incluye:** prompt `extract-purchase-order@2` pensado para el diseño real de ParLevel (From/To, cajas, depósito,
renglones partidos, fecha MM-DD-AAAA, solo subtotal); coincidencia de proveedor sin RFC (por alias de ParLevel y
por nombre); alta del proveedor desde el borrador con los datos que trae el PDF; captura obligatoria del total con
impuestos cuando el PDF no lo trae, con ayuda «subtotal + IVA 16 %»; avisos nuevos; extracción simulada con el diseño de ParLevel;
evaluación del prompt con el PDF real. **Modifica AC-014-07, AC-014-09 y AC-014-13** y agrega un campo a
proveedores (002).

**No incluye:** parser determinista sin IA (ver decisiones); cálculo de IEPS u otras tasas por producto; guardar el
PDF; recepciones parciales por cajas (el checklist sigue todo-o-nada); integración directa con la API de ParLevel;
dirección del proveedor como dato guardado (solo se muestra para ayudar a identificarlo).

## Criterios de aceptación

- **AC-015-01** · Dado un PDF con diseño ParLevel (9 partidas, `Est. Subtotal` 30,875.50, fecha `08-05-2026`), cuando
  se llama `POST /api/purchase-orders/extract` con la extracción simulada de ese PDF (archivo
  `parlevel-warehouse.pdf`), entonces el borrador trae `number = "P3062"`, `parlevelRef = "P3062"`,
  `issuedOn = "2026-08-05"`, 9 partidas en orden con `unit = "caja"`, `sku = null`, la partida 8 con
  `description = "Refresco cola sin azúcar 600 ml"`, `quantity = "40"`, `unitPrice = "149.5"`, y
  `subtotal = "30875.50"`, `taxes = null`, `total = null`.
- **AC-015-02** · El borrador nunca toma como proveedor el bloque `From:` del comprador: si la IA devuelve como
  `supplierName` un nombre que coincide con `BUYER_NAMES` (configuración, p. ej. «SMART KIOSKO», «MIMARK»), el
  borrador lo deja en `null` y avisa en `supplierName`: «El proveedor leído es el comprador; elige el proveedor».
- **AC-015-03** · Coincidencia de proveedor, en este orden: (1) RFC igual a un proveedor activo; (2) `parlevelName`
  normalizado (mayúsculas, sin acentos ni espacios dobles) igual al de un proveedor activo; (3) nombre normalizado
  igual a un único proveedor activo. El borrador dice cómo coincidió en `supplierMatch: 'taxId' | 'alias' | 'name' |
null`. Si por nombre coinciden dos o más, `supplier = null` con aviso «Hay varios proveedores con ese nombre».
- **AC-015-04** · Sin coincidencia, el borrador trae `supplierSuggestion: { name, city }` con lo leído del bloque
  `To:` (ej. `{ name: "Refrescos del Norte", city: "Monterrey, Nuevo Leon 64890" }`) y el aviso «Proveedor no registrado».
- **AC-015-05** · `POST /api/suppliers` acepta `parlevelName` opcional (1–200, se guarda normalizado y es único entre
  proveedores; repetido → 409 `CONFLICT` con `fieldErrors.parlevelName`). `PATCH` también lo acepta. Queda en el
  evento `supplier.created` / `supplier.updated`. Requiere el mismo permiso que hoy da de alta proveedores.
- **AC-015-06** · En el paso de verificación, si `supplier` es nulo aparece «Registrar proveedor» que abre el
  formulario de proveedor prellenado con el nombre sugerido y `parlevelName` = nombre tal como viene en el PDF; la
  persona captura RFC, días de crédito y moneda (MXN por defecto). Al guardarlo, el proveedor queda elegido en la OC
  sin perder lo editado en el borrador. Si la persona no tiene permiso de proveedores, el botón no aparece y se le
  dice «Pide a un administrador que registre a <nombre>».
- **AC-015-07** · Si el borrador trae `total = null`, el campo «Total con impuestos» queda vacío y obligatorio, con
  el aviso «El PDF de ParLevel no trae impuestos: captura el total de la cotización o la factura» y un botón
  «Subtotal + IVA 16 %» que lo llena con `round(subtotal × 1.16, 2)` (ej. 30,875.50 → 35,815.58). La persona puede
  cambiarlo; se sigue validando AC-014-03 (total ≥ suma de partidas).
- **AC-015-08** · Si el PDF no trae moneda, la moneda del borrador es `null`; el formulario usa la del proveedor
  elegido o registrado (AC-003-08) y la marca como dato a revisar.
- **AC-015-09** · Avisos nuevos (no bloquean, dicen la partida o campo): `deposit` ≠ 0 en una partida («Depósito de
  envase de $X no incluido en el importe»); `Cases Received` > 0 en alguna partida («El PDF ya trae cajas
  recibidas; la recepción se confirma con el checklist»); fecha ambigua cuando día y mes son ≤ 12 («Fecha leída
  como 5 ago 2026 (MM-DD-AAAA de ParLevel); revisa»); fecha futura.
- **AC-015-10** · La regla de importe de 014 compara `statedAmount` contra `quantity × unitPrice + deposit`
  (tolerancia 0.01). Con los datos de P3062 no hay avisos de importe ni de subtotal (la suma de las 9 partidas es
  30,875.50).
- **AC-015-11** · La extracción usa `extract-purchase-order@2` y el evento `purchase_order.extracted` registra esa
  versión. Se conserva la regla de documento-como-dato (AC-014-11) y el prompt ordena ignorar instrucciones del PDF.
- **AC-015-12** [manual] · Evaluación con el PDF real: con `AI_PROVIDER=anthropic`, subir `OC_3062_PEPSI.pdf`
  (local, fuera del repo) da folio, fecha, las 9 partidas con cantidades y costos exactos, subtotal 30,875.50 y
  proveedor sugerido «Pepsico» sin RFC. Cómo verificarlo: `pnpm dev`, «Nueva OC» → «Subir PDF de ParLevel»;
  anotar en la Bitácora campo por campo qué salió bien o mal (sin copiar el documento).
- **AC-015-13** [manual] · Flujo completo con un proveedor nuevo: subir el PDF, «Registrar proveedor» (RFC sintético,
  30 días, MXN), «Subtotal + IVA 16 %», marcar «Revisé las partidas contra el PDF» y guardar; la OC aparece en
  `/ordenes` con 9 partidas y el proveedor en `/proveedores`. Subir el mismo PDF otra vez: el proveedor coincide por
  alias (`supplierMatch = 'alias'`) y avisa que el folio ya existe. Cómo verificarlo: `pnpm dev` con `fake` y con el
  PDF real.

## Diseño

### Datos

Migración `015-alias-parlevel-proveedor`:

```prisma
model Supplier {
  // …
  /// Nombre del proveedor tal como lo escribe ParLevel (bloque «To:»), normalizado. Sirve para reconocerlo sin RFC.
  parlevelName String? @unique
}
```

Sin relleno de datos. El depósito no se guarda (ver decisiones).

### Contratos

- `suppliers.ts`: `CreateSupplierInput += parlevelName: z.string().trim().min(1).max(200).optional()`;
  `SupplierDto += parlevelName: z.string().nullable()`.
- `purchase-orders.ts`: `PoLineDraft += deposit: Money.nullable(), receivedQuantity: z.string().nullable()`;
  `PurchaseOrderDraft += supplierMatch: z.enum(['taxId','alias','name']).nullable()`,
  `supplierSuggestion: z.object({ name: z.string(), city: z.string().nullable() }).nullable()`;
  `totalWithVat(subtotal: Money): Money` (función pura compartida: la web la usa para el botón de AC-015-07).
- `extraction.ts`: `PoExtractionSchema` agrega `supplierCity`, `buyerName`, y por partida `deposit` y
  `receivedQuantity` (todos nulos si no vienen).

### API

| Método y ruta                        | Cambio                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `POST /api/purchase-orders/extract`  | Prompt v2, coincidencia por alias/nombre, `supplierSuggestion`, avisos |
| `POST /api/suppliers`, `PATCH …/:id` | Acepta `parlevelName`                                                  |

Sin rutas nuevas. El service de `purchase-orders` lee proveedores con `SuppliersRepository` (nuevos
`findByParlevelName`, `findActiveByNormalizedName`); el alta del proveedor la hace la web con `POST /api/suppliers`
(módulo `suppliers`), nunca el service de OC (regla 3). `BUYER_NAMES` es configuración (`env`), lista separada por
comas, por defecto `SMART KIOSKO,MIMARK`.

### Reglas

`suppliers.rules.ts`: `normalizeName(name): string` (mayúsculas, sin acentos, sin puntuación ni espacios dobles,
sin sufijos `S.A. DE C.V.`, `SA DE CV`, `S. DE R.L.`).

`purchase-orders.rules.ts`:

```ts
parseParlevelDate(text: string): { date: LocalDate | null; ambiguous: boolean } // MM-DD-AAAA
pickSupplier(candidates, extracted, buyerNames): { supplier; match; warnings }   // AC-015-02/03
buildDraftWarnings(...)                                                        // + depósito, recibidas, fecha
```

| Caso                                                         | Resultado                               |
| ------------------------------------------------------------ | --------------------------------------- |
| `parseParlevelDate('08-05-2026')`                            | `2026-08-05`, `ambiguous: true`         |
| `parseParlevelDate('08-25-2026')`                            | `2026-08-25`, `ambiguous: false`        |
| `parseParlevelDate('25-08-2026')`                            | `null` (mes 25 inválido)                |
| `normalizeName('PepsiCo de México, S. de R.L. de C.V.')`     | `PEPSICO DE MEXICO`                     |
| `normalizeName('Pepsico')` vs alias `PEPSICO`                | coincide (`alias`)                      |
| `supplierName = 'SMART KIOSKO'`                              | `supplier = null`, aviso de comprador   |
| `totalWithVat('30875.50')` (contracts)                       | `35815.58`                              |
| partida 40 × 149.50, depósito 0, `statedAmount` 5,980.00     | sin aviso                               |
| partida 10 × 100.00, depósito 25.00, `statedAmount` 1,025.00 | aviso de depósito, sin aviso de importe |

### Prompt `extract-purchase-order@2`

Archivo nuevo; el v1 se retira porque ya no lo usa nadie. Describe el diseño real: «Order #» es el folio; `From:` es el comprador
(`buyerName`), `To:` es el proveedor (`supplierName`, `supplierCity`); la fecha se copia tal cual en
`issuedOn` como texto `MM-DD-AAAA` y la regla la convierte; `Cases Ordered` → `quantity`, `unit = "caja"`;
`Unit Cost` → `unitPrice`; `Deposit` → `deposit`; `Order Total` → `amount`; `Cases Received` → `receivedQuantity`;
un producto partido en dos renglones es una sola partida; `Est. Subtotal` → `subtotal`; impuestos, total y moneda en
`null` si no aparecen. Mantiene la cláusula de documento-como-dato.

### UI

- Paso de verificación (`PurchaseOrderDialog`): bloque «Proveedor» con tres estados — coincide (chip «Reconocido
  por RFC / alias / nombre»), varios, o no registrado con la sugerencia (nombre y ciudad como texto) y el botón
  «Registrar proveedor» que abre `SupplierDialog` encima, prellenado.
- `SupplierForm` muestra el campo «Nombre en ParLevel» (opcional) también en `/proveedores`, para dar de alta el
  alias a proveedores existentes.
- Campo «Total con impuestos» con el botón «Subtotal + IVA 16 %» y el aviso de AC-015-07.

### Auditoría

Sin acciones nuevas: `supplier.created` / `supplier.updated` incluyen `parlevelName`; `purchase_order.extracted`
lleva `promptVersion = extract-purchase-order@2` y `supplierMatch`.

### Datos de prueba

`fake-po-extraction.ts` responde a un archivo cuyo nombre contiene `parlevel-warehouse` con la extracción de una OC
con el diseño de P3062 (mismos folio, fecha, cantidades y costos; proveedor «Refrescos del Norte» y productos
inventados; `buyerName = "SMART KIOSKO"`). Variantes por nombre: `-comprador` (la IA confunde al comprador con el
proveedor) y `-deposito` (una partida con depósito y cajas recibidas). Semilla: el proveedor `EDR150720QW9` recibe
`parlevelName` para probar la coincidencia por alias.

## Cambios a specs anteriores

| Criterio  | Cambio                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------- |
| AC-002-xx | Proveedor con `parlevelName` opcional y único (AC-015-05).                                           |
| AC-014-07 | El borrador agrega `supplierMatch` y `supplierSuggestion`; el prompt pasa a `@2`.                    |
| AC-014-09 | Avisos nuevos de depósito, cajas recibidas, fecha ambigua y comprador como proveedor (AC-015-02/09). |
| AC-014-13 | La coincidencia ya no es solo por RFC (AC-015-03) y sin coincidencia se puede registrar (AC-015-06). |

## Tareas

- [x] 1. Contratos: `parlevelName`, `deposit`, `supplierMatch`, `supplierSuggestion`, `totalWithVat`, `PoExtractionSchema` v2, con pruebas.
- [x] 2. Reglas `normalizeName`, `parseParlevelDate`, `pickSupplier`, avisos nuevos, con tablas.
- [x] 3. Migración `015-alias-parlevel-proveedor`; repositorio de proveedores con `parlevelName`; pruebas AC-015-05.
- [x] 4. `fake-po-extraction` con el diseño ParLevel; prompt `extract-purchase-order@2`.
- [x] 5. Service de extracción: coincidencia, sugerencia, avisos, fecha; pruebas de integración AC-015-01…04, 08…11.
- [x] 6. Web: bloque de proveedor, «Registrar proveedor» desde la verificación, total con ayuda de IVA; pruebas AC-015-06/07.
- [x] 7. `SupplierForm` con «Nombre en ParLevel»; semilla con un alias.
- [ ] 8. Verificación manual AC-015-12 (PDF real, fuera del repo) y AC-015-13; `pnpm check` y estado `hecha`.

## Fuera de alcance y decisiones

- **IA (prompt v2) en vez de un parser determinista (decidido por el dueño).** El PDF de ParLevel tiene capa de texto y diseño fijo, así que
  un parser por columnas sería gratis y exacto, pero exige una dependencia nueva (lector de PDF) y se rompe si
  ParLevel cambia el diseño. Con la IA se reutiliza todo lo de 014 y las reglas deterministas (sumas, importes,
  fecha) atrapan los errores. Si la evaluación AC-015-12 sale mal o el costo pesa, se cambia en una spec aparte.
- **Fecha MM-DD-AAAA (decidido por el dueño).** ParLevel es software de EE. UU.; `08-05-2026` se lee como 5 de
  agosto. Si algún día cambia, se ajusta `parseParlevelDate` y nada más. El aviso de fecha ambigua obliga a que una
  persona lo vea.
- **Folio `P3062` tal cual (decidido por el dueño).** Se guarda con la «P» de ParLevel. Si las facturas del proveedor
  citan `3062` sin la P, la búsqueda por folio de 004 no las va a encontrar; se revisará con facturas reales.
- **Total con impuestos lo pone una persona (decidido por el dueño).** El PDF solo trae subtotal estimado y las bebidas mezclan IVA 16 % e
  IEPS por litro; calcularlo bien requiere un catálogo de productos con tasas (fuera de alcance). El botón de IVA
  16 % es una ayuda, no la regla.
- **Proveedor sin RFC no se puede registrar.** `TaxId` sigue siendo obligatorio porque lo necesita 004 para validar
  la factura. El PDF no trae RFC: la persona lo captura (de la constancia o de una factura previa).
- **El depósito no se guarda.** Solo vive en el borrador: cuadra el importe del PDF (AC-015-10) y genera un aviso.
  En el PDF real es 0 en todas las partidas; si el negocio decide que el envase se factura, se modela en otra spec.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-05 · Spec redactada en `borrador` a partir del primer PDF real de ParLevel (OC P3062 a Pepsico, 9
  partidas, subtotal 30,875.50, sin RFC, moneda, impuestos ni total). El PDF no se agrega al repositorio.
- 2026-11-05 · El dueño aprobó la spec con sus decisiones: fecha MM-DD-AAAA, folio tal cual (`P3062`), total con
  impuestos capturado por la persona y extracción con IA. Pasa a `en-progreso`. Se trabaja en la rama
  `claude/oc-pdf-parsing-proposal-qv79qi` que asignó la sesión (CLAUDE.md pide `main`). Entorno: Postgres 16 del
  contenedor (sin Docker).
- 2026-11-05 · Ajustes de diseño antes de implementar: el depósito no se guarda en `PurchaseOrderLine` (solo en el
  borrador; menos migración y UI para un dato que hoy es 0); no hay PDF sintético versionado: la extracción simulada
  responde por nombre de archivo, como en 014; `totalWithVat` vive en contracts porque la usa la web.
- 2026-11-05 · Implementadas las tareas 1–7. Hallazgos y decisiones: el subtotal se compara contra la suma de
  `cantidad × precio + depósito` (el «Order Total» de ParLevel incluye el depósito, así que su suma también);
  `pickSupplier` vive en `purchase-orders.rules.ts` y usa `normalizeName` de `suppliers.rules.ts`; el aviso del
  proveedor no registrado sigue visible después de registrarlo (los avisos son del borrador, no se recalculan);
  `PATCH /suppliers` no puede borrar el alias (vacío no se envía), igual que `parlevelRef` en 003. La migración se
  generó con `prisma migrate dev` desde una terminal simulada (la advertencia del índice único pide confirmación
  interactiva). La etiqueta «Proveedor» se encimaba con «Selecciona…» (venía de 014); ahora queda siempre arriba.
- 2026-11-05 · AC-015-13 verificado con `pnpm dev` (`AI_PROVIDER=fake`, archivo `parlevel-warehouse.pdf`) y
  Playwright: el borrador mostró «El PDF dice: Refrescos del Norte · Monterrey, Nuevo Leon 64890», folio P3062 y
  fecha 2026-08-05 con el aviso de fecha ambigua; «Registrar proveedor» abrió el alta prellenada, con RFC sintético y
  30 días quedó elegido (moneda MXN) sin perder el folio; «Subtotal + IVA 16 %» dio 35,815.58; tras marcar la
  revisión se guardó y `/ordenes` mostró `P3062 · Refrescos del Norte · 5 ago · 9 partidas · $35,815.58`. Al subir
  el mismo PDF otra vez el proveedor quedó «Reconocido por su nombre en ParLevel» y avisó «Ya existe una OC con ese
  folio». A 375 px el paso de verificación no tiene scroll horizontal.
- 2026-11-05 · **Pendiente: AC-015-12** (evaluar `extract-purchase-order@2` con el PDF real y un modelo real). El
  contenedor no tiene `ANTHROPIC_API_KEY` ni `GOOGLE_GENERATIVE_AI_API_KEY`, así que la spec sigue `en-progreso`
  con la tarea 8 abierta hasta correrla con `AI_PROVIDER=anthropic`.
