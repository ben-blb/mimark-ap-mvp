---
id: '017'
titulo: Roles estrictos por función y «Mi trabajo»
estado: hecha # borrador | lista | en-progreso | hecha
depende_de: ['009', '012', '013', '014']
requisitos: Usabilidad y seguridad (extensión; modifica 009, 012 y 013)
---

# 017 · Roles estrictos por función y «Mi trabajo»

## Objetivo

Hoy cualquier sesión ve proveedores y órdenes (con precios), Compras ve facturas y cartera, y al entrar nadie ve qué
le toca hacer. Esta spec deja a cada rol solo con las pantallas y los datos de su función, tanto en la web como en la
API, y cambia la página de inicio por una bandeja «Mi trabajo» con los pendientes de quien entra.

Es la primera de tres specs del proceso OC → recepción → factura → pago (017 roles, 018 recepción por partida, 019
vista de la OC y conciliación contra lo recibido).

## Alcance

**Incluye:** permisos nuevos de lectura (`suppliers:read`, `orders:read`) y de bandeja (`inbox:read`); matriz de
roles nueva; vista de recepciones sin precios para Almacén (`GET /api/receipts`, pantalla `/recepciones`); página
«Mi trabajo» en `/`; el tablero pasa a `/tablero`; «Expedientes» se llama «Facturas y pagos» en la navegación; barra
inferior del teléfono con «Más» cuando el rol tiene más de 5 secciones; pasos del tutorial acordes.

**No incluye:** cambiar cómo se confirma una recepción (sigue el checklist de 014 hasta la spec 018); que Compras vea
el avance de factura y pago de sus órdenes (spec 019); permisos configurables desde una pantalla; varios roles por
persona; cambiar la URL `/expedientes`; dependencias nuevas.

## Roles y permisos (reemplaza la tabla de 013)

| Permiso nuevo    | Qué permite                                 |
| ---------------- | ------------------------------------------- |
| `suppliers:read` | Ver proveedores                             |
| `orders:read`    | Ver órdenes de compra con precios y totales |
| `inbox:read`     | Ver «Mi trabajo»                            |

| Rol          | Permisos                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `purchasing` | `inbox:read`, `suppliers:read`, `suppliers:write`, `orders:read`, `orders:write`, `assistant:use`                                   |
| `warehouse`  | `orders:receive`                                                                                                                    |
| `payables`   | `inbox:read`, `suppliers:read`, `orders:read`, `payables:read`, `payables:write`, `payables:pay`, `dashboard:read`, `assistant:use` |
| `manager`    | `suppliers:read`, `orders:read`, `payables:read`, `payables:pay`, `dashboard:read`, `assistant:use`                                 |
| `admin`      | todos                                                                                                                               |

Cambios frente a 013: `purchasing` pierde `payables:read` y `dashboard:read`; `warehouse` pierde `assistant:use` y la
lectura abierta de proveedores y órdenes; las lecturas de proveedores y órdenes dejan de estar abiertas a cualquier
sesión.

## Criterios de aceptación

### API

- **AC-017-01** · (modifica AC-013-13) Dada la matriz nueva, cuando cada rol llama a cada ruta protegida, entonces
  recibe la respuesta normal si tiene el permiso y 403 `FORBIDDEN` si no, sin escribir en la base. `GET
/api/suppliers` y `GET /api/suppliers/:id` exigen `suppliers:read`; `GET /api/purchase-orders` y `GET
/api/purchase-orders/:id` exigen `orders:read`.
- **AC-017-02** · (modifica AC-013-14) Dado un `warehouse`, cuando llama a `GET /api/suppliers`, `GET
/api/purchase-orders`, `GET /api/payables`, `GET /api/dashboard` o `POST /api/assistant/turn`, entonces recibe 403
  `FORBIDDEN`; `GET /api/receipts` y `POST /api/purchase-orders/:id/receipt` sí le funcionan.
- **AC-017-03** · Dado un `purchasing`, cuando llama a `GET /api/payables`, `GET /api/payables/:id` o `GET
/api/dashboard`, entonces recibe 403 `FORBIDDEN`; crear y editar proveedores y órdenes le sigue funcionando.
- **AC-017-04** · `GET /api/receipts` (permiso `orders:receive`) lista las órdenes abiertas (no canceladas) con
  `id`, `number`, `supplierName`, `issuedOn`, `receiptStatus`, `receivedOn`, `receivedBy`, `receiptNotes` y `lines`
  con `id`, `position`, `sku`, `description`, `quantity` y `unit`. Filtra por `status` (`pending` por omisión,
  `received`) y `search` (folio o proveedor). `GET /api/receipts/:id` devuelve una; una inexistente o cancelada
  responde 404 `NOT_FOUND`.
- **AC-017-05** · La respuesta de `/api/receipts` no contiene precios ni importes: ninguna clave `unitPrice`,
  `amount`, `total`, `taxes`, `currency` ni `creditDays`, en ningún nivel.
- **AC-017-06** · (modifica AC-013-16) Las herramientas `listSuppliers` y `listPurchaseOrders` del asistente exigen
  `suppliers:read` y `orders:read`; a un rol sin el permiso no se le ofrecen.

### Web

- **AC-017-07** · La navegación muestra solo las secciones que el rol puede abrir, en este orden: Mi trabajo
  (`inbox:read`), Recepciones (`orders:receive`), Órdenes de compra (`orders:read`), Facturas y pagos
  (`payables:read`), Proveedores (`suppliers:read`), Tablero (`dashboard:read`), Asistente (`assistant:use`),
  Usuarios (`users:manage`). Un `warehouse` ve solo Recepciones; un `purchasing` ve Mi trabajo, Órdenes de compra,
  Proveedores y Asistente.
- **AC-017-08** · Abrir por URL una ruta sin permiso (`/proveedores`, `/ordenes`, `/expedientes`, `/tablero`,
  `/recepciones`, `/asistente`, `/usuarios`) muestra «Tu rol no tiene acceso a esta página.» y no llama a la API de
  esa pantalla.
- **AC-017-09** · La ruta `/` lleva a cada quien a su inicio: con `inbox:read` muestra «Mi trabajo»; sin él, con
  `orders:receive` redirige a `/recepciones`; sin ninguno, con `dashboard:read` redirige a `/tablero`. El tablero se
  sirve en `/tablero`.
- **AC-017-10** · «Mi trabajo» muestra un bloque por tipo de pendiente según los permisos, cada uno con su cuenta,
  hasta 5 filas y un enlace «Ver todas» a la lista ya filtrada:
  - con `orders:write`: «Órdenes por recibir» (órdenes abiertas con recepción `pending`);
  - con `payables:write`: «Facturas por revisar» (`requires_review`), «Por confirmar» (`pending_confirmation`),
    «Por programar» (`confirmed`) y «Pagos programados» (`scheduled`, con su fecha de pago; las vencidas primero).
- **AC-017-11** · Un bloque sin pendientes muestra «Nada pendiente» en una línea (no desaparece); si todos están
  vacíos, la página dice «Estás al día».
- **AC-017-12** · `/recepciones` lista las órdenes por recibir (folio, proveedor, fecha y número de partidas), con
  pestañas «Por recibir» y «Recibidas» y búsqueda; no muestra precios ni totales. «Recibir» abre el checklist de
  014, alimentado por `/api/receipts`.
- **AC-017-13** · `/ordenes` ya no ofrece «Confirmar recepción»: la recepción se hace solo desde `/recepciones`.
- **AC-017-14** · (modifica AC-009-02) Abajo de `md`, si el rol tiene más de 5 secciones la barra inferior muestra
  las 4 primeras y «Más», que abre un menú con el resto; con 5 o menos se muestran todas.
- **AC-017-15** · (modifica AC-012-07) El recorrido explica, en el orden de la navegación, solo las secciones que el
  rol ve; incluye pasos para «Mi trabajo» y «Recepciones» y llama «Facturas y pagos» a los expedientes.
- **AC-017-16** [manual] · Con un usuario por rol se revisa a 375 y 1440 px que cada quien ve solo su menú y su
  inicio. Cómo verificarlo: `pnpm dev`, crear los cinco usuarios desde `/usuarios`, entrar con cada uno y comparar
  con la tabla de AC-017-07.

## Diseño

### Datos

Sin cambios.

### Contratos

- `packages/contracts/src/permissions.ts`: `suppliers:read`, `orders:read`, `inbox:read` y la matriz nueva.
- `packages/contracts/src/assistant.ts`: `TOOL_PERMISSION.listSuppliers = 'suppliers:read'`,
  `listPurchaseOrders = 'orders:read'` (el tipo deja de admitir `null`).
- `packages/contracts/src/receipts.ts`: `ReceiptLineDto`, `ReceiptOrderDto`, `ReceiptOrderList`,
  `ReceiptListQuery`. Esquemas propios (no `PurchaseOrderDto.omit`) para que un campo nuevo de la OC no se filtre.

### API

| Método y ruta           | Entrada              | Salida             | Errores  |
| ----------------------- | -------------------- | ------------------ | -------- |
| `GET /api/receipts`     | `status?`, `search?` | `ReceiptOrderList` | 403      |
| `GET /api/receipts/:id` | —                    | `ReceiptOrderDto`  | 403, 404 |

Viven en el módulo `purchase-orders` (`receipts.controller.ts` → `PurchaseOrdersService` → mismo repositorio). El
repositorio usa un `select` sin columnas de precio.

### Reglas

Sin reglas nuevas: la autorización es `can(role, permission)`.

### UI

- `app/nav-items.tsx`: orden y permisos de AC-017-07; `app/router.tsx`: `RequirePermission` en todas las rutas,
  `/tablero` y `/recepciones` nuevas; `app/HomeRedirect.tsx` según AC-017-09.
- `features/home/MyWorkPage.tsx` y `home.api.ts`: reusa los listados existentes (`/purchase-orders?receipt=pending`,
  `/payables?status=…`), `DataTable`, `SummaryStrip` y `EmptyState`. Sin endpoint nuevo.
- `features/receipts/ReceiptsPage.tsx` y `receipts.api.ts`; `ReceiptDialog` se muda aquí.
- `app/AppNav.tsx`: «Más» en la barra inferior. `lib/labels.ts` y `features/tour/tour.steps.ts`: textos.

### Auditoría

Sin eventos nuevos (solo lecturas).

## Tareas

- [x] 1. Contratos: permisos, matriz, `TOOL_PERMISSION` y `receipts.ts`, con pruebas.
- [x] 2. API: `@Requires` en las lecturas de proveedores y órdenes; ampliar `permissions.int.test.ts` (AC-017-01,
      02, 03, 06).
- [x] 3. API: `GET /api/receipts` y `/:id` con pruebas de integración (AC-017-04, 05).
- [x] 4. Web: navegación, rutas, `HomeRedirect` y `/tablero` (AC-017-07, 08, 09).
- [x] 5. Web: `/recepciones` y retiro de «Confirmar recepción» en `/ordenes` (AC-017-12, 13).
- [x] 6. Web: «Mi trabajo» (AC-017-10, 11).
- [x] 7. Web: «Más» en la barra inferior y pasos del tutorial (AC-017-14, 15).
- [x] 8. `pnpm check`, verificación manual AC-017-16, actualizar ADR-15 y el mapa de `specs/README.md`; `hecha`.

## Fuera de alcance y decisiones

- **Almacén pierde el asistente.** Su función cabe en una pantalla y las herramientas de consulta del asistente
  enseñan precios. Si se quiere de vuelta, hace falta una herramienta de recepciones sin precios (spec aparte).
- **Compras deja de ver facturas y tablero.** El avance de sus órdenes (facturada, programada, pagada) llega en la
  spec 019 dentro de la propia OC, sin abrirle los expedientes.
- **Gerencia no tiene «Mi trabajo».** Su inicio es el tablero.
- El cambio de matriz rige en el siguiente inicio de sesión de cada persona (ADR-15, sin cambios).

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-14 · La spec estaba en `borrador`; la persona dijo que ya estaba aprobada y se pasó a `en-progreso`.
- 2026-11-15 · Con Postgres local (`pnpm db:up`), `pnpm check` completo en verde (162 pruebas de integración).
- 2026-11-15 · «Pagos programados … con su fecha de pago»: se sumó `scheduledPayOn` a `PayableSummaryDto` (contrato y
  `payables.dto.ts`) para poder mostrarla y ordenar por ella.
- 2026-11-15 · `POST /api/purchase-orders/:id/receipt` ahora responde `ReceiptOrderDto` (sin precios) para no filtrarlos a
  Almacén; la web solo lee el `id`.
- 2026-11-14 · «Ver todas» de órdenes usa `/ordenes?view=openPending` (vista inicial leída de la URL).
- 2026-11-14 · En el teléfono, los pasos del tutorial de secciones que quedan dentro de «Más» no se resaltan (el
  elemento no está montado); el paso se muestra igual, sin resaltado.
- 2026-11-15 · Verificación manual de AC-017-16: `pnpm db:up`, API y web en local contra la base Docker `mimark` con
  cinco usuarios sembrados (uno por rol). Con el navegador se entró con cada uno y se comparó contra AC-017-07:
  almacén (1440 y 375 px) solo Recepciones y aterriza en `/recepciones`, sin precios; compras (375) Mi trabajo,
  Órdenes, Proveedores y Asistente, sin «Más», y `/expedientes` dice «Tu rol no tiene acceso a esta página.»;
  cuentas por pagar (375) 4 secciones y «Más» con Tablero y Asistente; gerencia (375) 5 secciones y aterriza en
  `/tablero`; administración (1440) las 8 secciones con «Mi trabajo» de inicio. Los pasos del tutorial coinciden con
  las secciones de cada rol (6, 7 y 9 pasos).
