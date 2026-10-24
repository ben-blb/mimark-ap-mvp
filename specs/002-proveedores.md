---
id: '002'
titulo: Proveedores
estado: hecha
depende_de: ['001']
requisitos: RF-01
---

# 002 · Proveedores

## Objetivo

Registrar proveedores con su RFC, días de crédito y moneda, para asociarlos a órdenes de compra y calcular
vencimientos. Es el **módulo plantilla**: los demás copian su forma.

## Alcance

**Incluye:** alta, edición, activación/desactivación, búsqueda por nombre o RFC, auditoría de cambios, pantalla
`/proveedores` y datos sintéticos de semilla.

**No incluye:** borrado físico (se desactiva), importación masiva, integración con ParLevel.

## Criterios de aceptación

- **AC-002-01** · Dado un proveedor con nombre, RFC, días de crédito y moneda, cuando se registra, entonces
  responde 201, aparece en la lista y queda un evento `supplier.created`.
- **AC-002-02** · El RFC se normaliza (mayúsculas, sin espacios) y se valida (12 o 13 caracteres); uno inválido
  responde 400 `VALIDATION` con `fieldErrors.taxId`.
- **AC-002-03** · Un RFC ya registrado responde 409 `CONFLICT` con `fieldErrors.taxId`.
- **AC-002-04** · Al editar un proveedor queda un evento `supplier.updated` con solo los campos que cambiaron
  (`{ campo: { from, to } }`).
- **AC-002-05** · Un proveedor desactivado no aparece en la lista por defecto (activos), sí con `status=inactive` o
  `status=all`, y se puede consultar por id.
- **AC-002-06** · La búsqueda encuentra por nombre (sin distinguir mayúsculas) o por parte del RFC.
- **AC-002-07** · El formulario muestra el error de cada campo antes de enviar, envía los datos ya normalizados y
  muestra en su campo el error que devuelve la API (RFC repetido).
- **AC-002-08** · Los días de crédito son enteros de 0 a 365 (0 = contado); vacío, negativo, decimal o mayor a 365
  es inválido.

## Diseño

### Datos

`Supplier { id, name, taxId @unique, creditDays, currency, active, createdAt, updatedAt }` (migración base).

### Contratos

`contracts/suppliers.ts`: `SupplierDto`, `SupplierList`, `CreateSupplierInput`, `UpdateSupplierInput`,
`SupplierListQuery`. Primitivas en `contracts/common.ts` (`TaxId`, `Currency`, `intField`).

### API

| Método y ruta              | Entrada               | Salida            | Errores                          |
| -------------------------- | --------------------- | ----------------- | -------------------------------- |
| `GET /api/suppliers`       | `?search&status`      | `{ items }`       | —                                |
| `GET /api/suppliers/:id`   | —                     | `SupplierDto`     | 404 `NOT_FOUND`                  |
| `POST /api/suppliers`      | `CreateSupplierInput` | 201 `SupplierDto` | 400 `VALIDATION`, 409 `CONFLICT` |
| `PATCH /api/suppliers/:id` | `UpdateSupplierInput` | `SupplierDto`     | 400, 404, 409                    |

### Forma del módulo (plantilla)

```
modules/suppliers/
  suppliers.controller.ts   HTTP → valida con el esquema → un método del service
  suppliers.service.ts      casos de uso; transacción + auditoría; mapea a DTO
  suppliers.repository.ts   única puerta a la tabla; traduce la violación de único a CONFLICT
  suppliers.module.ts       exporta el repositorio para que otros módulos lean
  suppliers.int.test.ts     pruebas HTTP contra Postgres, nombradas con su AC
features/suppliers/
  suppliers.api.ts          query keys y hooks de TanStack Query
  SuppliersPage.tsx         lista, filtros, abre el diálogo
  SupplierDialog.tsx        conecta el formulario con la API
  SupplierForm.tsx          formulario puro con useZodForm (+ SupplierForm.test.tsx)
```

### Auditoría

`supplier.created` (`data.after`), `supplier.updated` (`data.changes`).

## Tareas

- [x] 1. Contratos y pruebas de RFC y días de crédito.
- [x] 2. Repositorio, service, controller y módulo.
- [x] 3. Pruebas de integración AC-002-01…06.
- [x] 4. Pantalla `/proveedores`, diálogo y formulario con prueba AC-002-07.
- [x] 5. Semilla con 5 proveedores sintéticos (`pnpm db:seed`).

## Fuera de alcance y decisiones

- La validación del RFC es de formato; no consulta al SAT.
- La semilla define los RFC que usan las specs 003, 004 y 007: `DAN010203AB1` (15 días), `BFM980512KL3` (30),
  `EDR150720QW9` (7), `CSM120304TR5` (contado), `ISG070809MN2` (20, USD).

## Bitácora

- 2026-10-23 · Implementada como parte del repositorio base.
