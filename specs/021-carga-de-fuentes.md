---
id: '021'
titulo: Carga de fuentes del mes y movimientos
estado: en-progreso # borrador | lista | en-progreso | hecha
depende_de: ['020']
requisitos: Mini SRS cierre mensual · RF-01, RF-04, RF-05, RF-06, RF-10
---

# 021 · Carga de fuentes del mes y movimientos

## Objetivo

La auxiliar hoy baja los reportes, reacomoda columnas y pega en un Excel con muchas pestañas. Esta spec deja
**subir el archivo tal cual** (Parlevel, Cantaloupe, banco, caja, nómina), validar que es el correcto (columnas,
mes, empresa) y convertirlo en una sola tabla de **Movimientos** de la que se alimentan conciliación y reportes.

## Alcance

**Incluye:** periodos (empresa + mes); subida de `.xlsx` y `.csv` por tipo de fuente; validación; normalización a
movimientos; recarga idempotente; vista previa antes de confirmar; captura manual de caja y nómina.

**No incluye:** PDF del banco (022); clasificar con reglas, traspasos y cuadres (023); reportes (024); conexión
automática con banco, Parlevel o Cantaloupe; fuentes que no estén en la tabla de abajo.

## Fuentes y su normalización

| Tipo (`source`)  | Archivo esperado                                           | Genera movimientos de…                                                 |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `parlevel_sales` | «Sales by POS» / roiReport (Parlevel)                      | ventas y comisión por kiosko (`Asset`), con costo si el export lo trae |
| `parlevel_waste` | «Waste report» (Parlevel)                                  | mermas y robos por kiosko                                              |
| `cantaloupe`     | Export diario de Cantaloupe                                | transacciones, tasa de descuento e IVA de comisión por día             |
| `bank_csv`       | Estado de cuenta CSV/Excel del banco                       | retiros y depósitos de una cuenta (`BankAccount`)                      |
| `cash`           | Plantilla de caja (fecha, concepto, monto, entrada/salida) | entradas y salidas en efectivo                                         |
| `payroll`        | Plantilla de nómina (fecha, nombre, monto, IMSS?)          | pagos de nómina                                                        |

El orden y los nombres de columna de cada tipo viven en `source-formats.ts` (una tabla de datos, no lógica).

## Criterios de aceptación

### Carga y validación

- **AC-021-01** · `POST /api/closing/uploads` (multipart: `file`, `companyId`, `month` `AAAA-MM`, `source`,
  `accountId?`) con `reports:write` guarda el original en Blob, crea el `SourceUpload` en estado `previewed` y
  devuelve filas leídas, filas rechazadas y las primeras 20 normalizadas. No crea movimientos todavía.
- **AC-021-02** · Un archivo que no es `.xlsx` ni `.csv` (por firma, no solo por extensión) o pesa más de 4 MB
  responde 415/413 antes de guardarse, como en `file.rules.ts`.
- **AC-021-03** · Si faltan columnas obligatorias del tipo elegido, responde 422 `SOURCE_MISSING_COLUMNS` con la
  lista de columnas que faltan; no guarda nada.
- **AC-021-04** · Si las fechas del archivo caen fuera de `month` (más de 0 filas), responde 422
  `SOURCE_WRONG_MONTH` con el mes detectado. Ejemplo: se sube agosto al periodo de septiembre.
- **AC-021-05** · Si un kiosko del archivo (por `Asset` o `Device ID`) no existe en el catálogo de su empresa, esas
  filas quedan en «sin kiosko» con `UNKNOWN_KIOSK:<id>` en la vista previa; no se descartan ni inventan kioskos.
- **AC-021-06** · Un archivo con el mismo hash ya confirmado para ese (empresa, mes, fuente, cuenta) responde 409
  `DUPLICATE_UPLOAD` y avisa quién y cuándo lo cargó.
- **AC-021-07** · `bank_csv` sin `accountId`, o con una cuenta de otra empresa, responde 422.

### Confirmación y movimientos

- **AC-021-08** · `POST /api/closing/uploads/:id/confirm` crea los movimientos en una transacción, pasa el upload
  a `confirmed` y escribe `upload.confirmed`. Importes con signo (ingreso +, egreso −) en `Decimal(14,2)`.
- **AC-021-09** · Cargar otro archivo de la misma (empresa, mes, fuente, cuenta) y confirmar **reemplaza** los
  movimientos del upload anterior (que pasa a `superseded`) sin duplicar; el total queda igual al del archivo nuevo.
- **AC-021-10** · Cada movimiento guarda su origen (`uploadId` + número de fila) para la trazabilidad de la 024.
- **AC-021-11** · Un periodo `closed` rechaza cargas y confirmaciones con 409 `PERIOD_CLOSED`.
- **AC-021-12** · Captura manual de `cash` y `payroll`: `POST /api/closing/entries` crea un movimiento con origen
  `manual`; solo en periodo abierto y con `reports:write`.
- **AC-021-13** · `GET /api/closing/entries?companyId&month&source&kioskId` lista movimientos paginados para
  `reports:read` (admin y gerencia).

### Seguridad

- **AC-021-14** · El contenido del archivo es dato, no instrucción: textos de celdas no ejecutan fórmulas (se
  leen como valor) ni se interpretan como HTML en la web. Una celda `=CMD()` se guarda como texto.
- **AC-021-15** [manual] · Mes completo real. Cómo verificarlo: con los exports de un mes (Parlevel, Cantaloupe,
  banco en CSV/Excel, caja, nómina) de una empresa chica, cargar cada uno en el orden de la tabla; comprobar que
  los totales de la vista previa coinciden con los de la pestaña correspondiente del Excel de la contadora.

## Diseño

### Datos

Migración `021-carga-de-fuentes`: `ReportPeriod` (`companyId`, `month`, `status` `open|closed`; único por empresa y
mes, se crea al primer upload), `SourceUpload` (`periodId`, `source`, `accountId?`, `fileKey`, `fileName`, `sha256`,
`status` `previewed|confirmed|superseded|discarded`, `uploadedBy`, contadores) y `LedgerEntry` (`periodId`, `date`,
`kioskId?`, `accountId?`, `source`, `uploadId?`, `rowNumber?`, `concept`, `amount`, `categoryId?`, `needsReview`,
`transferGroupId?`, `meta Json?`). Las columnas de clasificación y traspaso se llenan en la 023.

### Contratos

`closing.ts`: `Source`, `UploadPreviewDto`, `LedgerEntryDto`; `errors.ts`: `SOURCE_MISSING_COLUMNS`,
`SOURCE_WRONG_MONTH`, `DUPLICATE_UPLOAD`, `PERIOD_CLOSED`.

### API

| Método y ruta                              | Permiso         | Salida             | Errores            |
| ------------------------------------------ | --------------- | ------------------ | ------------------ |
| `POST /api/closing/uploads`                | `reports:write` | `UploadPreviewDto` | 413, 415, 422, 409 |
| `POST /api/closing/uploads/:id/confirm`    | `reports:write` | `UploadDto`        | 404, 409           |
| `POST /api/closing/uploads/:id/discard`    | `reports:write` | `UploadDto`        | 404, 409           |
| `GET /api/closing/uploads?month&companyId` | `reports:read`  | lista              | 403                |
| `POST /api/closing/entries`                | `reports:write` | `LedgerEntryDto`   | 409, 422           |
| `GET /api/closing/entries`                 | `reports:read`  | lista paginada     | 403                |

### Reglas

`source-parsers.rules.ts` (puro; recibe filas ya leídas como `unknown[][]`): `detectColumns(source, header)`,
`normalizeRow(source, row, ctx)` → `{ entry } | { reject }`, `monthOf(dates)`. La lectura física del `.xlsx`/CSV
vive en `integrations/spreadsheet.client.ts`.

### UI

`/cierre/cargas`: selector de empresa y mes, una tarjeta por fuente con su estado (sin cargar / vista previa /
confirmada), subida con arrastrar y soltar, vista previa con filas rechazadas marcadas en texto y color, y botón
«Confirmar». Gerencia no ve esta pantalla.

### Auditoría

`upload.previewed`, `upload.confirmed`, `upload.superseded`, `upload.discarded`, `entry.created` (manual).

## Tareas

- [x] 1. Contratos y códigos de error con pruebas.
- [x] 2. `source-formats.ts` y `source-parsers.rules.ts` con tablas de ejemplos sintéticos (AC-021-03 a 05, 14).
- [x] 3. Esquema Prisma y migración `021-carga-de-fuentes`.
- [x] 4. `spreadsheet.client.ts` (lector `.xlsx`/CSV) y su doble para pruebas; dependencia justificada en Bitácora.
- [x] 5. Service/controller de uploads y vista previa; integración (AC-021-01, 02, 06, 07).
- [ ] 6. Confirmación, reemplazo, periodo cerrado y captura manual (AC-021-08 a 13).
- [ ] 7. Web: `/cierre/cargas` y vista previa.
- [ ] 8. `pnpm check`, AC-021-15, fila en `specs/README.md`; `hecha`.

## Fuera de alcance y decisiones

- **Dependencia nueva:** lector de `.xlsx` (propuesta: `exceljs`) y CSV; hoy no hay ninguna. Justificarla en la
  Bitácora con su tamaño y alternativa descartada (pedir solo CSV).
- **Muestras reales pendientes** (SRS §9.1–9.2): hasta tener un mes de cada export y saber si el banco entrega
  CSV/Excel, los nombres de columna de `source-formats.ts` son una propuesta basada en el archivo de ejemplo.
- **Reemplazo, no suma:** recargar un archivo corregido sustituye al anterior; es lo que hace hoy la auxiliar al
  repegar, pero con rastro.
- **Límite de 4 MB** por request en Vercel: exports muy grandes (45 kioskos) pueden obligar a partir por semana;
  se mide en AC-021-15 y se decide en Bitácora.
- **Sin datos reales en el repositorio:** fixtures sintéticos derivados de la estructura del Excel.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-18 · Aprobada por el usuario (opción 1: tal como está); estado `en-progreso`.
- 2026-11-18 · Los contratos nuevos viven en `contracts/closing-uploads.ts` (no en `closing.ts`) por el límite de
  300 líneas por archivo. AC-021-07 (`accountId` faltante o de otra empresa) responde 400 `VALIDATION` con
  `fieldErrors.accountId`, igual que en la 020 (el catálogo no usa 422 para validación). Los cuatro códigos nuevos
  (`SOURCE_MISSING_COLUMNS`, `SOURCE_WRONG_MONTH`, `DUPLICATE_UPLOAD`, `PERIOD_CLOSED`) sí usan los estados de la spec.
- 2026-11-18 · Cada fila genera **un** movimiento (`{ entry } | { reject }`): la comisión y el costo de Parlevel, y
  transacciones, tasa de descuento e IVA de Cantaloupe, van en `meta` (la 023/024 los interpreta). Merma, robo, retiro,
  nómina y «Salida» son negativos. Un kiosko que no está en el catálogo queda `kioskId=null`, `needsReview=true` y la
  bandera `UNKNOWN_KIOSK:<id>`. Las columnas de `source-formats.ts` son una propuesta (SRS §9.1–9.2), con alias en español
  e inglés. Fechas aceptadas: `AAAA-MM-DD`, `DD/MM/AAAA`, `Date` y serial de Excel.
- 2026-11-18 · **Dependencias nuevas:** `read-excel-file` 9.3 (lector de `.xlsx`, 3.2 MB instalado, solo lee valores y nunca
  evalúa fórmulas) en vez de `exceljs` 4.4 (21.8 MB y mucho más de lo que hace falta para leer); alternativa descartada:
  pedir solo CSV (la contadora trabaja en Excel). El CSV se lee con un parser propio (~40 líneas, comillas, `,`/`;`/tab,
  UTF-8 o Latin-1). `write-excel-file` 4.1 queda como **devDependency** solo para fabricar `.xlsx` de prueba.
- 2026-11-18 · No hay un «doble» del lector: las pruebas de integración usan el cliente real con archivos pequeños
  generados al vuelo (más fiel y igual de rápido). Solo se lee la **primera hoja** del libro.
