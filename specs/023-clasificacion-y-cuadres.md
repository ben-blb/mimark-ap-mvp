---
id: '023'
titulo: Clasificación, conciliación y cuadres del cierre
estado: borrador # borrador | lista | en-progreso | hecha
depende_de: ['020', '021']
requisitos: Mini SRS cierre mensual · RF-02, RF-09, RF-11, RF-12
---

# 023 · Clasificación, conciliación y cuadres

## Objetivo

Que cada movimiento tenga categoría, que nada se cuente dos veces y que la suma del reporte coincida con las
fuentes. Aquí vive la **conciliación**: egresos del banco contra el catálogo de reglas, traspasos entre cuentas
propias, cobros de Cantaloupe contra el depósito del banco y los cuadres del cierre con semáforo.

## Alcance

**Incluye:** aplicar reglas (020) a movimientos; cola «Por revisar» con clasificación manual y regla nueva en un
paso; detección y emparejado de traspasos; conciliación Cantaloupe vs banco por día; cuadres con semáforo;
cierre del periodo.

**No incluye:** el EDO RES y demás reportes (024); conciliar facturas de proveedores con pagos (eso es 005/019);
pagos del sistema (nunca se ejecutan); IA para clasificar (solo reglas deterministas).

## Criterios de aceptación

### Clasificación

- **AC-023-01** · `POST /api/closing/periods/:id/classify` aplica `matchRule` a todo movimiento sin categoría del
  periodo. Los que coinciden quedan con `categoryId`; los demás `needsReview=true`. Es idempotente: correrlo dos
  veces no cambia nada y no pisa categorías puestas a mano.
- **AC-023-02** · `GET /api/closing/review?periodId` lista los movimientos con `needsReview=true`, con su concepto
  (como texto) y la sugerencia de regla más cercana si existe.
- **AC-023-03** · `PATCH /api/closing/entries/:id` con `categoryId` clasifica a mano (`reports:write`), quita
  `needsReview` y escribe `entry.classified` con la categoría anterior y la nueva.
- **AC-023-04** · `POST /api/closing/entries/:id/classify-and-rule` con `{ categoryId, pattern }` clasifica el
  movimiento **y** crea la regla (020) en la misma transacción, y reclasifica los demás movimientos del periodo en
  revisión que coincidan; devuelve cuántos cambió.
- **AC-023-05** · Un periodo `closed` rechaza clasificar o cambiar categorías con 409 `PERIOD_CLOSED`.

### Traspasos

- **AC-023-06** · Dos movimientos de cuentas distintas de la misma empresa, de igual monto absoluto, signos
  opuestos y fechas con diferencia de hasta 2 días hábiles, se proponen como traspaso (`transferGroupId`) y **no
  se aceptan solos**: quedan en la cola con «Posible traspaso» para confirmarlos.
- **AC-023-07** · Confirmar un traspaso marca ambos movimientos `internal_transfer`: no entran a ingresos ni a
  egresos de 024 y su suma neta es 0.00. Desemparejarlo los devuelve a la cola.
- **AC-023-08** · Un movimiento no puede estar en dos traspasos (409 `ALREADY_PAIRED`).

### Conciliación Cantaloupe vs banco (RF-12)

- **AC-023-09** · Por día, `cantaloupeReconciliation` calcula `depósito esperado = transacciones − comisión − IVA
de la comisión` (comisión = tasa del periodo × transacciones; IVA 16 % sobre la comisión) en centavos. Ejemplo
  con tasa 3.4 %: transacciones 8,336.50 → comisión 283.44, IVA 45.35, esperado 8,007.71.
- **AC-023-10** · Compara el esperado con el depósito en banco de ese día (movimientos clasificados como cobranza
  Cantaloupe) y devuelve `difference`. Cuando varios días se depositan juntos (fin de semana), concilia por grupo
  de días consecutivos y lo indica.
- **AC-023-11** · Un día con `|difference| ≤ 0.50` es `ok`; mayor es `warning`; depósito ausente es `missing`; un
  depósito sin transacciones es `orphan`. La tolerancia es una constante del módulo, no configuración.

### Cuadres y cierre

- **AC-023-12** · `GET /api/closing/periods/:id/checks` devuelve semáforos (`ok | warning | error`) para:
  (a) ventas de Parlevel = ingresos del reporte; (b) saldo inicial + depósitos − egresos − traspasos = saldo final
  de cada cuenta; (c) movimiento neto de bancos calculado por dos caminos; (d) nómina capturada = nómina en
  egresos; (e) **ningún egreso sin categoría**; (f) ningún movimiento contado dos veces (mismo origen y fila).
- **AC-023-13** · Cada cuadre trae `valueA`, `valueB`, `difference` y un texto en lenguaje llano; los que no
  cuadran enlazan a los movimientos involucrados.
- **AC-023-14** · `POST /api/closing/periods/:id/close` (solo `admin`, `reports:write`) exige cero errores y cero
  movimientos por revisar; si no, 409 `CLOSE_BLOCKED` con la lista. Al cerrar escribe `period.closed`.
- **AC-023-15** · Reabrir (`/reopen`) exige motivo y queda en auditoría; mientras está cerrado, ni 021 ni esta
  spec escriben en él.
- **AC-023-16** · `manager` puede leer `checks`, `review` y la conciliación (200) pero no clasificar, emparejar,
  cerrar ni reabrir (403).

### Web

- **AC-023-17** · `/cierre/por-revisar`: lista de movimientos, filtro por fuente y cuenta, clasificar con
  selector de categoría y «Guardar como regla». Los traspasos propuestos muestran los dos lados juntos.
- **AC-023-18** · `/cierre/conciliacion`: tabla por día de Cantaloupe vs banco con estado en texto y color, y panel
  de cuadres con semáforo; el botón «Cerrar periodo» se deshabilita con el motivo visible.
- **AC-023-19** [manual] · Comparación con un mes real. Cómo verificarlo: cargar un mes completo (021/022),
  clasificar y comparar el panel de cuadres con la pestaña «Validación» y la conciliación Cantaloupe del Excel de
  la contadora; las diferencias deben ser 0.00 o estar explicadas.

## Diseño

### Datos

Migración `023-clasificacion-y-cuadres`: `LedgerEntry` usa `categoryId`, `needsReview`, `transferGroupId` (ya
creados en 021) y gana `kind` (`normal | internal_transfer`). Tabla `TransferGroup` (`id`, `confirmedBy`,
`confirmedAt`). `ReportPeriod` gana `closedBy`, `closedAt`, `reopenReason`. Constante `CANTALOUPE_RATE` por periodo
(`Company.cantaloupeRate` Decimal(5,4), por omisión 0.0340).

### Contratos

`closing.ts`: `ReviewItemDto`, `TransferProposalDto`, `CantaloupeDayDto`, `CheckDto`, `CloseResultDto`; errores
`PERIOD_CLOSED`, `ALREADY_PAIRED`, `CLOSE_BLOCKED`.

### API

| Método y ruta                                      | Permiso                 | Errores       |
| -------------------------------------------------- | ----------------------- | ------------- |
| `POST /api/closing/periods/:id/classify`           | `reports:write`         | 404, 409      |
| `GET /api/closing/review`                          | `reports:read`          | 403           |
| `PATCH /api/closing/entries/:id`                   | `reports:write`         | 404, 409, 422 |
| `POST /api/closing/entries/:id/classify-and-rule`  | `reports:write`         | 404, 409, 422 |
| `POST /api/closing/transfers` · `DELETE …/:id`     | `reports:write`         | 404, 409      |
| `GET /api/closing/periods/:id/{checks,cantaloupe}` | `reports:read`          | 404           |
| `POST /api/closing/periods/:id/{close,reopen}`     | `reports:write` (admin) | 404, 409      |

### Reglas

`closing-checks.rules.ts` y `cantaloupe.rules.ts` (puras): `proposeTransfers(entries)`, `cantaloupeExpected(tx,
rate)`, `reconcileDays(cantaloupeDays, bankEntries)`, `runChecks(period)` y `canClose(checks, pending)`.

### UI

`features/closing/ReviewPage.tsx` y `ReconciliationPage.tsx`; componente de semáforo con texto y color (no solo
color).

### Auditoría

`period.classified`, `entry.classified`, `rule.created` (desde `classify-and-rule`), `transfer.confirmed`,
`transfer.unpaired`, `period.closed`, `period.reopened`.

## Tareas

- [ ] 1. Contratos, errores y migración `023-clasificacion-y-cuadres`.
- [ ] 2. `cantaloupe.rules.ts` con la tabla de ejemplos (AC-023-09 a 11).
- [ ] 3. `proposeTransfers` y `runChecks` con tablas (AC-023-06, 12, 13).
- [ ] 4. Clasificación y cola de revisión: service, controller, integración (AC-023-01 a 05).
- [ ] 5. Traspasos (AC-023-06 a 08).
- [ ] 6. Conciliación, cuadres, cierre y permisos (AC-023-09 a 16).
- [ ] 7. Web: Por revisar y Conciliación (AC-023-17, 18).
- [ ] 8. `pnpm check`, AC-023-19, fila en `specs/README.md`; `hecha`.

## Fuera de alcance y decisiones

- **Solo reglas, nada de IA para clasificar:** la clasificación decide un renglón del reporte; ADR-14 pide que una
  persona decida lo que no es regla (cola «Por revisar»).
- **Comisión Cantaloupe 3.4 %, IVA 16 %, tolerancia de 0.50:** supuestos tomados del Excel de ejemplo. **A validar
  con la contadora**, igual que la fecha de depósito (fines de semana) y si Nayax (2.9 %) entra aquí o en su
  propia conciliación.
- **Traspasos propuestos, no automáticos:** un falso emparejado esconde ingresos o egresos; por eso se confirman.
- **«Los intereses duplicados» del SRS** se cubren con el cuadre (f) y la regla de que un movimiento solo cuenta
  una vez por su origen.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->
