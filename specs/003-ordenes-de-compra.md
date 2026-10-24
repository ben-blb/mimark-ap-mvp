---
id: '003'
titulo: Órdenes de compra
estado: lista
depende_de: ['002']
requisitos: RF-02, RF-03
---

# 003 · Órdenes de compra y recepción

## Objetivo

Registrar las órdenes de compra (OC) con su total esperado y confirmar la recepción de mercancía, para que la
spec 004 pueda validar cada factura contra su OC.

## Alcance

**Incluye:** alta y edición de OC, cancelación, confirmación de recepción (fecha, responsable, notas), lista con
filtros, pantalla `/ordenes`, OC sintéticas en la semilla.

**No incluye:** recepciones parciales (una recepción por OC), líneas de producto, integración con ParLevel.

## Criterios de aceptación

- **AC-003-01** · Dada una OC con folio, proveedor activo, fecha, total con impuestos y moneda, cuando se registra,
  entonces responde 201, se puede consultar por id y encontrar por folio en la lista, y queda un evento
  `purchase_order.created`.
- **AC-003-02** · El folio se normaliza (sin espacios a los lados, mayúsculas) y es único: uno repetido responde
  409 `CONFLICT` con `fieldErrors.number`.
- **AC-003-03** · Un proveedor inexistente o inactivo responde 400 `VALIDATION` con `fieldErrors.supplierId`; un
  total menor o igual a 0 o con más de 2 decimales, o una fecha futura, responde 400 con el campo.
- **AC-003-04** · Al confirmar la recepción se guardan la fecha, el estado `received`, el responsable (actor de la
  sesión) y las notas; queda un evento `purchase_order.received` de `pending` a `received` (RF-03).
- **AC-003-05** · Confirmar una recepción ya confirmada o de una OC cancelada responde 409 `INVALID_TRANSITION`;
  una fecha futura o anterior a la fecha de la OC responde 400 con `fieldErrors.receivedOn`.
- **AC-003-06** · La lista filtra por texto (folio o nombre del proveedor), proveedor, recepción (`pending` /
  `received`) y estado (`open` / `cancelled` / `all`); por defecto muestra las abiertas, de la más reciente a la
  más antigua.
- **AC-003-07** · Editar total, moneda, fecha, referencia de ParLevel o estado (cancelar) deja un evento
  `purchase_order.updated` con los campos que cambiaron.
- **AC-003-08** · El formulario de nueva OC propone la moneda del proveedor elegido y valida folio, total y fecha
  antes de enviar.
- **AC-003-09** [manual] · En `/ordenes` se crea una OC, se confirma su recepción y la lista muestra el nuevo
  estado sin recargar la página. Cómo verificarlo: con `pnpm dev`, crear `OC-2001` y confirmar su recepción.

## Diseño

### Datos

Migración `003-ordenes-de-compra`:

```prisma
enum PurchaseOrderStatus {
  open
  cancelled
}

enum ReceiptStatus {
  pending
  received
}

model PurchaseOrder {
  id            String              @id @default(cuid())
  /// Folio normalizado, p. ej. "OC-1001".
  number        String              @unique
  supplierId    String
  supplier      Supplier            @relation(fields: [supplierId], references: [id])
  issuedOn      DateTime            @db.Date
  /// Total esperado CON impuestos (regla de negocio de CxP).
  total         Decimal             @db.Decimal(14, 2)
  currency      Currency
  parlevelRef   String?
  status        PurchaseOrderStatus @default(open)
  receiptStatus ReceiptStatus       @default(pending)
  receivedOn    DateTime?           @db.Date
  receivedBy    String?
  receiptNotes  String?
  createdBy     String
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  @@index([supplierId])
}
```

Agrega `purchaseOrders PurchaseOrder[]` a `Supplier`.

### Contratos

`contracts/purchase-orders.ts`:

```ts
export const PoNumber = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Escribe el folio')
  .max(30)
  .regex(/^[A-Z0-9][A-Z0-9/-]*$/, 'Folio inválido: letras, números y guiones, p. ej. OC-1001');
export const PositiveMoney = Money.refine((v) => Number(v) > 0, 'El total debe ser mayor a 0');

export const PurchaseOrderDto = z.object({
  id: Id,
  number: z.string(),
  supplier: z.object({ id: Id, name: z.string(), taxId: z.string(), creditDays: z.number().int() }),
  issuedOn: LocalDate,
  total: Money,
  currency: Currency,
  parlevelRef: z.string().nullable(),
  status: z.enum(['open', 'cancelled']),
  receiptStatus: z.enum(['pending', 'received']),
  receivedOn: LocalDate.nullable(),
  receivedBy: z.string().nullable(),
  receiptNotes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const PurchaseOrderList = listOf(PurchaseOrderDto);
export const CreatePurchaseOrderInput = z.object({
  number: PoNumber,
  supplierId: Id,
  issuedOn: LocalDate,
  total: PositiveMoney,
  currency: Currency,
  parlevelRef: z.string().trim().max(60).optional(),
});
export const UpdatePurchaseOrderInput = CreatePurchaseOrderInput.omit({
  number: true,
  supplierId: true,
})
  .extend({ status: z.enum(['open', 'cancelled']) })
  .partial();
export const ReceiptInput = z.object({
  receivedOn: LocalDate,
  notes: z.string().trim().max(500).optional(),
});
export const PurchaseOrderListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  supplierId: Id.optional(),
  receipt: z.enum(['pending', 'received']).optional(),
  status: z.enum(['open', 'cancelled', 'all']).default('open'),
});
```

Error nuevo en `contracts/errors.ts`: `INVALID_TRANSITION` → 409, "Esta acción no está permitida en el estado
actual." (agregarlo también en `HTTP_STATUS` y `DEFAULT_MESSAGE` de `app-error.ts`).

### API

| Método y ruta                           | Entrada                    | Salida                 | Errores                            |
| --------------------------------------- | -------------------------- | ---------------------- | ---------------------------------- |
| `GET /api/purchase-orders`              | `PurchaseOrderListQuery`   | `{ items }`            | —                                  |
| `GET /api/purchase-orders/:id`          | —                          | `PurchaseOrderDto`     | 404                                |
| `POST /api/purchase-orders`             | `CreatePurchaseOrderInput` | 201 `PurchaseOrderDto` | 400 `VALIDATION`, 409 `CONFLICT`   |
| `PATCH /api/purchase-orders/:id`        | `UpdatePurchaseOrderInput` | `PurchaseOrderDto`     | 400, 404                           |
| `POST /api/purchase-orders/:id/receipt` | `ReceiptInput`             | `PurchaseOrderDto`     | 400, 404, 409 `INVALID_TRANSITION` |

El service lee el proveedor con `SuppliersRepository.findById` (lectura entre módulos permitida) y valida que exista
y esté activo. "Hoy" = `toLocalDate(new Date(), env.BUSINESS_TZ)`.

El repositorio expone también `findByNumber(number)` (con el proveedor incluido); la spec 004 lo usa.

### Reglas

`purchase-orders.rules.ts` (puras; lanzan `AppError`):

```ts
checkIssuedOn(issuedOn: LocalDate, today: LocalDate): void      // futura → VALIDATION { issuedOn }
checkReceipt(po: { status; receiptStatus; issuedOn: LocalDate }, receivedOn: LocalDate, today: LocalDate): void
```

| Caso de `checkReceipt`                                 | Resultado                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `status = cancelled`                                   | 409 `INVALID_TRANSITION` "La OC está cancelada."                                |
| `receiptStatus = received`                             | 409 `INVALID_TRANSITION` "La recepción ya fue confirmada."                      |
| `receivedOn > today`                                   | 400 `VALIDATION` `{ receivedOn: 'La fecha de recepción no puede ser futura' }`  |
| `receivedOn < issuedOn`                                | 400 `VALIDATION` `{ receivedOn: 'La recepción no puede ser anterior a la OC' }` |
| OC abierta, pendiente, `issuedOn ≤ receivedOn ≤ today` | sin error                                                                       |

### UI

- Ruta `/ordenes` y entrada "Órdenes de compra" en `NAV_ITEMS` (`app/AppShell.tsx`).
- `PurchaseOrdersPage`: filtros (texto, recepción, estado), tabla con Folio · Proveedor · Fecha · Total ·
  Recepción (chip "Pendiente" o "Recibida 20 oct por Ana") · Estado · acciones "Confirmar recepción" (si está
  pendiente y abierta) y "Editar".
- `PurchaseOrderDialog` + `PurchaseOrderForm`: proveedor (solo activos, muestra su plazo), folio, fecha (hoy por
  defecto), total, moneda (la del proveedor al elegirlo), referencia ParLevel opcional.
- `ReceiptDialog`: fecha de recepción (hoy por defecto) y notas.
- Etiquetas de estados en `lib/labels.ts`; dinero y fechas con `lib/format.ts`.

### Auditoría

`purchase_order.created` (`data.after`), `purchase_order.updated` (`data.changes`), `purchase_order.received`
(`fromStatus: pending`, `toStatus: received`, `data: { receivedOn, notes }`).

### Semilla

Agrega a `prisma/seed.ts` (upsert por folio). Las specs 004 y 007 usan exactamente estos datos:

| Folio   | Proveedor (RFC) | Fecha      | Total    | Moneda | Recepción           |
| ------- | --------------- | ---------- | -------- | ------ | ------------------- |
| OC-1001 | DAN010203AB1    | 2026-10-01 | 11600.00 | MXN    | recibida 2026-10-05 |
| OC-1002 | BFM980512KL3    | 2026-10-03 | 8352.00  | MXN    | recibida 2026-10-06 |
| OC-1003 | EDR150720QW9    | 2026-10-08 | 3480.00  | MXN    | pendiente           |
| OC-1004 | ISG070809MN2    | 2026-10-02 | 1250.00  | USD    | recibida 2026-10-09 |
| OC-1005 | CSM120304TR5    | 2026-10-12 | 2900.00  | MXN    | recibida 2026-10-12 |

## Tareas

- [ ] 1. Contratos `purchase-orders.ts` con pruebas (folio normalizado, total positivo); código `INVALID_TRANSITION`.
- [ ] 2. Modelo y migración `pnpm db:migrate --name 003-ordenes-de-compra`; semilla con OC-1001…1005.
- [ ] 3. `purchase-orders.rules.ts` con pruebas unitarias (tabla de `checkReceipt`, AC-003-03 y AC-003-05).
- [ ] 4. Repositorio (`list`, `findById`, `findByNumber`, `create`, `update`, `markReceived`), service, controller y
      módulo copiando `suppliers`; registrar en `app.module.ts`.
- [ ] 5. `apps/api/test/fixtures.ts` con `seedCatalog(db)`, que inserta los proveedores y OC de la tabla de la
      semilla (las pruebas de las specs 004–006 lo reutilizan); pruebas de integración AC-003-01…07.
- [ ] 6. Web: `purchase-orders.api.ts`, página, diálogos, formulario con prueba AC-003-08, ruta y navegación.
- [ ] 7. `pnpm check` en verde, verificación manual AC-003-09 y estado `hecha`.

## Fuera de alcance y decisiones

- Una OC tiene una sola recepción completa. Si aparecen recepciones parciales, se separa en una tabla `Receipt`
  (spec nueva).
- Se puede editar una OC aunque ya tenga un expediente: la spec 005 vuelve a correr las reglas al confirmar, así
  que una OC editada se valida con sus datos actuales.

## Bitácora

<!-- AAAA-MM-DD · nota -->
