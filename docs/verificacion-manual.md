# Verificación manual · specs 018 y 019

Recorrido paso a paso para probar a mano la recepción por partida (018) y el avance de la orden con conciliación
(019). **Solo para una base local**: los usuarios y contraseñas de abajo son sintéticos y el script se niega a
correr contra una base que no sea `localhost`.

## Preparación

```bash
pnpm bootstrap                  # si es la primera vez (Postgres, migraciones, semilla)
pnpm --filter @mimark/api db:verification-users   # crea los 3 usuarios de abajo (idempotente)
AI_PROVIDER=fake pnpm dev       # API :3000 y web :5173 con la IA simulada
```

La IA simulada es necesaria para esta prueba: lee los documentos **por el nombre del archivo**, no por su contenido.
(Con `AI_PROVIDER=anthropic` la lectura real del PDF falló el 2026-11-15 con `AI_UNAVAILABLE`; ver
`docs/pendientes-de-verificar.md`.)

## Usuarios de prueba (rol · correo · contraseña)

| Rol               | Correo                     | Contraseña           |
| ----------------- | -------------------------- | -------------------- |
| Compras           | `verif-compras@pruebas.mx` | `Verif-Compras-2026` |
| Almacén           | `verif-almacen@pruebas.mx` | `Verif-Almacen-2026` |
| Cuentas por pagar | `verif-cxp@pruebas.mx`     | `Verif-CxP-2026`     |

Entra en `http://localhost:5173`. Usa una ventana de incógnito por rol (o sal con «Cuenta → Salir» entre pasos).
El primer inicio muestra un tutorial: «Saltar».

## Archivos

- **Orden (PDF real de ParLevel):** `docs/OC 3062 PEPSI.pdf`. Está ignorado por git (`docs/*.pdf`): no lo subas.
  Para que la IA simulada lo lea como orden de ParLevel, **cópialo con un nombre que contenga `parlevel-warehouse`**,
  por ejemplo `parlevel-warehouse OC 3062.pdf`.
- **Facturas sintéticas:** cualquier PDF pequeño sirve; lo que importa es el nombre (el contenido se ignora):
  - `factura-p3062-recibido.pdf` → subtotal **30,128.00**, total 34,948.48 (lo que se recibió).
  - `factura-p3062.pdf` → subtotal **30,875.50**, total 35,815.58 (facturan todo lo pedido).
  - Para que los bytes de cada archivo sean distintos (si no, el segundo cuenta como duplicado), agrégales texto
    distinto, por ejemplo `echo "%PDF-1.7 a" > factura-p3062.pdf` y `echo "%PDF-1.7 b" > factura-p3062-recibido.pdf`.

## Recorrido AC-019-18 (un usuario por rol)

### 1. Compras crea la orden

1. Entra como **Compras** → «Órdenes» → «Nueva orden» → subir `parlevel-warehouse OC 3062.pdf`.
2. El borrador trae folio **P3062**, 9 partidas y subtotal 30,875.50. Avisa que el proveedor
   «Refrescos del Norte» no está registrado: usa «Registrar proveedor» (RFC de prueba `RDN010101AB1`, 30 días de
   crédito, MXN).
3. Captura el **total con impuestos 35,815.58** (el PDF solo trae subtotal) y guarda.
4. Abre la orden (clic en su fila): `/ordenes/:id` muestra la barra en **«Por recibir»** y el botón «Editar»
   (Compras sí puede editar; quien no puede ve «Esperando a Almacén»).

### 2. Almacén recibe con diferencias

1. Entra como **Almacén** → «Recepciones» → «Recibir» en P3062 (Almacén no ve precios).
2. En «Refresco cola 600 ml» baja el recibido de 75 a **70** con el botón −. La fila dice «Faltan 5», «Notas» pasa a
   obligatorio («Explica qué faltó») y el botón dice **«Confirmar con diferencias»**.
3. Sin notas el botón no envía; escribe «Faltaron 5 cajas de refresco cola 600 ml» y confirma.
4. En «Recepciones → Con diferencias» aparece P3062 con el estado «Recibida con diferencias».

### 3. Compras ve el avance

1. Como **Compras**, `/ordenes/:id` de P3062: etapa **«Lista para factura»** con «Esperando a Cuentas por pagar»;
   la partida de cola muestra «Pedido 75 · Recibido 70 caja · Faltan 5» y las notas.
2. En «Mi trabajo» aparece el bloque «Recibidas con diferencias» con P3062.
3. Compras **no** puede abrir expedientes (el menú no los ofrece y la API responde 403).

### 4. Cuentas por pagar carga la factura

1. Entra como **Cuentas por pagar** → «Mi trabajo»: el primer bloque es **«Órdenes listas para factura»** con P3062
   y «Cargar factura».
2. Clic en la fila → `/ordenes/:id` → **«Cargar factura»**: la subida trae la orden P3062 ya elegida y bloqueada.
3. Sube `factura-p3062.pdf` (facturan todo lo pedido): el expediente queda **en revisión** con la razón
   «El subtotal de la factura ($30,875.50) no coincide con lo que recibió Almacén ($30,128.00).». El cuadro
   Pedido / Recibido / Facturado marca «No coincide con lo recibido» en el subtotal facturado y muestra las notas.
4. Descarta ese expediente (motivo: «Se pide nota de crédito»). La orden vuelve a «Lista para factura».
5. Sube `factura-p3062-recibido.pdf` (subtotal 30,128.00): queda **«Por confirmar»** sin razones.
6. Confirma → la orden pasa a **«Por programar»** (vence a 30 días de la recepción de la factura).
7. Programa el pago → **«Pago programado»**.
8. Registra el pago por **34,948.48** con referencia `TRANSF-VERIF-0001` (la fecha no puede ser futura) →
   **«Pagada»**, con todos los pasos cumplidos.

En cada paso, `/ordenes/:id` avanza una etapa; Compras ve el avance con fechas y «Ver factura» no aparece (no tiene
`payables:read`).

## Revisión móvil AC-018-15 (375 px)

En Chrome: DevTools → modo dispositivo → ancho 375. Como **Almacén**, «Recibir» en una orden por recibir y baja una
cantidad:

- El diálogo ocupa casi toda la pantalla (es la hoja a pantalla completa del tema, con un margen superior de ~50 px
  como el resto de los diálogos).
- Fecha y notas arriba; las filas se desplazan.
- − y + miden **48 × 48 px**.
- La barra fija de abajo lleva el contador «N de M completas» y los botones «Cancelar» y «Confirmar con
  diferencias» sin cortarse.

## Cómo se verificó (2026-11-15)

Con los usuarios de arriba, la API en `AI_PROVIDER=fake` y el PDF real copiado como `parlevel-warehouse OC 3062.pdf`:

- Los pasos 1 a 4 se ejecutaron contra la API real (HTTP con una sesión por rol) y devolvieron lo esperado: borrador
  P3062 con 9 partidas y subtotal 30,875.50; recepción con 70 de 75 → `received_with_differences`; subtotal recibido
  **30,128.00**; `RECEIVED_AMOUNT_MISMATCH` con la factura de 30,875.50; sin razones con la de 30,128.00; etapas
  `to_receive → to_invoice → in_review → to_schedule → scheduled → paid`; Compras con 403 en `/api/payables`; Almacén
  sin precios en `/api/receipts`.
- La web se revisó en el navegador a **375 px** (marco de 375 px de ancho): la recepción (− y + de 48 px, «Faltan 2»,
  notas obligatorias, botón y contador fijos abajo), el expediente con el cuadro y la razón en lenguaje llano, y
  `/ordenes/:id` con la barra de pasos.
- El recorrido por la interfaz con el teclado y el ratón (no por HTTP) queda para quien siga esta guía.

## Limpieza

La base local conserva lo creado (proveedor «Refrescos del Norte SA de CV», órdenes P3062 y P3063, expedientes).
`pnpm db:reset && pnpm db:seed` la deja como nueva.
