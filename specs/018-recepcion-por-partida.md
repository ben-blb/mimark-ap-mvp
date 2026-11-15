---
id: '018'
titulo: Recepción por partida con diferencias
estado: en-progreso # borrador | lista | en-progreso | hecha
depende_de: ['003', '014', '017']
requisitos: RF-03 (extensión; modifica 003 y 014)
---

# 018 · Recepción por partida con diferencias

## Objetivo

Hoy Almacén solo puede confirmar una recepción si llegó todo (checklist de 014); si falta algo, no se confirma y el
faltante se anota fuera del sistema. Esta spec hace que Almacén capture la cantidad recibida de cada partida y que
la orden quede «Recibida» o «Recibida con diferencias», para que Compras y Cuentas por pagar lo vean.

## Alcance

**Incluye:** cantidad recibida por partida; estado de recepción `received_with_differences`; notas obligatorias
cuando hay diferencias; pantalla de recepción con cantidades; el estado y las cantidades visibles en `/ordenes` y
en «Mi trabajo» de Compras.

**No incluye:** varias entregas por orden (sigue una recepción por OC); recibir más de lo pedido; reabrir o corregir
una recepción confirmada; devoluciones; cambiar cómo se concilia la factura (spec 019: hasta entonces una orden con
diferencias se compara contra el total de la OC y cae en revisión por `TOTAL_MISMATCH`); dependencias nuevas.

## Criterios de aceptación

### API

- **AC-018-01** · (modifica AC-014-05) Dada una OC con partidas y recepción `pending`, cuando se envía `POST
/api/purchase-orders/:id/receipt` con `receivedOn` y `lines` con **todas** las partidas, cada una con
  `receivedQuantity` igual a lo pedido, entonces responde 200 con `receiptStatus: 'received'` y cada partida guarda
  su `receivedQuantity`.
- **AC-018-02** · Dada la misma OC, cuando alguna partida trae `receivedQuantity` menor a lo pedido (por ejemplo
  «Pepsi 600 ml»: pedido 75, recibido 70) y `notes` no está vacío, entonces responde 200 con `receiptStatus:
'received_with_differences'`.
- **AC-018-03** · Con diferencias y sin `notes` responde 400 `VALIDATION` con `fieldErrors.notes` y la OC sigue
  `pending`.
- **AC-018-04** · Responde 400 `VALIDATION` con `fieldErrors.lines` y la OC sigue `pending` cuando: falta una
  partida, sobra una ajena o repetida, una cantidad es negativa, tiene más de 3 decimales o supera lo pedido, o
  todas las cantidades son 0 (si no llegó nada, no hay recepción).
- **AC-018-05** · (modifica AC-014-06) Una OC sin partidas se recibe con `lines` vacío o ausente y queda `received`;
  si trae partidas responde 400.
- **AC-018-06** · El evento `purchase_order.received` registra `toStatus` (`received` o
  `received_with_differences`) y `data` con `lineCount`, `differenceCount` y las partidas con diferencia
  (`lineId`, `ordered`, `received`).
- **AC-018-07** · Las reglas de 003 se conservan con ambos estados finales: recibir una OC ya recibida (con o sin
  diferencias) o cancelada responde 409 `INVALID_TRANSITION`; la fecha no puede ser futura ni anterior a la OC; una
  OC recibida ya no admite editar sus partidas.
- **AC-018-08** · `GET /api/purchase-orders` y `GET /api/receipts` aceptan `receipt`/`status` con
  `received_with_differences`; el filtro `received` de `/api/receipts` incluye ambos. Las partidas de ambas
  respuestas traen `receivedQuantity` (`null` mientras la recepción esté `pending`).
- **AC-018-09** · La migración deja las OC ya recibidas con `receivedQuantity` igual a `quantity` en cada partida.
- **AC-018-10** · En la validación de facturas, `RECEIPT_NOT_CONFIRMED` aplica solo con recepción `pending`: una OC
  `received_with_differences` cuenta como recibida.

### Web

- **AC-018-11** · (modifica AC-014-14) «Recibir» abre una lista con una fila por partida (descripción, SKU, «Pedido
  75 cajas») y un campo «Recibido» precargado con lo pedido, con botones − y +. «Todo llegó completo» devuelve todas
  a lo pedido. Un contador dice «7 de 9 completas».
- **AC-018-12** · Con alguna diferencia, la fila se marca «Faltan 5» con color y texto, «Notas» pasa a obligatorio
  con la ayuda «Explica qué faltó» y el botón dice «Confirmar con diferencias»; sin diferencias dice «Confirmar
  recepción».
- **AC-018-13** · `/ordenes` y `/recepciones` muestran el estado «Recibida con diferencias» con tono de aviso y lo
  ofrecen como filtro; al abrir la orden, cada partida muestra pedido y recibido.
- **AC-018-14** · «Mi trabajo» de quien tiene `orders:write` suma el bloque «Recibidas con diferencias» con las
  órdenes en ese estado.
- **AC-018-15** [manual] · (modifica AC-014-15) A 375 px la recepción ocupa toda la pantalla, − y + son blancos
  táctiles de al menos 48 px, fecha y notas van arriba y el botón de confirmar queda fijo abajo con el contador.
  Cómo verificarlo: `pnpm dev`, entrar como Almacén en un viewport de 375 px y recibir una orden con un faltante.

## Diseño

### Datos

`apps/api/prisma/schema.prisma`, migración `018-recepcion-por-partida`:

- `PurchaseOrderLine.receivedQuantity Decimal? @db.Decimal(12, 3)`.
- `enum ReceiptStatus { pending received received_with_differences }`.
- La migración rellena `receivedQuantity = quantity` en las partidas de órdenes con `receiptStatus = 'received'`.

### Contratos

`packages/contracts/src/purchase-orders.ts`:

- `ReceivedQuantity`: texto, ≥ 0, hasta 3 decimales.
- `ReceiptInput`: `{ receivedOn, notes?, lines: [{ lineId, receivedQuantity }] }` (reemplaza `checkedLineIds`).
- `PoLineDto.receivedQuantity: string | null`; `receiptStatus` y el filtro `receipt` ganan
  `received_with_differences`.

`packages/contracts/src/receipts.ts`: `ReceiptLineDto.receivedQuantity`.
`packages/contracts/src/payables.ts`: `PayableDto.purchaseOrder.receiptStatus` gana `received_with_differences`.
`packages/contracts/src/assistant.ts`: la herramienta `recordReceipt` usa el `ReceiptInput` nuevo.

### API

| Método y ruta                           | Entrada        | Salida             | Errores            |
| --------------------------------------- | -------------- | ------------------ | ------------------ |
| `POST /api/purchase-orders/:id/receipt` | `ReceiptInput` | `PurchaseOrderDto` | 400, 403, 404, 409 |

### Reglas

`purchase-orders.rules.ts`: `checkReceiptLines(orderLines, input)` reemplaza a `checkChecklist` y devuelve los
errores de campo o el estado resultante. `checkReceipt` no cambia.

| Pedido | Recibido | Notas | Resultado                               |
| ------ | -------- | ----- | --------------------------------------- |
| 15, 2  | 15, 2    | —     | `received`                              |
| 75, 40 | 70, 40   | «…»   | `received_with_differences` (1 partida) |
| 75, 40 | 70, 40   | —     | error `notes`                           |
| 75, 40 | 76, 40   | «…»   | error `lines` (supera lo pedido)        |
| 75, 40 | 0, 0     | «…»   | error `lines` (no llegó nada)           |
| 75, 40 | 75       | —     | error `lines` (falta una partida)       |

`payables.rules.ts`: `RECEIPT_NOT_CONFIRMED` solo si `receiptStatus === 'pending'`.

### UI

`features/receipts/ReceiptDialog.tsx` (cantidades en lugar de casillas), `ReceiptsPage`, `PurchaseOrdersPage`
(estado, filtro y columnas pedido/recibido), `features/home/MyWorkPage.tsx` (bloque nuevo), `lib/labels.ts`.

### Auditoría

`purchase_order.received` con `toStatus` y `data` de AC-018-06, en la misma transacción.

## Tareas

- [x] 1. Contratos (`ReceiptInput`, DTOs, filtros, herramienta del asistente) con pruebas.
- [x] 2. Migración `018-recepcion-por-partida` con el relleno de AC-018-09.
- [x] 3. Regla `checkReceiptLines` con la tabla de ejemplos (AC-018-01 a 05).
- [x] 4. Service, repositorio y auditoría; pruebas de integración (AC-018-01 a 09).
- [x] 5. Ajuste de `RECEIPT_NOT_CONFIRMED` con su prueba (AC-018-10).
- [x] 6. Web: recepción con cantidades (AC-018-11, 12).
- [x] 7. Web: estado, filtro, pedido/recibido y bloque de «Mi trabajo» (AC-018-13, 14).
- [ ] 8. `pnpm check`, verificación manual AC-018-15, mapa de `specs/README.md`; `hecha`.

## Fuera de alcance y decisiones

- **Una sola recepción por orden.** Si el resto llega después, se anota fuera; reabrir o sumar entregas es otra spec.
- **No se recibe de más.** Lo que sobre se resuelve con el proveedor fuera del sistema.
- **Notas obligatorias con diferencias**, para que Compras y la contadora sepan qué pasó sin preguntar.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-15 · La spec pasó de `borrador` a `lista` por indicación de la persona y se implementó.
- 2026-11-15 · `POST /receipt` sigue respondiendo `ReceiptOrderDto` (sin precios, spec 017), no `PurchaseOrderDto` como dice la tabla de API.
- 2026-11-15 · Los errores de cantidad (negativa, > 3 decimales, mayor a lo pedido) caen en `fieldErrors.lines` porque `checkReceiptLines` los valida; el contrato solo exige texto, ya que Zod los reportaría como `lines.0.receivedQuantity`.
- 2026-11-15 · AC-014-06 y AC-014-14 conservan su prueba con el ID original (reescrita al nuevo formato); AC-018-05/11 las cubren con las suyas.
- 2026-11-15 · Pendiente fuera de alcance: el prompt del asistente (`assistant.v3.ts`) aún dice «checklist completo»; solo es texto de ayuda.
