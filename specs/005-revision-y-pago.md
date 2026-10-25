---
id: '005'
titulo: Revisión, confirmación y pago
estado: en-progreso
depende_de: ['004']
requisitos: RF-12…RF-16, RF-18, RF-19, RF-22, CA-04, CA-06, PS-04, PS-05
---

# 005 · Revisión, confirmación y pago

## Objetivo

Que una persona revise y corrija lo que extrajo la IA, confirme el expediente, y que el sistema calcule su
vencimiento y el día de pago sugerido; después se programa, se registra el pago y se da seguimiento a la factura y
al complemento de pago. Ningún expediente avanza sin una acción humana.

## Alcance

**Incluye:** corregir campos (y reclasificar un fuera de alcance), confirmar con reglas re-evaluadas, bloqueo de
duplicados en la base, vencimiento y ciclo miércoles/viernes, programar y reprogramar, registrar pago, marcar
factura y complemento, descartar, barra de acciones en el detalle.

**No incluye:** pagos parciales, días festivos, ejecutar transferencias (nunca), autorización por roles.

## Criterios de aceptación

- **AC-005-01** · (RF-13) Al corregir campos se guarda el valor nuevo, se conserva intacta la salida original de la
  IA, queda un evento `payable.corrected` con quién, cuándo y `{ campo: { from, to } }`, y las reglas se vuelven a
  correr: si ya no hay razones, el expediente pasa a `pending_confirmation`.
- **AC-005-02** · Un campo corregido por una persona deja de estar en `uncertainFields`.
- **AC-005-03** · (RF-06) Un expediente `out_of_scope` se puede reclasificar (`isApDocument: true` más los campos)
  y se evalúa como cualquier otro.
- **AC-005-04** · (RF-14, PS-04) Solo se confirma desde `pending_confirmation`; desde otro estado responde 409
  `INVALID_TRANSITION`. Ningún expediente llega a `confirmed`, `scheduled` o `paid` sin una acción humana, diga lo
  que diga el documento.
- **AC-005-05** · Al confirmar se vuelven a correr las reglas con los datos actuales (OC, duplicados); si aparece
  una razón, el expediente pasa a `requires_review` y la API responde 409 `REVIEW_REQUIRED` con
  `details.reasons`.
- **AC-005-06** · (CA-04, RF-12) La base de datos impide dos expedientes confirmados con el mismo UUID fiscal o el
  mismo RFC + folio, aunque se confirmen al mismo tiempo: el segundo recibe 409 `DUPLICATE_INVOICE` y queda en
  `requires_review` con `DUPLICATE`.
- **AC-005-07** · (RF-15, RF-16, CA-06) Al confirmar se calcula el vencimiento (fecha de recepción en CxP + días
  de crédito del proveedor) y el pago sugerido (el último miércoles o viernes que no causa atraso; si no hay, el
  siguiente desde hoy y el expediente queda urgente), según la tabla de ejemplos.
- **AC-005-08** · Programar acepta solo miércoles o viernes desde hoy; por defecto usa el pago sugerido; un
  expediente programado se puede reprogramar.
- **AC-005-09** · (RF-18, PS-05) Registrar un pago exige fecha no futura, importe igual al total y referencia; el
  expediente queda `paid`. No existe ninguna operación que ejecute una transferencia.
- **AC-005-10** · (RF-19) Al confirmar, la factura queda `received` si el documento es una factura y `pending` si
  no; el complemento de pago queda `pending` si el proveedor da crédito y no aplica (`null`) si es de contado.
  Ambos se pueden marcar como recibidos o pendientes después.
- **AC-005-11** · Descartar (con motivo, desde revisión, por confirmar, fuera de alcance o falla) deja el
  expediente en `discarded`: ya no cuenta para duplicados, para la OC ni para la cartera, y no tiene acciones.
- **AC-005-12** · (RF-22) Cada acción deja un evento con su cambio de estado y `requestId`, y `allowedActions` del
  DTO coincide con la tabla de acciones por estado.
- **AC-005-13** · Si dos personas actúan a la vez sobre el mismo expediente, la segunda recibe 409 `STALE_STATUS`
  y no se pierde ni se duplica ningún cambio.
- **AC-005-14** · La barra de acciones del detalle muestra exactamente las acciones de `allowedActions`.
- **AC-005-15** [manual] · En la UI: corregir un expediente en revisión, confirmarlo, programarlo, pagarlo y marcar
  el complemento como recibido; el historial muestra cada paso. Cómo verificarlo: con `AI_PROVIDER=fake`, subir
  `factura-sin-oc.pdf`, corregir la OC a `OC-1002` y seguir el flujo.

## Diseño

### Datos

Migración `005-confirmacion-y-pago`, columnas nuevas en `Payable`:

```prisma
enum DocStatus {
  pending
  received
}

  dueOn            DateTime?  @db.Date
  suggestedPayOn   DateTime?  @db.Date
  urgent           Boolean    @default(false)
  scheduledPayOn   DateTime?  @db.Date
  /// Se llenan al confirmar. Únicos: la base impide confirmar dos veces la misma factura.
  uuidKey          String?    @unique
  folioKey         String?    @unique   /// "RFC|FOLIO"
  paidOn           DateTime?  @db.Date
  paidAmount       Decimal?   @db.Decimal(14, 2)
  paymentRef       String?
  invoiceDocStatus DocStatus?
  complementStatus DocStatus?
  discardReason    String?
```

### Contratos

En `contracts/payables.ts`:

```ts
export const CorrectFieldsInput = PayableFields.partial().extend({
  isApDocument: z.boolean().optional(),
});
export const ScheduleInput = z.object({ payOn: LocalDate.optional() });
export const PaymentInput = z.object({
  paidOn: LocalDate,
  amount: Money,
  reference: z.string().trim().min(3, 'Escribe la referencia del pago').max(60),
});
export const DocumentsInput = z.object({
  invoiceDocStatus: z.enum(['pending', 'received']).optional(),
  complementStatus: z.enum(['pending', 'received']).optional(),
});
export const DiscardInput = z.object({
  reason: z.string().trim().min(5, 'Explica el motivo').max(300),
});
```

`PayableDto` agrega:

```ts
schedule: z.object({ dueOn: LocalDate, suggestedPayOn: LocalDate, scheduledPayOn: LocalDate.nullable(),
  urgent: z.boolean(), overdue: z.boolean() }).nullable(),          // overdue = dueOn < hoy y no pagado
payment: z.object({ paidOn: LocalDate, amount: Money, reference: z.string() }).nullable(),
documents: z.object({ invoice: z.enum(['pending', 'received']).nullable(),
  complement: z.enum(['pending', 'received']).nullable() }).nullable(),
discardReason: z.string().nullable(),
```

Errores nuevos: `REVIEW_REQUIRED` (409, "Antes de confirmar hay que revisar el expediente."),
`DUPLICATE_INVOICE` (409, "Esta factura ya está confirmada en otro expediente.").

### API

| Método y ruta                       | Entrada              | Desde (estado)                                                      | Errores                                                                          |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `PATCH /api/payables/:id/fields`    | `CorrectFieldsInput` | `requires_review`, `pending_confirmation`, `out_of_scope`           | 400, 409                                                                         |
| `POST /api/payables/:id/confirm`    | —                    | `pending_confirmation`                                              | 409 `INVALID_TRANSITION`, `REVIEW_REQUIRED`, `DUPLICATE_INVOICE`, `STALE_STATUS` |
| `POST /api/payables/:id/schedule`   | `ScheduleInput`      | `confirmed`, `scheduled`                                            | 400, 409                                                                         |
| `POST /api/payables/:id/payment`    | `PaymentInput`       | `scheduled`                                                         | 400, 409                                                                         |
| `PATCH /api/payables/:id/documents` | `DocumentsInput`     | `confirmed`, `scheduled`, `paid`                                    | 400, 409                                                                         |
| `POST /api/payables/:id/discard`    | `DiscardInput`       | `requires_review`, `pending_confirmation`, `out_of_scope`, `failed` | 400, 409                                                                         |

Todas responden `PayableDto`. Cada cambio de estado usa `moveStatus(id, [desde], hacia, tx)` dentro de una
transacción junto con su evento de auditoría.

### Reglas

**Estados y acciones** (`payables.rules.ts`; reemplaza la versión mínima de la spec 004):

```ts
export const TRANSITIONS: Record<PayableStatus, readonly PayableStatus[]> = {
  uploaded: ['processing'],
  processing: ['pending_confirmation', 'requires_review', 'out_of_scope', 'failed'],
  failed: ['processing', 'discarded'],
  requires_review: ['requires_review', 'pending_confirmation', 'out_of_scope', 'discarded'],
  pending_confirmation: [
    'confirmed',
    'requires_review',
    'pending_confirmation',
    'out_of_scope',
    'discarded',
  ],
  out_of_scope: ['requires_review', 'pending_confirmation', 'out_of_scope', 'discarded'],
  confirmed: ['scheduled'],
  scheduled: ['scheduled', 'paid'],
  paid: [],
  discarded: [],
};
```

| Estado                                         | `allowedActions`                |
| ---------------------------------------------- | ------------------------------- |
| `failed`                                       | `retry`, `discard`              |
| `processing` (atorado)                         | `retry`                         |
| `requires_review`                              | `correct`, `discard`            |
| `pending_confirmation`                         | `correct`, `confirm`, `discard` |
| `out_of_scope`                                 | `correct`, `discard`            |
| `confirmed`                                    | `schedule`, `documents`         |
| `scheduled`                                    | `schedule`, `pay`, `documents`  |
| `paid`                                         | `documents`                     |
| `uploaded`, `discarded`, `processing` reciente | ninguna                         |

`assertTransition(from, to)` lanza `INVALID_TRANSITION` si `to` no está en `TRANSITIONS[from]`. La UI nunca repite
esta tabla: dibuja `allowedActions`.

**Corrección:** `applyCorrection(current, input) → { facts, changes }`: normaliza los valores nuevos igual que
`normalizeExtraction`, quita de `uncertainFields` los campos corregidos y devuelve el diff para la auditoría.
Después se llama a `evaluatePayable` con contexto fresco.

**Confirmación** (en el service, en este orden): `assertTransition`; contexto fresco + `evaluatePayable`; si hay
razones → `requires_review` + 409 `REVIEW_REQUIRED`; si no → `computeSchedule`, llaves `uuidKey = taxUuid` y
`folioKey = RFC|FOLIO`, documentos iniciales, estado `confirmed`. Si la base rechaza una llave única → segunda
transacción que lo pasa a `requires_review` con `DUPLICATE` y 409 `DUPLICATE_INVOICE`.

**`schedule.rules.ts`**:

```ts
export const PAY_WEEKDAYS = [3, 5];   // miércoles y viernes
isPayDay(date: LocalDate): boolean
lastPayDayOnOrBefore(date: LocalDate): LocalDate
nextPayDayOnOrAfter(date: LocalDate): LocalDate
computeSchedule(receivedOn: LocalDate, creditDays: number, today: LocalDate):
  { dueOn: LocalDate; suggestedPayOn: LocalDate; urgent: boolean }
// dueOn = receivedOn + creditDays
// last = lastPayDayOnOrBefore(dueOn)
// last >= today → { dueOn, suggestedPayOn: last, urgent: false }
// si no         → { dueOn, suggestedPayOn: nextPayDayOnOrAfter(today), urgent: true }
checkPayOn(payOn: LocalDate, today: LocalDate): void          // no es mié/vie o es pasada → VALIDATION { payOn }
checkPayment(input: { amountCents; paidOn }, totalCents: number, today: LocalDate): void
// importe distinto al total → VALIDATION { amount: 'Debe ser igual al total de la factura' }
// fecha futura → VALIDATION { paidOn }
isOverdue(dueOn: LocalDate, today: LocalDate): boolean        // dueOn < today
```

Ejemplos (CA-06; "hoy" = martes 2026-10-20, regla vigente de CxP: días desde que CxP recibió la factura):

| Recibido en CxP   | Días | Vence            | Pago sugerido    | Urgente | Vencido |
| ----------------- | ---- | ---------------- | ---------------- | ------- | ------- |
| 2026-10-13 (mar)  | 15   | 2026-10-28 (mié) | 2026-10-28       | no      | no      |
| 2026-10-16 (vie)  | 14   | 2026-10-30 (vie) | 2026-10-30       | no      | no      |
| 2026-10-13 (mar)  | 7    | 2026-10-20 (mar) | 2026-10-21 (mié) | sí      | no      |
| 2026-10-01 (jue)  | 7    | 2026-10-08 (jue) | 2026-10-21 (mié) | sí      | sí      |
| 2026-10-20 (mar)  | 0    | 2026-10-20 (mar) | 2026-10-21 (mié) | sí      | no      |
| 2026-10-14 (mié)* | 0    | 2026-10-14       | 2026-10-14       | no      | no      |

\* con "hoy" = 2026-10-14.

### UI

En `PayableDetailPage`:

- `ActionBar` con un botón por acción de `allowedActions` (prueba AC-005-14 con la tabla de estados).
- Corregir: la tabla de campos se vuelve editable (mismo esquema `CorrectFieldsInput` con `useZodForm`); en
  `out_of_scope` ofrece "Reclasificar como documento de compra".
- Confirmar: botón directo; si responde `REVIEW_REQUIRED`, muestra las razones nuevas.
- Programar: diálogo con un `<select>` de los próximos 12 miércoles y viernes desde hoy, con el sugerido
  preseleccionado y la fecha de vencimiento a la vista (así no se puede elegir un día inválido).
- Registrar pago: fecha (hoy), importe (el total, de solo lectura), referencia.
- Documentos: dos interruptores (factura recibida, complemento recibido).
- Descartar: diálogo con motivo.
- Tarjeta "Pago": vence, sugerido, programado, chips "Urgente" y "Vencido".

### Auditoría

`payable.corrected` (`data.changes`, cambio de estado), `payable.confirmed` (`{ dueOn, suggestedPayOn, urgent }`),
`payable.review_required` (`{ reasons }`), `payable.scheduled` (`{ payOn, late: payOn > dueOn }`),
`payable.paid` (`{ paidOn, amount, reference }`), `payable.documents` (`data.changes`),
`payable.discarded` (`{ reason }`).

## Tareas

- [x] 1. Contratos (entradas, `PayableDto` ampliado) y errores `REVIEW_REQUIRED`, `DUPLICATE_INVOICE`.
- [x] 2. Columnas y migración `pnpm db:migrate --name 005-confirmacion-y-pago`.
- [x] 3. `schedule.rules.ts` con la tabla de ejemplos (AC-005-07, AC-005-08, AC-005-09) y `TRANSITIONS`,
      `allowedActions`, `assertTransition`, `applyCorrection` con pruebas (AC-005-02, AC-005-04, AC-005-12).
- [x] 4. Service y controller: corregir, confirmar, programar, pagar, documentos, descartar.
- [x] 5. Pruebas de integración AC-005-01, 03…06, 09…11 y 13 (concurrencia: dos `confirm` en paralelo con
      `Promise.all`).
- [x] 6. Web: `ActionBar` (+ prueba AC-005-14), edición de campos, diálogos de programar, pagar, documentos y
      descartar, tarjeta de pago.
- [ ] 7. `pnpm check` en verde, verificación manual AC-005-15 y estado `hecha`.

## Fuera de alcance y decisiones

- Nuevo estado `discarded` respecto al SRS §8: sin él, una carga duplicada o equivocada se quedaría en revisión
  para siempre y contaría como duplicado.
- Programar después del vencimiento está permitido (lo decide una persona); el evento lo registra con `late: true`.
- Días festivos fuera del MVP: si un miércoles o viernes es feriado, la persona reprograma.

## Bitácora

<!-- AAAA-MM-DD · nota -->
