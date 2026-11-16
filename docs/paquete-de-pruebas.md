# Paquete de pruebas manuales desde cero

Datos sintéticos para recorrer **todo el flujo con una base vacía y sin seed**: alta inicial, usuarios por rol,
proveedores, órdenes de compra desde PDF, recepción, facturas (felices y con errores), confirmación y pago.
Pensado para **IA real** (`AI_PROVIDER=anthropic|google`): los PDFs tienen contenido coherente que la IA lee de verdad.
Nada es real: razones sociales y RFC son inventados.

## 1. Generar los archivos

```bash
pnpm paquete-manual
```

Crea `infra/probador/paquete-manual/` (ignorada por git; se borra y se rehace en cada corrida, y **cada corrida
genera UUID nuevos**, así que no mezcles archivos de dos corridas):

- `1-ordenes/` · 12 OC en PDF con el diseño de ParLevel.
- `2-facturas/` · 19 facturas: `F…` cuadran con su OC, `E…` deben caer en revisión.
- `3-otros/` · documentos ajenos y archivos inválidos (`X…`).

## 2. Preparar el entorno

```bash
pnpm db:reset          # vacía la base y aplica migraciones (NO corras db:seed)
pnpm dev               # API :3000 y web :5173
```

- **IA real:** en `apps/api/.env` `AI_PROVIDER` y `AI_MODEL` y la llave del proveedor. El 2026-11-15 la lectura real
  falló con `AI_UNAVAILABLE` (ver `docs/pendientes-de-verificar.md`): si te pasa, revisa llave, modelo y red antes de seguir.
- **Cuota:** el paquete pasa ~35 documentos por la IA y el límite es 30 por persona al día. Sube
  `DAILY_AI_LIMIT=100` en `apps/api/.env` (y reinicia) o reparte la prueba en dos días.
- Con `AI_PROVIDER=fake` el contenido se ignora (solo cuenta el nombre del archivo): este paquete no sirve ahí; usa
  `docs/verificacion-manual.md`.

## 3. Alta inicial y usuarios

1. Abre `http://localhost:5173`: redirige a `/configuracion-inicial`. Código de configuración local: `mimark-local`
   (el de `apps/api/.env.example`). Crea el administrador (contraseña de 10+ caracteres).
2. Como admin, en **Usuarios** crea uno por rol con contraseña temporal (se cambia en el primer inicio):

| Rol (menú)           | Nombre sugerido | Correo sugerido       | Para qué                    |
| -------------------- | --------------- | --------------------- | --------------------------- |
| `purchasing` Compras | Compras Prueba  | `compras@pruebas.mx`  | Proveedores y órdenes       |
| `warehouse` Almacén  | Almacén Prueba  | `almacen@pruebas.mx`  | Recepciones (no ve precios) |
| `payables` CxP       | CxP Prueba      | `cxp@pruebas.mx`      | Facturas, confirmar, pagar  |
| `manager` Gerencia   | Gerencia Prueba | `gerencia@pruebas.mx` | Ver y pagar, **no** subir   |

Usa una ventana de incógnito por rol.

## 4. Proveedores (como Compras · Proveedores → Nuevo)

| Razón social                     | RFC            | Crédito     | Moneda |
| -------------------------------- | -------------- | ----------- | ------ |
| Refrescos del Norte SA de CV     | `RDN010101AB1` | 30 días     | MXN    |
| Lácteos La Pradera SA de CV      | `LPR040506CD2` | 15 días     | MXN    |
| Abarrotes Contado Regio SA de CV | `ACR090909EF3` | 0 (contado) | MXN    |
| Snacks Importados USA SA de CV   | `SIU120315GH4` | 20 días     | USD    |

**No registres** a Panificadora Cumbres SA de CV (`PCU080808IJ5`): se da de alta desde el borrador de `P4006`
(15 días, MXN). El alias de ParLevel no hace falta: el nombre del bloque «To:» coincide con la razón social sin
«SA de CV» ni acentos.

## 5. Órdenes de compra (Compras · Órdenes → Nueva orden → subir PDF)

El PDF solo trae **subtotal**: captura el **total con IVA** de la tabla (o usa «Subtotal + IVA 16 %»).

| Archivo (`1-ordenes/`) | Proveedor            | Subtotal  | Total con IVA | Uso                                 |
| ---------------------- | -------------------- | --------- | ------------- | ----------------------------------- |
| `OC-P4001-refrescos`   | Refrescos del Norte  | 8,795.00  | 10,202.20     | Camino feliz, recepción completa    |
| `OC-P4002-refrescos`   | Refrescos del Norte  | 11,090.00 | 12,864.40     | Recepción **con diferencias**       |
| `OC-P4003-lacteos`     | Lácteos La Pradera   | 10,830.00 | 12,562.80     | Total distinto, luego factura buena |
| `OC-P4004-contado`     | Abarrotes Contado    | 6,400.00  | 7,424.00      | Proveedor de contado                |
| `OC-P4005-snacks`      | Snacks Importados    | 1,250.00  | 1,450.00      | **USD** (elige USD al guardar)      |
| `OC-P4006-pan`         | Panificadora Cumbres | 5,250.00  | 6,090.00      | Proveedor **no registrado**         |
| `OC-P4007-lacteos`     | Lácteos La Pradera   | 3,280.00  | 3,804.80      | **No la recibas** (sin recepción)   |

Esperado al leer cada borrador: folio `P40xx`, fecha leída como MM-DD-AAAA, partidas completas, sin avisos.
En `P4006` aparece «Proveedor no registrado» → «Registrar proveedor». Sube `P4001` otra vez después de guardarla:
avisa «Ya existe una OC con ese folio».

### Variantes que solo prueban avisos (no hace falta guardarlas)

| Archivo              | Aviso esperado                                       |
| -------------------- | ---------------------------------------------------- |
| `OC-P4101-lacteos`   | Fecha futura (12-20-2026)                            |
| `OC-P4102-comprador` | El proveedor leído es el comprador (SMART KIOSKO)    |
| `OC-P4103-refrescos` | Depósito distinto de 0 (25.00 en la 1.ª partida)     |
| `OC-P4104-contado`   | Importe de una partida no coincide con cajas × costo |
| `OC-P4105-contado`   | Fecha ambigua (03-04-2026, se lee como 4 de marzo)   |

## 6. Recepción (Almacén · Recepciones → Recibir)

- `P4001`, `P4003`, `P4004`, `P4005`, `P4006`: recibir **todo**.
- `P4002`: en «Refresco cola 600 ml» baja de 60 a **55**; las notas son obligatorias («Faltaron 5 cajas»);
  el botón dice «Confirmar con diferencias». Subtotal recibido = **10,342.50** (total 11,997.30).
- `P4007`: no tocar.

## 7. Facturas (CxP · Cargar factura / Mi trabajo → Órdenes listas para factura)

Una OC admite **un solo expediente vivo**: donde dice «descarta», usa Descartar (motivo de 5+ caracteres) para
liberar la OC. Sigue las filas en orden: la factura buena de cada OC va **al final** de su secuencia.

| Archivo (`2-facturas/`)                        | OC            | Resultado esperado                                                           |
| ---------------------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `E01-P4001-rfc-de-otro-proveedor`              | P4001         | En revisión · `TAX_ID_MISMATCH` → descarta                                   |
| `E02-P4001-moneda-USD-en-OC-MXN`               | P4001         | En revisión · `CURRENCY_MISMATCH` → descarta                                 |
| `F01-P4001-ok`                                 | P4001         | **Por confirmar**, sin razones (vence a 30 días de recibirla)                |
| `E03-P4001-segunda-factura`                    | P4001         | En revisión · `PO_ALREADY_INVOICED`                                          |
| `E04-P4001-uuid-repetido`                      | P4001         | En revisión · `DUPLICATE` (+ `PO_ALREADY_INVOICED`)                          |
| `F01` otra vez (mismo archivo)                 | P4001         | En revisión · `DUPLICATE` (+ `PO_ALREADY_INVOICED`)                          |
| `E05-P4003-total-un-centavo-distinto`          | P4003         | En revisión · `TOTAL_MISMATCH` → descarta                                    |
| `F03-P4003-ok`                                 | P4003         | Por confirmar                                                                |
| `E06-P4002-facturan-todo-lo-pedido`            | P4002         | En revisión · `RECEIVED_AMOUNT_MISMATCH` (11,090.00 vs 10,342.50) → descarta |
| `F02-P4002-subtotal-recibido`                  | P4002         | Por confirmar (conciliada contra lo recibido)                                |
| `F04-P4004-ticket-sin-uuid`                    | P4004         | Por confirmar (un ticket no necesita UUID) → descarta                        |
| `F07-P4004-factura-contado-ok`                 | P4004         | Por confirmar · proveedor de contado: sin complemento de pago                |
| `F05-P4005-usd-ok`                             | P4005         | Por confirmar, en USD                                                        |
| `F06-P4006-ok`                                 | P4006         | Por confirmar (tras registrar el proveedor)                                  |
| `E07-P4007-sin-recepcion`                      | P4007         | En revisión · `RECEIPT_NOT_CONFIRMED`                                        |
| `E08-OC-inexistente-P9999`                     | —             | En revisión · `PO_NOT_FOUND`                                                 |
| `E09-sin-numero-de-oc`, `E10-oc-tachada`       | sin elegir OC | En revisión · `MISSING_FIELD:purchaseOrderNumber`                            |
| `F07` eligiendo la OC `P4007` al subir         | P4007         | En revisión · `PO_MISMATCH` (y las razones propias de esa OC)                |
| `E11-P4005-con-instrucciones-en-observaciones` | P4005         | La IA **no obedece** la nota: sin cambio de estado a pagada, total 1,450.00  |
| `E12-razon-social-con-HTML`                    | P4003         | El nombre se ve como **texto** (`<b>…</b>` literal), sin ejecutar nada       |

Para E09/E10 y el caso `PO_MISMATCH`, después de ver las razones puedes corregir campos o descartar.
`E11`/`E12` van contra una OC que ya tenga expediente: descarta antes el vivo o úsalas contra una OC libre.

### Archivos ajenos o inválidos (`3-otros/`)

| Archivo                         | Esperado                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `X01`, `X02`, `X03`             | Fuera de alcance · `NOT_AP_DOCUMENT` (nómina, estado de cuenta, contrato)                                    |
| `X04-mas-de-4MB.pdf`            | Rechazado: «el archivo pesa más de 4 MB» (413)                                                               |
| `X05-notas.txt`, `X06-cfdi.xml` | Rechazados por tipo (415): solo PDF, PNG o JPG                                                               |
| `X07-pdf-corrupto.pdf`          | Pasa la firma `%PDF-`; la IA no puede leerlo → falla/`AI_UNAVAILABLE`, el expediente se puede **reintentar** |
| `X08-vacio.pdf`                 | Rechazado (anota el mensaje que muestra)                                                                     |

PNG/JPG: el generador no los crea. Abre una factura `F…` en Vista Previa y expórtala a PNG o JPG; súbela (debe
leerse igual).

## 8. Confirmar, programar y pagar (CxP)

1. **Confirmar** `F01` (P4001): pasa a «Por programar»; vence a 30 días de la recepción de la factura.
2. **Programar** pago: solo miércoles o viernes (otro día → error).
3. **Registrar pago**: importe exacto del total (10,202.20), fecha **no futura**, referencia de 3 a 60 caracteres
   (`TRANSF-0001`). Importe distinto o fecha futura → error. Resultado: **Pagada**; la OC llega a la etapa Pagada.
4. Repite con `F03` (verifica el complemento de pago pendiente por tener crédito) y con `F07` (contado: sin complemento).
5. Como **Gerencia**: puede ver y pagar, pero no ve «Cargar factura».
6. **Tablero** (`/tablero`): cartera por vencer a 7/15/30 días con lo confirmado y programado.

## 9. Permisos por rol (rápido)

| Rol      | Debe poder                        | No debe poder                                    |
| -------- | --------------------------------- | ------------------------------------------------ |
| Compras  | Proveedores, OC, ver órdenes      | Abrir facturas/expedientes (403), recibir, pagar |
| Almacén  | Recibir (sin precios)             | Ver facturas, pagos, cartera, proveedores        |
| CxP      | Subir, corregir, confirmar, pagar | Crear OC o proveedores                           |
| Gerencia | Ver facturas, confirmar y pagar   | Subir o descartar facturas                       |

## 10. Asistente y registro de lo observado

Si usas el asistente, pídele «¿qué vence esta semana?» y «sube/explica la factura …»: propone, no ejecuta nada sin
tu confirmación. Anota en `docs/pendientes-de-verificar.md` cualquier resultado distinto del esperado.
