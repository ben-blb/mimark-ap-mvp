---
id: '015'
titulo: Proceso de OC desde el PDF real de ParLevel, con alta del proveedor
estado: borrador # borrador | lista | en-progreso | hecha
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
| `Deposit`                              | $0.00                                      | Nuevo: `deposit` por partida (envase); aviso si ≠ 0           |
| `Order Total`                          | $5,980.00                                  | `statedAmount` (solo para avisar, 014)                        |
| `Received Total`                       | $0.00                                      | Se ignora                                                     |
| `Est. Subtotal`                        | $30,875.50                                 | `subtotal`                                                    |
| Moneda, impuestos, total con impuestos | **no vienen**                              | Moneda del proveedor; total lo captura la persona (AC-015-07) |

El PDF de ejemplo es un documento real: **no se versiona** (regla 8). Las pruebas usan un PDF sintético con el mismo
diseño (proveedor y productos inventados).

## Alcance

**Incluye:** prompt `extract-purchase-order@2` pensado para el diseño real de ParLevel (From/To, cajas, depósito,
renglones partidos, fecha MM-DD-AAAA, solo subtotal); coincidencia de proveedor sin RFC (por alias de ParLevel y
por nombre); alta del proveedor desde el borrador con los datos que trae el PDF; captura obligatoria del total con
impuestos cuando el PDF no lo trae, con ayuda «subtotal + IVA 16 %»; avisos nuevos; PDF sintético de prueba;
evaluación del prompt con el PDF real. **Modifica AC-014-07, AC-014-09 y AC-014-13** y agrega un campo a
proveedores (002).

**No incluye:** parser determinista sin IA (ver decisiones); cálculo de IEPS u otras tasas por producto; guardar el
PDF; recepciones parciales por cajas (el checklist sigue todo-o-nada); integración directa con la API de ParLevel;
dirección del proveedor como dato guardado (solo se muestra para ayudar a identificarlo).

## Criterios de aceptación

- **AC-015-01** · Dado el PDF sintético con diseño ParLevel (9 partidas, `Est. Subtotal` 30,875.50), cuando se llama
  `POST /api/purchase-orders/extract` con `AI_PROVIDER=fake` que devuelve la extracción de ese PDF, entonces el
  borrador trae `number = "P3062"`, `parlevelRef = "P3062"`, `issuedOn = "2026-08-05"`, 9 partidas en orden con
  `unit = "caja"`, `sku = null`, la partida 8 con `description = "Pepsi Black Botella 600 ml"`, `quantity = "40"`,
  `unitPrice = "149.50"`, y `subtotal = "30875.50"`, `taxes = null`, `total = null`.
- **AC-015-02** · El borrador nunca toma como proveedor el bloque `From:` del comprador: si la IA devuelve como
  `supplierName` un nombre que coincide con `BUYER_NAMES` (configuración, p. ej. «SMART KIOSKO», «MIMARK»), el
  borrador lo deja en `null` y avisa en `supplierName`: «El proveedor leído es el comprador; elige el proveedor».
- **AC-015-03** · Coincidencia de proveedor, en este orden: (1) RFC igual a un proveedor activo; (2) `parlevelName`
  normalizado (mayúsculas, sin acentos ni espacios dobles) igual al de un proveedor activo; (3) nombre normalizado
  igual a un único proveedor activo. El borrador dice cómo coincidió en `supplierMatch: 'taxId' | 'alias' | 'name' |
null`. Si por nombre coinciden dos o más, `supplier = null` con aviso «Hay varios proveedores con ese nombre».
- **AC-015-04** · Sin coincidencia, el borrador trae `supplierSuggestion: { name, city }` con lo leído del bloque
  `To:` (ej. `{ name: "Pepsico", city: "Monterrey, Nuevo Leon 64890" }`) y el aviso «Proveedor no registrado».
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

model PurchaseOrderLine {
  // …
  /// Depósito de envase por partida (columna «Deposit» de ParLevel). 0 si no aplica.
  deposit Decimal @db.Decimal(14, 2) @default(0)
}
```

`amount` sigue siendo `round(quantity × unitPrice, 2)`; el depósito se guarda aparte y solo se usa para avisar
(ver decisiones). Sin relleno de datos.

### Contratos

- `suppliers.ts`: `CreateSupplierInput += parlevelName: z.string().trim().min(1).max(200).optional()`;
  `SupplierDto += parlevelName: z.string().nullable()`.
- `purchase-orders.ts`: `PoLineInput += deposit: Money.optional()` (por defecto `0.00`);
  `PurchaseOrderDraft += supplierMatch: z.enum(['taxId','alias','name']).nullable()`,
  `supplierSuggestion: z.object({ name: z.string(), city: z.string().nullable() }).nullable()`.
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
suggestTotalWithVat(subtotal: Money): Money                                    // AC-015-07, usada por la web
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
| `suggestTotalWithVat('30875.50')`                            | `35815.58`                              |
| partida 40 × 149.50, depósito 0, `statedAmount` 5,980.00     | sin aviso                               |
| partida 10 × 100.00, depósito 25.00, `statedAmount` 1,025.00 | aviso de depósito, sin aviso de importe |

### Prompt `extract-purchase-order@2`

Archivo nuevo (el v1 no se edita). Describe el diseño real: «Order #» es el folio; `From:` es el comprador
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
- Columna «Depósito» solo si alguna partida lo trae distinto de 0.

### Auditoría

Sin acciones nuevas: `supplier.created` / `supplier.updated` incluyen `parlevelName`; `purchase_order.extracted`
lleva `promptVersion = extract-purchase-order@2` y `supplierMatch`.

### Datos de prueba

`apps/api/test/fixtures/oc-parlevel-sintetica.pdf`: generado una vez con el mismo diseño que P3062 (From/To,
columnas, renglones partidos, «Generated by Parlevel Warehouse») pero con proveedor «Refrescos del Norte» y
productos inventados; `fake-po-extraction.ts` devuelve su extracción. Semilla: el proveedor
`EDR150720QW9` recibe `parlevelName` para probar la coincidencia por alias.

## Cambios a specs anteriores

| Criterio  | Cambio                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------- |
| AC-002-xx | Proveedor con `parlevelName` opcional y único (AC-015-05).                                           |
| AC-014-07 | El borrador agrega `supplierMatch` y `supplierSuggestion`; el prompt pasa a `@2`.                    |
| AC-014-09 | Avisos nuevos de depósito, cajas recibidas, fecha ambigua y comprador como proveedor (AC-015-02/09). |
| AC-014-13 | La coincidencia ya no es solo por RFC (AC-015-03) y sin coincidencia se puede registrar (AC-015-06). |

## Tareas

- [ ] 1. Contratos: `parlevelName`, `deposit`, `supplierMatch`, `supplierSuggestion`, `PoExtractionSchema` v2, con pruebas.
- [ ] 2. Reglas `normalizeName`, `parseParlevelDate`, `pickSupplier`, `suggestTotalWithVat`, avisos nuevos, con tablas.
- [ ] 3. Migración `015-alias-parlevel-proveedor`; repositorio de proveedores con `parlevelName`; pruebas AC-015-05.
- [ ] 4. PDF sintético y `fake-po-extraction` con el diseño ParLevel; prompt `extract-purchase-order@2`.
- [ ] 5. Service de extracción: coincidencia, sugerencia, avisos, fecha; pruebas de integración AC-015-01…04, 08…11.
- [ ] 6. Web: bloque de proveedor, «Registrar proveedor» desde la verificación, total con ayuda de IVA; pruebas AC-015-06/07.
- [ ] 7. `SupplierForm` con «Nombre en ParLevel»; semilla con un alias.
- [ ] 8. Verificación manual AC-015-12 (PDF real, fuera del repo) y AC-015-13; `pnpm check` y estado `hecha`.

## Fuera de alcance y decisiones

- **IA (prompt v2) en vez de un parser determinista.** El PDF de ParLevel tiene capa de texto y diseño fijo, así que
  un parser por columnas sería gratis y exacto, pero exige una dependencia nueva (lector de PDF) y se rompe si
  ParLevel cambia el diseño. Con la IA se reutiliza todo lo de 014 y las reglas deterministas (sumas, importes,
  fecha) atrapan los errores. Si la evaluación AC-015-12 sale mal o el costo pesa, se cambia en una spec aparte.
- **Fecha MM-DD-AAAA (supuesto a validar).** ParLevel es software de EE. UU.; `08-05-2026` se lee como 5 de agosto.
  Si en MIMARK está configurado DD-MM, se cambia `parseParlevelDate` y nada más. El aviso de fecha ambigua obliga a
  que una persona lo vea.
- **Folio `P3062` tal cual.** Se guarda con la «P» de ParLevel. Si las facturas del proveedor citan `3062` sin la P,
  la búsqueda por folio de 004 no las va a encontrar; está por decidir si se normaliza (quitar la P) o se busca por
  ambos.
- **Total con impuestos lo pone una persona.** El PDF solo trae subtotal estimado y las bebidas mezclan IVA 16 % e
  IEPS por litro; calcularlo bien requiere un catálogo de productos con tasas (fuera de alcance). El botón de IVA
  16 % es una ayuda, no la regla.
- **Proveedor sin RFC no se puede registrar.** `TaxId` sigue siendo obligatorio porque lo necesita 004 para validar
  la factura. El PDF no trae RFC: la persona lo captura (de la constancia o de una factura previa).
- **Depósito aparte del importe.** Se guarda por partida para no perder el dato, pero no entra en `amount` ni en la
  suma contra el total hasta que el negocio diga si el envase se factura.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-05 · Spec redactada en `borrador` a partir del primer PDF real de ParLevel (OC P3062 a Pepsico, 9
  partidas, subtotal 30,875.50, sin RFC, moneda, impuestos ni total). El PDF no se agrega al repositorio.
