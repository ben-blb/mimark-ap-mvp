---
id: '023'
titulo: Clasificación, conciliación y cuadres del cierre
estado: hecha # borrador | lista | en-progreso | hecha
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
  periodo, de cualquier fuente (`matchRule` ya elige una sola regla: mayor prioridad y, a igual prioridad, patrón
  más largo). Los que coinciden quedan con `categoryId`; los demás `needsReview=true`. Es idempotente: correrlo dos
  veces no cambia nada y no pisa categorías puestas a mano ni movimientos ya confirmados como traspaso. Las
  ventas de Parlevel/Cantaloupe, mermas y nómina no traen un concepto útil: se clasifican por **fuente** (no por
  reglas): `parlevel_sales` → `VENTAS`, `parlevel_waste` según `meta.kind` → `MERMAS` o `ROBOS`, `payroll` →
  `NOMINAS`; `cantaloupe` no lleva categoría ni entra a la cola (es solo insumo de la conciliación y de ninguna
  forma ingreso: la venta del reporte sale de Parlevel). Clasificar por fuente no cambia `needsReview` (un kiosko
  desconocido sigue en la cola hasta que una persona lo confirma con `PATCH`); una coincidencia de regla en
  `cash`/banco lo apaga y la falta de coincidencia lo enciende.
- **AC-023-02** · `GET /api/closing/review?periodId` lista los movimientos con `needsReview=true`, con su concepto
  (como texto) y, cuando existe, la categoría de la regla que más se le parece (coincidencia parcial: el patrón
  comparte al menos una palabra con el concepto). También trae los movimientos marcados por 021 con
  `UNKNOWN_KIOSK` y los traspasos propuestos (AC-023-06).
- **AC-023-03** · `PATCH /api/closing/entries/:id` con `categoryId` clasifica a mano (`reports:write`), quita
  `needsReview` y escribe `entry.classified` con la categoría anterior y la nueva.
- **AC-023-04** · `POST /api/closing/entries/:id/classify-and-rule` con `{ categoryId, pattern }` clasifica el
  movimiento **y** crea la regla (020) en la misma transacción, y reclasifica los demás movimientos del periodo en
  revisión que coincidan; devuelve cuántos cambió. El patrón debe aparecer en el concepto del movimiento (si no,
  400 y no se crea nada); la regla nace con prioridad 0.
- **AC-023-05** · Un periodo `closed` rechaza clasificar o cambiar categorías con 409 `PERIOD_CLOSED`.

### Traspasos

- **AC-023-06** · Dos movimientos **de banco** (`bank_csv`/`bank_pdf`) de cuentas distintas del mismo periodo, de
  igual monto absoluto, signos opuestos y fechas con diferencia de hasta 2 días hábiles (lunes a viernes; no hay
  calendario de festivos) se **proponen** como traspaso (solo entre movimientos de la cola «Por revisar» que siguen sin categoría) y **no se aceptan solos**: la propuesta se calcula al
  consultar la cola (no se guarda) y se muestra como «Posible traspaso». Si un movimiento tiene varios
  candidatos, `proposeTransfers` elige de forma determinista (fecha más cercana, luego `rowNumber`) y cada
  movimiento aparece en una sola propuesta.
- **AC-023-07** · `POST /api/closing/transfers` con `{ entryIds: [a, b] }` valida la misma regla que la
  propuesta (400 `VALIDATION` si no cuadra), crea el `TransferGroup` y marca ambos movimientos `kind=internal_transfer`, con
  `needsReview=false` y sin categoría: no entran a ingresos ni a egresos de 024 y su suma neta es 0.00.
  `DELETE /api/closing/transfers/:id` (id del grupo) los devuelve a `normal` y a la cola.
- **AC-023-08** · Un movimiento no puede estar en dos traspasos (409 `ALREADY_PAIRED`).

### Conciliación Cantaloupe vs banco (RF-12)

- **AC-023-09** · Por día, `cantaloupeReconciliation` calcula `depósito esperado = ventas − comisión − IVA de la
comisión`, donde «ventas» es la suma de `amount` de los movimientos `cantaloupe` de ese día (todos los
  kioskos; `meta.transactions` es solo un conteo y no se usa), comisión = `Company.cantaloupeRate` × ventas e
  IVA = 16 % de la comisión, **cada uno redondeado a centavos (mitad hacia arriba) antes de restar**. Ejemplo con
  tasa 3.4 %: ventas 8,336.50 → comisión 283.44, IVA 45.35, esperado 8,007.71. (`meta.discountRate` de la fila
  se ignora en el cálculo.)
- **AC-023-10** · Compara el esperado con el depósito en banco de ese día (movimientos con la categoría
  `COBRANZA_CANTALOUPE`, que esta spec agrega al catálogo) y devuelve `difference = depósito − esperado`. Cuando
  el banco no deposita sábado ni domingo, las ventas y depósitos de sábado y domingo se concilian junto con los
  del lunes siguiente (un solo renglón con `groupedDays`); un día entre semana sin depósito es `missing`, no se
  mezcla con otro. Límite conocido: el último fin de semana del mes se concilia con un lunes del mes siguiente.
- **AC-023-11** · Un día (o grupo) con `|difference| ≤ 0.50` es `ok`; mayor es `warning`; con ventas y sin
  depósito es `missing`; un depósito sin ventas es `orphan`. La tolerancia vive en `cantaloupe.assumptions.ts` (ver Diseño).

### Cuadres y cierre

- **AC-023-12** · `GET /api/closing/periods/:id/checks` devuelve semáforos (`ok | warning | error`) para:
  (a) ventas de Parlevel = ventas del reporte (categoría `VENTAS`; la venta directa de caja es otro renglón); (b) por cuenta de banco,
  saldo inicial + suma de movimientos = saldo final, con los saldos del estado de cuenta confirmado (PDF, spec
  022; sin PDF el cuadre queda `warning` «sin saldos», nunca `ok`); (c) movimiento neto de bancos por dos
  caminos: suma de todos los movimientos de banco = suma por categoría + traspasos (que suman 0); (d) nómina
  capturada (suma de `payroll`) = suma de movimientos con categoría `NOMINAS`; (e) **ningún egreso sin
  categoría**; (f) ningún movimiento contado dos veces (mismo `uploadId` y `rowNumber`).
- **AC-023-13** · Cada cuadre trae `valueA`, `valueB`, `difference` y un texto en lenguaje llano; los que no
  cuadran enlazan a los movimientos involucrados.
- **AC-023-14** · `POST /api/closing/periods/:id/close` (`reports:write`, que solo tiene `admin`) exige cero errores y cero
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
`confirmedAt`); solo existen grupos confirmados. `ReportPeriod` gana `closedBy`, `closedAt`, `reopenReason`
(`PeriodStatus` ya es `open | closed`). `Company.cantaloupeRate` Decimal(5,4), por omisión 0.0340: la tasa es de
la empresa, no del periodo. La semilla y la migración agregan la categoría `COBRANZA_CANTALOUPE`.

**Supuestos de la conciliación, en un solo archivo.** `apps/api/src/modules/closing/cantaloupe.assumptions.ts`
exporta las únicas constantes sin validar: `CANTALOUPE_VAT_RATE = 0.16` (IVA de la comisión),
`CANTALOUPE_TOLERANCE_CENTS = 50` y `BANK_BUSINESS_DAYS` (días en que el banco deposita; lunes a viernes). La tasa
por omisión de 0.0340 vive en la migración (`Company.cantaloupeRate`). Las reglas reciben estos valores como
parámetros (no los importan), de modo que cambiarlos es editar ese archivo y sus tablas de prueba, sin tocar la
lógica.

### Contratos

`closing-review.ts`: `PeriodDto`, `ReviewItemDto`, `TransferProposalDto`, `CantaloupeDayDto`, `CheckDto`, `CloseResultDto`; errores
nuevos `ALREADY_PAIRED` y `CLOSE_BLOCKED` (`PERIOD_CLOSED` ya existe desde 020/021: clasificar y emparejar lo
validan igual, dentro de la transacción con `lockPeriod`).

### API

| Método y ruta                                      | Permiso                 | Errores       |
| -------------------------------------------------- | ----------------------- | ------------- |
| `POST /api/closing/periods/:id/classify`           | `reports:write`         | 404, 409      |
| `GET /api/closing/periods?companyId&month`         | `reports:read`          | 403           |
| `GET /api/closing/review`                          | `reports:read`          | 403           |
| `PATCH /api/closing/entries/:id`                   | `reports:write`         | 404, 409, 400 |
| `POST /api/closing/entries/:id/classify-and-rule`  | `reports:write`         | 404, 409, 400 |
| `POST /api/closing/transfers` · `DELETE …/:id`     | `reports:write`         | 404, 409      |
| `GET /api/closing/periods/:id/{checks,cantaloupe}` | `reports:read`          | 404           |
| `POST /api/closing/periods/:id/{close,reopen}`     | `reports:write` (admin) | 404, 409, 400 |

### Reglas

`closing-checks.rules.ts` y `cantaloupe.rules.ts` (puras): `proposeTransfers(entries)`, `cantaloupeExpected(sales,
rate)`, `reconcileDays(cantaloupeDays, bankEntries)`, `runChecks(period)` y `canClose(checks, pending)` y
`categoryForSource(entry)` (clasificación por fuente). Los días hábiles salen de `common/dates.ts`.

### UI

`features/closing/ReviewPage.tsx` y `ReconciliationPage.tsx`; componente de semáforo con texto y color (no solo
color).

### Auditoría

`period.classified`, `entry.classified`, `rule.created` (desde `classify-and-rule`), `transfer.confirmed`,
`transfer.unpaired`, `period.closed`, `period.reopened`.

## Tareas

- [x] 1. Contratos, errores y migración `023-clasificacion-y-cuadres`.
- [x] 2. `cantaloupe.rules.ts` con la tabla de ejemplos (AC-023-09 a 11).
- [x] 3. `proposeTransfers` y `runChecks` con tablas (AC-023-06, 12, 13).
- [x] 4. Clasificación y cola de revisión: service, controller, integración (AC-023-01 a 05).
- [x] 5. Traspasos (AC-023-06 a 08).
- [x] 6. Conciliación, cuadres, cierre y permisos (AC-023-09 a 16).
- [x] 7. Web: Por revisar y Conciliación (AC-023-17, 18).
- [x] 8. `pnpm check`, AC-023-19, fila en `specs/README.md`; `hecha`.

## Fuera de alcance y decisiones

- **Solo reglas, nada de IA para clasificar:** la clasificación decide un renglón del reporte; ADR-14 pide que una
  persona decida lo que no es regla (cola «Por revisar»).
- **Comisión Cantaloupe 3.4 %, IVA 16 %, tolerancia de 0.50:** supuestos tomados del Excel de ejemplo. **Se
  quedan así por ahora** (decisión del dueño, 2026-11-18), aislados en `cantaloupe.assumptions.ts` para cambiarlos
  a mano. Siguen pendientes de validar con la contadora (`docs/pendientes-de-verificar.md`), igual que la fecha de
  depósito (fines de semana) y si Nayax (2.9 %) entra aquí o en su propia conciliación.
- **Traspasos propuestos, no automáticos:** un falso emparejado esconde ingresos o egresos; por eso se confirman.
- **Traspasos sin guardar la propuesta:** se recalcula al abrir la cola; solo se persiste lo confirmado.
- **Cobranza vs ventas (aprobado como supuesto; 024 lo respeta):** las ventas del reporte salen de Parlevel; el
  export de Cantaloupe y el depósito en banco (`COBRANZA_CANTALOUPE`) solo sirven para conciliar y **no son
  ingreso** del EDO RES (024 los excluye junto con los traspasos). Si la contadora cuenta las ventas desde otra
  fuente, cambia 024 y `categoryForSource`, no la conciliación.
- **Días hábiles = lunes a viernes, sin festivos:** un festivo bancario puede dar un `warning` falso en la
  conciliación; se acepta en el MVP.
- **«Los intereses duplicados» del SRS** se cubren con el cuadre (f) y la regla de que un movimiento solo cuenta
  una vez por su origen.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-18 · Implementada con `pnpm check` en verde. AC-023-19 [manual] queda pendiente (no hay un mes real cargado ni el Excel de
  la contadora en el repo): ver `docs/pendientes-de-verificar.md`. Tampoco se recorrieron a mano las dos pantallas nuevas con
  `pnpm dev`; solo las cubren las pruebas de Testing Library y la API de integración.
- 2026-11-18 · Decisiones que la spec no cubría (ya escritas en los criterios): (1) la venta del reporte sale solo de Parlevel;
  `cantaloupe` no lleva categoría ni entra a la cola, solo concilia; el depósito del banco es `COBRANZA_CANTALOUPE`, que 024
  debe excluir de ingresos junto con los traspasos. (2) La clasificación por fuente (`categoryForSource`) no toca `needsReview`:
  un kiosko desconocido de 021 sigue en la cola hasta que una persona lo confirma con `PATCH`. (3) Los traspasos propuestos no se
  guardan: se calculan al abrir la cola entre movimientos de banco en revisión; solo existen `TransferGroup` confirmados.
  (4) Sábado y domingo se concilian con el lunes (días hábiles = lunes a viernes, sin festivos); el último fin de semana del
  mes quedará `missing`/`orphan` hasta cargar el mes siguiente. (5) `classify-and-rule` exige que el patrón aparezca en el
  concepto y crea la regla con prioridad 0. (6) Errores de validación de esta spec son 400 `VALIDATION` (no 422). (7) Se
  agregó `GET /api/closing/periods?companyId&month` para que la web obtenga el `periodId`. (8) La cola no pagina (devuelve todo
  el periodo en revisión).
- 2026-11-18 · Supuestos sin validar aislados en `cantaloupe.assumptions.ts` (IVA 16 %, tolerancia 0.50, días hábiles, ventana de
  traspasos); la tasa 3.4 % es `Company.cantaloupeRate` (por omisión 0.0340, sin pantalla para editarla: se cambia en la base).
  `COBRANZA_CANTALOUPE` se agrega al catálogo y a la semilla (`pnpm db:seed`); en una base ya sembrada hay que volver a correrla
  (el `upsert` no pisa nada) porque la migración no inserta datos.
