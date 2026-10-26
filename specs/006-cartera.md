---
id: '006'
titulo: Cartera y tablero
estado: hecha
depende_de: ['005']
requisitos: RF-17, RF-20, RF-21
---

# 006 · Cartera y tablero

## Objetivo

Que cuentas por pagar y gerencia vean en una pantalla qué hay que pagar en los próximos 7, 15 o 30 días, qué ya
venció, qué está en revisión y qué se pagó este mes; y que puedan buscar cualquier expediente por proveedor, OC,
factura, estado o vencimiento.

## Alcance

**Incluye:** endpoint del tablero, filtros completos de la lista de expedientes, pantalla de inicio con el tablero.

**No incluye:** exportar a Excel, gráficas históricas, avisos por correo.

## Criterios de aceptación

- **AC-006-01** · (RF-17) `GET /api/dashboard?horizon=7|15|30` lista los expedientes por pagar (`confirmed` y
  `scheduled`) que vencen dentro del horizonte o ya vencieron, ordenados por día de pago (programado o, si no,
  sugerido), con los vencidos primero.
- **AC-006-02** · (RF-21) Da totales **por moneda, sin mezclar MXN y USD**: por pagar, vencidos, próximos (dentro
  del horizonte) y pagados en el mes en curso; y el número de expedientes en revisión (`requires_review` +
  `pending_confirmation`).
- **AC-006-03** · Agrupa lo por pagar por día de pago (miércoles y viernes) con número de expedientes e importe
  por moneda.
- **AC-006-04** · (RF-20) `GET /api/payables` filtra además por proveedor, folio de OC, número de factura, varios
  estados a la vez y vencimiento (`due=overdue|7|15|30`); los filtros se combinan.
- **AC-006-05** · "Hoy" se calcula en `America/Monterrey`: un expediente que vence hoy está por pagar, no vencido,
  aunque en UTC ya sea el día siguiente.
- **AC-006-06** · El tablero cambia de horizonte sin recargar y muestra los importes con su moneda.
- **AC-006-07** [manual] · Con algunos expedientes confirmados, programados y pagados (subidos con
  `AI_PROVIDER=fake`), los totales del tablero cuadran con la lista filtrada por los mismos criterios.

## Diseño

### Contratos

`contracts/dashboard.ts`:

```ts
const MoneyByCurrency = z.object({ MXN: Money, USD: Money });
const Bucket = z.object({ count: z.number().int(), amount: MoneyByCurrency });
export const DashboardQuery = z.object({
  horizon: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(15), z.literal(30)]))
    .default(15),
});
export const DashboardDto = z.object({
  today: LocalDate,
  horizon: z.number().int(),
  totals: z.object({ pending: Bucket, overdue: Bucket, upcoming: Bucket, paidThisMonth: Bucket }),
  inReview: z.number().int(),
  byPayDay: z.array(
    z.object({ payOn: LocalDate, count: z.number().int(), amount: MoneyByCurrency }),
  ),
  items: z.array(
    z.object({
      id: Id,
      supplierName: z.string(),
      invoiceNumber: z.string(),
      total: Money,
      currency: Currency,
      dueOn: LocalDate,
      payOn: LocalDate,
      status: z.enum(['confirmed', 'scheduled']),
      urgent: z.boolean(),
      overdue: z.boolean(),
    }),
  ),
});
```

`PayableListQuery` (spec 004) agrega: `supplierId`, `poNumber`, `invoiceNumber`, `status` como lista separada por
comas (`status=confirmed,scheduled`) y `due: z.enum(['overdue', '7', '15', '30']).optional()`.

### API

| Método y ruta        | Entrada           | Salida         |
| -------------------- | ----------------- | -------------- |
| `GET /api/dashboard` | `DashboardQuery`  | `DashboardDto` |
| `GET /api/payables`  | filtros ampliados | `PayableList`  |

### Reglas

`dashboard.rules.ts`: `summarizePortfolio(rows, today, horizon) → DashboardDto` (pura). El repositorio
`dashboard.repository.ts` trae solo las filas necesarias (estado, vencimiento, días de pago, total, moneda,
proveedor, fecha de pago) de expedientes `confirmed`, `scheduled` y `paid` del mes, más el conteo en revisión.
Con el volumen del MVP (decenas por semana) se resume en memoria; si crece, se pasa a agregados SQL sin cambiar
el contrato.

| Bucket          | Incluye                                         |
| --------------- | ----------------------------------------------- |
| `pending`       | `confirmed` + `scheduled`                       |
| `overdue`       | `pending` con `dueOn < today`                   |
| `upcoming`      | `pending` con `today ≤ dueOn ≤ today + horizon` |
| `paidThisMonth` | `paid` con `paidOn` en el mes de `today`        |
| `payOn`         | `scheduledPayOn ?? suggestedPayOn`              |

Ejemplo (hoy 2026-10-20, horizonte 7): A vence 10-15 (MXN 1000.00), B vence 10-22 (MXN 500.00), C vence 10-30
(USD 100.00), D pagado 10-05 (MXN 200.00) → `overdue` 1 / MXN 1000.00; `upcoming` 1 / MXN 500.00; `pending`
3 / MXN 1500.00 + USD 100.00; `paidThisMonth` 1 / MXN 200.00; `items` = [A, B] (C queda fuera del horizonte).

### UI

- La ruta índice `/` deja de redirigir a `/proveedores` y muestra `DashboardPage`; entrada "Tablero" al inicio de
  `NAV_ITEMS`.
- `DashboardPage`: selector 7 / 15 / 30 días; cuatro indicadores (por pagar, vencidos, próximos, pagados en el mes)
  con importes por moneda; aviso "N en revisión" que lleva a `/expedientes?status=requires_review,pending_confirmation`;
  lista por día de pago; tabla de expedientes del horizonte (proveedor, factura, total, vence, paga, chips
  urgente/vencido) que abre el detalle.
- `PayablesPage` agrega filtros de proveedor, OC, factura y vencimiento, y lee/escribe los filtros en la URL
  (`useSearchParams`) para que los enlaces del tablero funcionen.

## Tareas

- [x] 1. Contratos `dashboard.ts` y filtros ampliados de `PayableListQuery`.
- [x] 2. `dashboard.rules.ts` con pruebas (tabla de buckets, AC-006-02, AC-006-03, AC-006-05).
- [x] 3. `dashboard.repository.ts`, service, controller y módulo; filtros nuevos en `payables.repository.list`.
- [x] 4. Pruebas de integración AC-006-01 y AC-006-04.
- [x] 5. Web: `DashboardPage` (+ prueba AC-006-06), filtros en la URL, ruta índice y navegación.
- [x] 6. `pnpm check` en verde, verificación manual AC-006-07 y estado `hecha`.

## Fuera de alcance y decisiones

- Los importes nunca se suman entre monedas; no hay conversión de tipo de cambio en el MVP.

## Bitácora

<!-- AAAA-MM-DD · nota -->

- 2026-10-25 · `PayableListQuery.status` ahora es una lista separada por comas (salida: arreglo de estados); lo que
  llega por la URL se tipa como `PayableListFilters` (`z.input`). Un solo estado sigue funcionando igual.
- 2026-10-25 · El filtro `due` (y el tablero) miran solo lo que sigue por pagar (`confirmed` y `scheduled`) y usan las
  mismas fechas: `overdue` = `dueOn < hoy`; `7|15|30` = `hoy ≤ dueOn ≤ hoy + N`. Por eso los totales del tablero cuadran
  con la lista filtrada (hay una prueba que lo comprueba).
- 2026-10-25 · «Por día de pago» agrupa todo lo por pagar (`pending`), no solo el horizonte, como dice la spec
  («lo por pagar»); la lista de expedientes sí se limita al horizonte y a lo vencido.
- 2026-10-25 · `summarizePortfolio` recibe además `inReview` (el conteo lo da la base), y el repositorio duplica la forma
  de la fila porque un repositorio no puede importar reglas.
- 2026-10-25 · Los filtros de la lista viven en la URL (`useSearchParams`); se añadieron las opciones «Por revisar»
  (`requires_review,pending_confirmation`, a donde enlaza el tablero) y «Por pagar» (`confirmed,scheduled`).
- 2026-10-25 · AC-006-05 se prueba con `vi.useFakeTimers({ toFake: ['Date'] })` a las 03:30 UTC del 21 (21:30 del 20 en
  Monterrey): lo que vence el 20 no está vencido ni en el tablero ni en `?due=overdue`.
- 2026-10-25 · `test/payable-rows.ts` inserta expedientes ya confirmados/pagados directo en la base para las pruebas
  de tablero y filtros (sin IA).
- 2026-10-25 · Verificación manual AC-006-07 (`AI_PROVIDER=fake`, backend en :3100, web en :5180): con las OC sintéticas
  `OC-4001…4003` se subieron tres `factura-sin-oc-N.pdf`, se corrigió su OC y se confirmaron; una quedó confirmada, una
  programada y una pagada. El tablero mostró por pagar 2 / $16,704.00 MXN, vencidos 0, próximos 2 y pagados del mes 2
  (incluye el pago de una prueba anterior), y su tabla coincide con `/expedientes?status=confirmed,scheduled&due=15`
  (mismos dos folios y mismo total). Cambiar 7/15/30 días no recargó la página.
- 2026-10-25 · Revisión independiente (`/spec-revisar 006`), corregido con prueba: AC-006-06 ahora se prueba en
  `DashboardPage.test.tsx` (pide `horizon=30` y sigue mostrando el dato anterior hasta que llega el nuevo); los
  filtros de la URL de `PayablesPage` tienen prueba (`PayablesPage.test.tsx`); toda acción sobre un expediente y la
  subida invalidan también el tablero (`dashboardKey`, `payables.api.test.tsx`); y el repositorio del tablero ya no
  omite en silencio un expediente por pagar sin sus datos: lanza un error (500) porque unos totales que no cuadran con
  la lista son peores que un tablero que falla.
- Pendiente cosmético: si la URL trae un `status` que no está en los botones (p. ej. `status=confirmed`), ningún botón
  de estado queda marcado; la consulta sí se aplica.
