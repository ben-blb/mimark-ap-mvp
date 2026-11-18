---
id: '024'
titulo: Reportes del cierre (EDO RES, kioskos, proveedores) con drill-down
estado: borrador # borrador | lista | en-progreso | hecha
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
  costo 281,893.94 → utilidad bruta 182,095.83 (39.25 %).
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
- **AC-024-07** · Desde un movimiento se puede abrir su archivo de origen (`GET /api/closing/uploads/:id/file`,
  `reports:read`) con las mismas cabeceras de descarga segura que 004.
- **AC-024-08** · Los renglones agrupados («Rentas», «Nóminas») se pueden abrir por subtotal de la categoría
  antes de las partidas.

### Kioskos (RF-03, RF-04, RF-05, RF-14)

- **AC-024-09** · `GET /api/reports/kiosks?companyId&month` devuelve por kiosko: ventas, costo de lo vendido,
  margen y % de margen, mermas, robos, comisiones y **utilidad antes de gastos generales**, más una fila «Sin
  kiosko» con lo que no se pudo asignar; la suma de kioskos más «Sin kiosko» iguala los totales del EDO RES.
- **AC-024-10** · Ordenable por margen; marca en texto y color los kioskos con margen negativo.
- **AC-024-11** · Los gastos generales **no se prorratean** y se muestran aparte en una fila «Gastos generales
  (sin asignar)».

### Proveedores (RF-13)

- **AC-024-12** · `GET /api/reports/suppliers?companyId&month` devuelve por proveedor: pago total, número de
  pagos, ticket promedio, % del gasto y primer y último pago, a partir de los egresos clasificados como proveedor.
- **AC-024-13** · Un proveedor se identifica por la regla que lo clasificó; los egresos sin regla de proveedor no
  aparecen aquí.

### Exportación y permisos

- **AC-024-14** · `GET /api/reports/edo-res/export?companyId&month` devuelve un `.xlsx` con las hojas EDO RES,
  Kioskos, Proveedores y Movimientos (el detalle completo); los textos con `=`, `+`, `-` o `@` al inicio se
  escriben como texto (sin fórmulas inyectadas). Escribe `report.exported`.
- **AC-024-15** · `manager` y `admin` pueden leer y exportar (`reports:read`); `purchasing`, `warehouse` y
  `payables` reciben 403.
- **AC-024-16** · Para `manager` los reportes aparecen como entrada del menú «Cierre → Reportes» y desde el
  Tablero; no tiene acceso a cargas, revisión ni conciliación.

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
| `GET /api/reports/edo-res`                     | `reports:read` | `EdoResDto`           | 403, 422 |
| `GET /api/reports/edo-res/lines/:line/entries` | `reports:read` | lista paginada        | 403, 404 |
| `GET /api/reports/kiosks`                      | `reports:read` | `KioskReportDto[]`    | 403, 422 |
| `GET /api/reports/suppliers`                   | `reports:read` | `SupplierReportDto[]` | 403, 422 |
| `GET /api/reports/edo-res/export`              | `reports:read` | `.xlsx`               | 403, 422 |

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

- [ ] 1. Contratos de reportes con pruebas.
- [ ] 2. `reports.rules.ts` con tablas de ejemplos sintéticos: EDO RES, kioskos, proveedores (AC-024-01 a 05, 09,
      11, 12).
- [ ] 3. Repositorio de solo lectura, service y controller; integración (AC-024-01 a 13).
- [ ] 4. Exportación `.xlsx` con inyección controlada y auditoría (AC-024-14).
- [ ] 5. Permisos y menú de gerencia (AC-024-15, 16).
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

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->
