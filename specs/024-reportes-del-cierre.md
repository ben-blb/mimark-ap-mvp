---
id: '024'
titulo: Reportes del cierre (EDO RES, kioskos, proveedores) con drill-down
estado: en-progreso # borrador | lista | en-progreso | hecha
depende_de: ['020', '021', '023']
requisitos: Mini SRS cierre mensual · RF-03, RF-07, RF-08, RF-13, RF-14
---

# 024 · Reportes del cierre

## Objetivo

Que la gerencia abra el sistema el día 1–2 y vea el **EDO RES** con la estructura que ya conoce, pueda bajar al
detalle de cada total hasta la partida de origen, y compare la rentabilidad de cada kiosko. Todo sale de la tabla
de movimientos clasificada (023), sin pestañas intermedias.

## Alcance

**Incluye:** EDO RES mensual por empresa; ventas y rentabilidad por kiosko; mermas y robos; análisis de
proveedores; drill-down de cada total; comparativo contra el mes anterior; exportar a Excel; solo lectura para
`manager`.

**No incluye:** contabilidad formal (balanza, balance general); prorrateo de gastos generales por kiosko (v1 los
muestra «sin asignar»); presupuesto; exportar a otros formatos; edición desde los reportes.

## Criterios de aceptación

### EDO RES

- **AC-024-01** · `GET /api/reports/edo-res?companyId&month` devuelve renglones en el orden de `edoResLine` del
  catálogo (020) con `amount` y `percentOfSales`: Ventas netas, Costo de lo vendido, Utilidad bruta, cada renglón
  de gasto de operación, Gastos de operación, Impuestos y Utilidad neta. Ejemplo sintético: ventas 463,989.77,
  costo 281,893.94 → utilidad bruta 182,095.83 (39.25 %). Composición (aprobada 2026-11-19):
  **Ventas netas** = Ventas + Venta directa + Otros ingresos (sin «Cobranza Cantaloupe»); **Costo de lo vendido** =
  Costo de lo vendido + Mermas + Robos; **Gastos de operación** = Rentas … Comisión bancaria + Intereses;
  **Impuestos** aparte; **Inversiones** y **No deducibles** restan de la utilidad neta (supuesto, ver Decisiones).
  Los renglones salen en el orden `sortOrder` de su categoría.
- **AC-024-02** · Un periodo con movimientos sin categoría o por revisar devuelve el reporte con
  `status: 'provisional'` y el renglón «Por clasificar» con su total; solo un periodo `closed` es `final`.
- **AC-024-03** · Los traspasos internos (`internal_transfer`) no entran a ningún renglón (AC-023-07) y los
  importes se suman en centavos: la suma de renglones es exactamente la utilidad neta.
- **AC-024-04** · Mes sin datos responde 200 con renglones en 0.00 y `status: 'empty'`, no 404.
- **AC-024-05** · `compareTo=AAAA-MM` agrega `previousAmount` y `delta` por renglón.

### Drill-down (RF-08)

- **AC-024-06** · `GET /api/reports/edo-res/lines/:line/entries?companyId&month` devuelve los movimientos que
  forman ese renglón, paginados, con fecha, concepto (texto), kiosko, cuenta, monto y origen (archivo y fila); su
  suma es exactamente el `amount` del renglón en AC-024-01.
- **AC-024-07** · Desde un movimiento se puede abrir su archivo de origen con la ruta **nueva**
  `GET /api/reports/uploads/:id/file` (`reports:view`; no existía en el módulo `closing`): responde el archivo guardado
  con las mismas cabeceras de descarga segura que 004 (`Content-Disposition: attachment`, `X-Content-Type-Options:
nosniff`, nombre saneado). Id inexistente o movimiento manual sin archivo → 404.
- **AC-024-08** · Los renglones agrupados («Rentas», «Nóminas») se pueden abrir por subtotal de la categoría
  antes de las partidas.

### Kioskos (RF-03, RF-04, RF-05, RF-14)

- **AC-024-09** · `GET /api/reports/kiosks?companyId&month` devuelve por kiosko: ventas, costo de lo vendido,
  margen y % de margen, mermas, robos, comisiones y **utilidad antes de gastos generales**, más una fila «Sin
  kiosko» con lo que no se pudo asignar; la suma de kioskos más «Sin kiosko» iguala los totales del EDO RES.
  Comisiones = Fee Cantaloupe + Fee Nayax + Fee software; margen = ventas − costo de lo vendido; utilidad antes de
  gastos generales = margen − mermas − robos − comisiones. Todo otro renglón de gasto va a «Gastos generales».
- **AC-024-10** · Ordenable por margen; marca en texto y color los kioskos con margen negativo.
- **AC-024-11** · Los gastos generales **no se prorratean** y se muestran aparte en una fila «Gastos generales
  (sin asignar)».

### Proveedores (RF-13)

- **AC-024-12** · `GET /api/reports/suppliers?companyId&month` devuelve por proveedor: pago total, número de
  pagos, ticket promedio, % del gasto y primer y último pago, a partir de los egresos clasificados como proveedor.
- **AC-024-13** · Un proveedor es el patrón de la regla activa de mayor prioridad que coincide con el concepto
  del movimiento (misma normalización que la 023, calculada al leer; no se guarda `ruleId`). Solo cuentan egresos
  de la categoría «Costo de lo vendido»; los que ninguna regla cubre no aparecen aquí.

### Exportación y permisos

- **AC-024-14** · `GET /api/reports/edo-res/export?companyId&month` devuelve un `.xlsx` con las hojas EDO RES,
  Kioskos, Proveedores y Movimientos (el detalle completo); los textos con `=`, `+`, `-` o `@` al inicio se
  escriben como texto (sin fórmulas inyectadas). Escribe `report.exported`.
- **AC-024-15** · Permiso nuevo **`reports:view`**: lo tienen `manager` y `admin` y da acceso solo a los reportes de
  esta spec (lectura, drill-down, descarga de origen y exportación). `purchasing`, `warehouse` y `payables`
  reciben 403.
- **AC-024-16** · `manager` pasa a tener `reports:view` **en lugar de** `reports:read`: deja de ver catálogo, cargas,
  revisión, conciliación y cuadres (esas rutas siguen en `reports:read`, que conserva `admin`) y recibe 403 en
  ellas. El menú le muestra la entrada «Reportes» (`/reportes/edo-res`) y el Tablero un enlace a ella.

### Web

- **AC-024-17** · `/reportes/edo-res`: selector de empresa y mes, tabla de renglones con %, indicador
  «Provisional / Final» en texto, y cada importe es un enlace a su detalle (AC-024-06).
- **AC-024-18** · `/reportes/kioskos` y `/reportes/proveedores` con ordenamiento, y exportar desde el encabezado.
- **AC-024-19** · A 375 px las tablas se leen con desplazamiento dentro de su contenedor, sin desbordar la página;
  tema claro y oscuro (009/010).
- **AC-024-20** [manual] · Comparación contra el EDO RES de la contadora. Cómo verificarlo: con el mes real ya
  conciliado y cerrado (023), comparar renglón por renglón con la pestaña EDO RES; las diferencias deben quedar en
  0.00 o explicadas en Bitácora; la gerencia confirma que puede llegar a cada partida con clics y sin Excel.

## Diseño

### Datos

Sin tablas nuevas: `reports` es un módulo de **solo lectura** (patrón `dashboard`) sobre `LedgerEntry`,
`Category`, `Kiosk` y `ReportPeriod`. Migración solo si el índice `(periodId, categoryId)` lo pide (se mide).

### Contratos

`packages/contracts/src/reports.ts`: `EdoResDto`, `EdoResLineDto`, `KioskReportDto`, `SupplierReportDto`,
`DrillEntryDto`. Importes como `Money` y comparados en centavos.

### API

| Método y ruta                                  | Permiso        | Salida                | Errores  |
| ---------------------------------------------- | -------------- | --------------------- | -------- |
| `GET /api/reports/edo-res`                     | `reports:view` | `EdoResDto`           | 403, 422 |
| `GET /api/reports/edo-res/lines/:line/entries` | `reports:view` | lista paginada        | 403, 404 |
| `GET /api/reports/kiosks`                      | `reports:view` | `KioskReportDto`      | 403, 422 |
| `GET /api/reports/suppliers`                   | `reports:view` | `SupplierReportDto`   | 403, 422 |
| `GET /api/reports/edo-res/export`              | `reports:view` | `.xlsx`               | 403, 422 |

### Permisos (aclaración 2026-11-18)

`reports:view` se añade a `PERMISSIONS`; la matriz queda: `admin` todos, `manager` con `reports:view` y sin
`reports:read`. Las rutas de la 020/021/023 no cambian de permiso. Se actualizan las pruebas de 020 (AC-020-01, 02,
13), 017 y `permissions.int.test.ts` para el nuevo `manager`, y se anota en esas specs que 024 lo modifica.

### Reglas

`reports.rules.ts` (puro): `buildEdoRes(entries, categories)`, `kioskRows(entries)`, `supplierRows(entries)`,
`withPercent(rows)`; el servicio solo lee y llama a las reglas. El export reutiliza el lector/escritor de
`spreadsheet.client.ts` de la 021.

### UI

`features/reports/`: `EdoResPage.tsx`, `DrillDialog.tsx`, `KiosksPage.tsx`, `SuppliersPage.tsx`; tablas con MUI
como `features/dashboard` (sin librería de gráficas nueva).

### Auditoría

`report.exported` (empresa, mes, renglones). Lecturas no se auditan.

## Tareas

- [x] 1. Contratos de reportes con pruebas.
- [x] 2. `reports.rules.ts` con tablas de ejemplos sintéticos: EDO RES, kioskos, proveedores (AC-024-01 a 05, 09,
      11, 12).
- [ ] 3. Repositorio de solo lectura, service y controller; integración (AC-024-01 a 13).
- [ ] 4. Exportación `.xlsx` con inyección controlada y auditoría (AC-024-14).
- [ ] 5. Permiso `reports:view`, ajuste de `manager`, ruta de descarga de origen y menú (AC-024-07, 15, 16).
- [ ] 6. Web: EDO RES con drill-down, Kioskos y Proveedores (AC-024-17 a 19).
- [ ] 7. `pnpm check`, AC-024-20, fila en `specs/README.md`; `hecha`.

## Fuera de alcance y decisiones

- **EDO RES igual al de hoy (RF-07, M)** como primera vista; separar «Ventas» de «Estado de resultados» (RF-14,
  C) se resuelve aquí con la vista de kioskos y **queda sujeto al acuerdo con el jefe** (SRS §9.7).
- **Sin prorrateo** de gastos generales por kiosko (§9.5): decisión abierta; si se pide, será una spec nueva que
  modifica AC-024-09 y AC-024-11.
- **Provisional vs final:** el jefe puede ver el reporte antes de cerrar el periodo, pero siempre sabe que no es
  final.
- **Migración al ERP (§9.8):** el catálogo, las reglas y la tabla de movimientos son datos portables; no se diseña
  la migración aquí.
- **Sin datos reales en el repositorio.**

- **Supuestos aprobados 2026-11-19:** composición del EDO RES, de las columnas de kioskos y el proveedor por patrón
  de regla (arriba). «Inversiones» y «No deducibles» restan de la utilidad neta mientras la contadora no diga otra
  cosa (pendiente en `docs/pendientes-de-verificar.md`).

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-18 · Aclaraciones antes de implementar: (1) permiso nuevo `reports:view` y `manager` pierde `reports:read`
  (opción A) porque `reports:read` ya abría revisión, conciliación, cargas y catálogo; (2) la descarga del archivo
  de origen es una ruta nueva en `reports`; (3) AC-023-19 sigue pendiente de un mes real y se verifica junto con
  AC-024-20, sin bloquear.
- 2026-11-19 · Contratos (tarea 1): importes con signo de renglón (ingresos +, costos y gastos como magnitud positiva; «Por clasificar» con
  signo crudo); `KioskReportDto` y `SupplierReportDto` son objetos con `rows` y totales (no arreglos), para llevar `status`,
  gastos generales y total. «Por clasificar» = movimientos normales sin categoría (no `cantaloupe`, no traspasos); uno con categoría y
  `needsReview` cuenta en su renglón pero vuelve el reporte `provisional`. «% del gasto» de proveedores es sobre el total de los
  proveedores listados.
