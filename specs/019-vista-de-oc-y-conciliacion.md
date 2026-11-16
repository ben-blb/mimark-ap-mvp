---
id: '019'
titulo: Vista de la orden y conciliación contra lo recibido
estado: en-progreso # borrador | lista | en-progreso | hecha
depende_de: ['004', '005', '017', '018']
requisitos: RF-09, RF-10, RF-11 (extensión; modifica 004)
---

# 019 · Vista de la orden y conciliación contra lo recibido

## Objetivo

El proceso (crear OC → recibir → cargar factura → confirmar → programar → pagar) existe pero no se ve: no hay una
vista de la orden que diga en qué paso va, la contadora no tiene un camino directo «orden recibida → cargar su
factura», y la factura se compara contra el total de la OC aunque Almacén haya recibido menos. Esta spec da a cada
orden una página con su avance y la acción que sigue, y concilia la factura contra lo que realmente se recibió.

## Alcance

**Incluye:** etapa derivada de la orden (`progress`); página `/ordenes/:id` con barra de pasos, partidas pedido /
recibido, crédito del proveedor, factura y pago; «Cargar factura» desde la orden; filtro de órdenes recibidas sin
factura y su bloque en «Mi trabajo»; conciliación por subtotal recibido cuando hubo diferencias; cuadro Pedido /
Recibido / Facturado en el expediente.

**No incluye:** comparar la factura partida por partida; validar con exactitud el total con impuestos cuando hubo
diferencias (ver decisiones); tolerancias; pagos parciales; días de crédito por orden (siguen en el proveedor);
conexión con bancos (el sistema solo da seguimiento); notas de crédito; dependencias nuevas.

## Etapas de una orden

Se calculan, no se guardan. «Expediente vivo» es el expediente no descartado ligado a la orden; si hay más de uno,
el más antiguo.

| Etapa (`stage`) | Condición                                                                                                      | Texto               |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------------- |
| `cancelled`     | orden cancelada                                                                                                | Cancelada           |
| `to_receive`    | recepción `pending`                                                                                            | Por recibir         |
| `to_invoice`    | recibida (con o sin diferencias) y sin expediente vivo                                                         | Lista para factura  |
| `in_review`     | expediente vivo `uploaded`, `processing`, `failed`, `requires_review`, `out_of_scope` o `pending_confirmation` | Factura en revisión |
| `to_schedule`   | expediente vivo `confirmed`                                                                                    | Por programar       |
| `scheduled`     | expediente vivo `scheduled`                                                                                    | Pago programado     |
| `paid`          | expediente vivo `paid`                                                                                         | Pagada              |

## Criterios de aceptación

### API · avance de la orden

- **AC-019-01** · `GET /api/purchase-orders` y `GET /api/purchase-orders/:id` devuelven `progress.stage` según la
  tabla de etapas, para cada fila de la tabla.
- **AC-019-02** · Con expediente vivo, `progress.invoice` trae `payableId`, `status`, `invoiceNumber`, `dueOn`,
  `scheduledPayOn` y `paidOn` (nulos mientras no existan); sin expediente vivo es `null`. No trae importes de la
  factura ni su archivo: un `purchasing` ve el avance sin tener `payables:read`.
- **AC-019-03** · `GET /api/purchase-orders?awaitingInvoice=true` devuelve solo órdenes abiertas, recibidas (con o
  sin diferencias) y sin expediente vivo.
- **AC-019-04** · La orden devuelve `linesSubtotal` (suma de importes pedidos) y `receivedSubtotal` (suma de
  cantidad recibida × precio unitario, redondeada por partida igual que `amount`); `receivedSubtotal` es `null`
  mientras la recepción esté `pending` o la orden no tenga partidas. Ejemplo: la OC P3062 (subtotal 30,875.50) con
  «Pepsi 600 ml» recibido 70 de 75 a 149.50 da `receivedSubtotal` 30,128.00.

### API · conciliación

- **AC-019-05** · (conserva AC-004-05) Dada una OC `received` (completa), el total de la factura se compara con el
  total de la OC: un centavo de diferencia da `TOTAL_MISMATCH`.
- **AC-019-06** · (modifica AC-004-05) Dada una OC `received_with_differences`, cuando el subtotal de la factura es
  igual a `receivedSubtotal`, entonces no hay razón por importes y, si no hay otras razones, queda
  `pending_confirmation`. No se evalúa `TOTAL_MISMATCH`.
- **AC-019-07** · Dada una OC `received_with_differences`, cuando el subtotal de la factura difiere de
  `receivedSubtotal` (un centavo basta), entonces queda `requires_review` con `RECEIVED_AMOUNT_MISMATCH`. Ejemplo:
  recibido 30,128.00 y factura con subtotal 30,875.50 (facturaron todo lo pedido).
- **AC-019-08** · Dada una OC `received_with_differences`, cuando la factura no trae subtotal legible, entonces
  queda `requires_review` con `MISSING_FIELD:subtotal`; corregir el campo vuelve a evaluar.
- **AC-019-09** · El expediente devuelve en `purchaseOrder` los datos del cuadro: `total`, `linesSubtotal`,
  `receivedSubtotal`, `receiptStatus`, `receivedOn` y `receiptNotes`.

### Web

- **AC-019-10** · `/ordenes/:id` (permiso `orders:read`) muestra una barra con los pasos Creada, Recibida,
  Facturada, Confirmada, Programada y Pagada: los cumplidos con su fecha, el actual resaltado con el texto de la
  etapa y `aria-current="step"`. Una orden cancelada muestra «Cancelada» en lugar de la barra.
- **AC-019-11** · La página muestra proveedor, fecha, total, «Crédito 30 días» (o «Contado») del proveedor, las
  partidas con pedido y recibido (las que tienen diferencia, marcadas con color y texto), quién recibió, cuándo y
  las notas de recepción.
- **AC-019-12** · La página ofrece una sola acción principal, la del paso que sigue y solo si el rol puede hacerla:
  «Editar» en `to_receive` con `orders:write`; «Cargar factura» en `to_invoice` con `payables:write`; «Ver factura»
  desde `in_review` con `payables:read`. Sin permiso para el paso, dice quién sigue («Esperando a Almacén»,
  «Esperando a Cuentas por pagar»).
- **AC-019-13** · «Cargar factura» abre la subida con la orden ya elegida (no editable) y, al terminar, lleva al
  expediente creado.
- **AC-019-14** · Las filas de `/ordenes` abren `/ordenes/:id` y muestran la etapa en lugar de los dos estados
  separados; el filtro ofrece las etapas.
- **AC-019-15** · «Mi trabajo» de quien tiene `payables:write` empieza con el bloque «Órdenes listas para factura»
  (`awaitingInvoice=true`), cada fila con «Cargar factura».
- **AC-019-16** · El expediente muestra el cuadro Pedido / Recibido / Facturado: subtotal pedido, subtotal recibido
  y subtotal de la factura, más el total de la OC junto al total de la factura. La cifra que no cuadra se marca con
  color y texto («No coincide con lo recibido»), y las notas de recepción se muestran como texto.
- **AC-019-17** · `RECEIVED_AMOUNT_MISMATCH` se explica en lenguaje llano: «El subtotal de la factura
  ($30,875.50) no coincide con lo que recibió Almacén ($30,128.00).»
- **AC-019-18** [manual] · Recorrido completo con un usuario por rol. Cómo verificarlo: `pnpm dev`; Compras crea la
  orden desde `OC 3062 PEPSI.pdf`; Almacén la recibe con 70 de 75 «Pepsi 600 ml» y una nota; Cuentas por pagar la
  ve en «Órdenes listas para factura», carga una factura sintética con subtotal 30,128.00, revisa el cuadro,
  confirma, programa y registra el pago; en cada paso `/ordenes/:id` avanza una etapa y Compras ve el avance sin
  poder abrir el expediente.

## Diseño

### Datos

Sin cambios de esquema. `purchase-orders.repository.ts` lee (no escribe) los expedientes ligados por
`purchaseOrderId` para calcular la etapa; `awaitingInvoice` se resuelve con un filtro de relación
(`payables: { none: { status: { not: 'discarded' } } }`).

### Contratos

- `packages/contracts/src/purchase-orders.ts`: `PoStage`, `PoProgress`, `PurchaseOrderDto.progress`,
  `linesSubtotal`, `receivedSubtotal`; `PurchaseOrderListQuery.awaitingInvoice` y `stage`.
- `packages/contracts/src/payables.ts`: razón `RECEIVED_AMOUNT_MISMATCH`; `subtotal` entra a los campos que pueden
  faltar; `PayableDto.purchaseOrder` con los campos de AC-019-09.

### API

| Método y ruta                  | Entrada                        | Salida              | Errores  |
| ------------------------------ | ------------------------------ | ------------------- | -------- |
| `GET /api/purchase-orders`     | + `awaitingInvoice?`, `stage?` | `PurchaseOrderList` | 403      |
| `GET /api/purchase-orders/:id` | —                              | `PurchaseOrderDto`  | 403, 404 |

Sin rutas nuevas: la carga de la factura sigue siendo `POST /api/payables` con `purchaseOrderNumber`.

### Reglas

`purchase-orders.rules.ts`:

- `poStage(order, livePayableStatus)`: la tabla de etapas.
- `receivedSubtotalCents(lines)`: reusa el redondeo de `lineAmount`.

`payables.rules.ts` · `evaluatePayable` (el contexto gana `receivedSubtotalCents`):

| Recepción                   | Factura                      | Razón                      |
| --------------------------- | ---------------------------- | -------------------------- |
| `received`                  | total = total OC             | —                          |
| `received`                  | total ≠ total OC             | `TOTAL_MISMATCH`           |
| `received_with_differences` | subtotal = subtotal recibido | —                          |
| `received_with_differences` | subtotal ≠ subtotal recibido | `RECEIVED_AMOUNT_MISMATCH` |
| `received_with_differences` | sin subtotal                 | `MISSING_FIELD:subtotal`   |
| `pending`                   | cualquiera                   | `RECEIPT_NOT_CONFIRMED`    |

El pago no cambia (005): se registra por el total de la factura confirmada.

### UI

- `components/FlowSteps.tsx`: barra de pasos (horizontal desde `sm`, vertical abajo), solo presentación.
- `features/purchase-orders/PurchaseOrderDetailPage.tsx` y ruta `/ordenes/:id`; `PurchaseOrdersPage` con etapa.
- `features/payables/UploadDialog.tsx`: admite la orden fija (ya recibe `purchaseOrderNumber`).
- `features/payables/PayableDetail.tsx`: cuadro Pedido / Recibido / Facturado; `lib/labels.ts`: texto de la razón.
- `features/home/MyWorkPage.tsx`: bloque «Órdenes listas para factura».

### Auditoría

Sin eventos nuevos: no hay escrituras nuevas.

## Tareas

- [x] 1. Contratos (etapa, subtotales, filtro, razón nueva) con pruebas.
- [x] 2. Reglas `poStage` y `receivedSubtotalCents` con sus tablas (AC-019-01, 04).
- [x] 3. Repositorio y service de órdenes: `progress`, subtotales y `awaitingInvoice`; integración (AC-019-01 a 04).
- [x] 4. `evaluatePayable` y su contexto; pruebas de la tabla e integración (AC-019-05 a 09).
- [x] 5. Web: `FlowSteps` y `/ordenes/:id` (AC-019-10 a 13).
- [x] 6. Web: etapa en `/ordenes` y bloque de «Mi trabajo» (AC-019-14, 15).
- [x] 7. Web: cuadro y texto de la razón en el expediente (AC-019-16, 17).
- [ ] 8. `pnpm check`, recorrido manual AC-019-18, mapa de `specs/README.md`; `hecha`.

## Fuera de alcance y decisiones

- **Con diferencias se concilia el subtotal, no el total.** La OC guarda precios sin impuestos por partida y un
  total con impuestos; el IVA y el IEPS cambian por producto (agua, refresco), así que el total esperado de una
  entrega parcial no se puede calcular con exactitud. El subtotal sí. El total queda a la vista en el cuadro para
  que la contadora lo juzgue al confirmar. **A validar con la contadora:** que el subtotal de sus facturas sea
  comparable con cantidad × precio unitario de la OC (por ejemplo, que el IEPS no venga dentro del precio).
- **El depósito de envase** del PDF de ParLevel no se guarda (spec 015) y no entra al subtotal recibido.
- **Crédito solo en el proveedor.** La orden lo muestra; el vencimiento se sigue calculando al confirmar la factura
  (fecha de recepción de la factura + días de crédito), como en 005.
- **Compras ve el avance, no el expediente.** `progress.invoice` no lleva importes ni archivo.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-15 · La persona aprobó la spec (`borrador` → `lista`) y pidió implementarla sin esperar a que la 018 pase a `hecha` (le falta solo AC-018-15 manual; ver `docs/pendientes-de-verificar.md`).
- 2026-11-15 · `poStage` y `receivedSubtotalCents` viven en `purchase-orders.progress.rules.ts` (no en `purchase-orders.rules.ts`, que está en el límite de 300 líneas). «Expediente vivo» aquí es «no descartado», distinto del `NOT_LIVE` de duplicados (que excluye también `failed` y `out_of_scope`): así un expediente fallido sigue contando como «Factura en revisión».
- 2026-11-15 · El filtro `stage` se aplica en el service sobre la etapa derivada (no en la base); `awaitingInvoice` sí es un filtro de relación en el repositorio.
- 2026-11-15 · `PAYABLE_STATUSES`/`PayableStatus` se movieron a `contracts/payable-status.ts` (y `payables.ts` los reexporta) para que `purchase-orders.ts` los use sin un import circular.
