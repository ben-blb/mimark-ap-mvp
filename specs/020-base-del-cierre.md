---
id: '020'
titulo: Base del cierre mensual (empresas, kioskos, cuentas, categorías y reglas)
estado: hecha # borrador | lista | en-progreso | hecha
depende_de: ['001', '013', '017']
requisitos: Mini SRS cierre mensual · RF-02, RF-10, RF-11 (modelo)
---

# 020 · Base del cierre mensual

## Objetivo

Hoy el reporte mensual de resultados se arma a mano en un Excel. Antes de cargar fuentes (021, 022), conciliar (023)
o reportar (024) hace falta el **catálogo** del que todo cuelga: qué empresa/plaza, qué kioskos, qué cuentas
bancarias, qué categorías de egreso y en qué renglón del Estado de resultados caen, y las reglas que clasifican
solas. Esta spec crea ese catálogo, editable por Administración sin tocar código, y los permisos de «Cierre» y
«Reportes».

## Alcance

**Incluye:** empresas/plazas; kioskos con su identificador en cada fuente (Parlevel, Cantaloupe); cuentas
bancarias (cheques, crédito, maestra); catálogo de categorías con su renglón de EDO RES; reglas de clasificación
(patrón → categoría, con prioridad); permisos `reports:read` y `reports:write`; semilla del catálogo desde la
estructura del EDO RES actual; menú «Cierre» con pantallas de catálogo.

**No incluye:** cargar archivos (021, 022); aplicar reglas a movimientos y cuadres (023); reportes (024); roles
nuevos; borrar catálogo (solo se desactiva, como en 013); prorrateo de gastos generales por kiosko.

## Criterios de aceptación

### Permisos

- **AC-020-01** · `admin` tiene `reports:read` y `reports:write`; `manager` solo `reports:read`; `purchasing`,
  `warehouse` y `payables` no tienen ninguno. _Modificado por la 024 (2026-11-19): `manager` tiene `reports:view`
  en lugar de `reports:read`._
- **AC-020-02** · Con `manager`, cualquier `POST`/`PATCH` del catálogo responde 403 `FORBIDDEN` y no escribe nada;
  sus `GET` responden 200. Sin sesión, 401. _Modificado por la 024: sus `GET` también responden 403._

### Empresas, kioskos y cuentas

- **AC-020-03** · `POST /api/closing/companies` con `{ name: "Quima Tlalnepantla" }` crea la empresa activa y
  escribe `company.created` en la misma transacción. Un nombre repetido (sin distinguir mayúsculas ni acentos)
  responde 409 `CONFLICT`.
- **AC-020-04** · `POST /api/closing/kiosks` con `companyId`, `name`, `parlevelAsset` y `cantaloupeDeviceId`
  opcionales crea el kiosko. `parlevelAsset` y `cantaloupeDeviceId` son únicos entre kioskos; repetirlos responde
  409 `CONFLICT` con el campo en `fieldErrors`.
- **AC-020-05** · `POST /api/closing/accounts` crea una cuenta con `companyId`, `name`, `type`
  (`checking | credit | master`) y `last4` opcional (cuatro dígitos; cualquier otro formato responde 400 `VALIDATION`).
  Nunca se guarda el número completo de cuenta.
- **AC-020-06** · `PATCH` de empresa, kiosko o cuenta con `active=false` los desactiva; siguen en los listados con
  `?includeInactive=true` y desaparecen del resto. No existe `DELETE`.

### Categorías y reglas

- **AC-020-07** · `GET /api/closing/categories` devuelve el catálogo sembrado (ver «Semilla») ordenado por
  `edoResLine` y `sortOrder`; cada categoría trae `code`, `name`, `edoResLine` y `kind` (`income | cost | expense`).
- **AC-020-08** · `POST /api/closing/categories` crea una categoría con `code` único (mayúsculas y guiones bajos)
  y un `edoResLine` del conjunto permitido; un `edoResLine` desconocido responde 400 `VALIDATION`.
- **AC-020-09** · `POST /api/closing/rules` con `{ pattern: "ADT SECURITY", categoryId, priority: 10 }` crea la
  regla; un `pattern` vacío o de menos de 3 caracteres responde 400 `VALIDATION`.
- **AC-020-10** · `matchRule(concept, rules)`: gana la regla activa de mayor `priority` cuyo patrón aparece en el
  concepto sin distinguir mayúsculas ni acentos; con igual prioridad gana la de patrón más largo; sin coincidencia
  devuelve `null`. Ver tabla en «Reglas».
- **AC-020-11** · `POST /api/closing/rules/test` con `{ concept }` devuelve la categoría y la regla que ganan (o
  `null`) sin escribir nada: sirve para probar antes de guardar.

### Web

- **AC-020-12** · `/cierre/catalogo` (permiso `reports:read`) tiene pestañas Empresas, Kioskos, Cuentas,
  Categorías y Reglas. Con `reports:write` ofrece «Agregar» y editar; sin él solo lista (sin botones de escritura).
- **AC-020-13** · El menú muestra «Cierre» solo a quien tiene `reports:read`; para `manager` es la única entrada
  nueva y no ve acciones de escritura. _Modificado por la 024: `manager` ve «Reportes» y no «Cierre»._ El tema y el responsive siguen 009/010.
- **AC-020-14** [manual] · Alta de un kiosko con sus IDs. Cómo verificarlo: `pnpm dev`; como `admin` crear la
  empresa, tres kioskos con IDs de Parlevel y Cantaloupe tomados de un export real (a mano, sin subir el archivo) y
  una regla «ADT SECURITY → ADT»; probarla con un concepto de estado de cuenta real; entrar como `manager` y
  comprobar que solo lee.

## Diseño

### Datos

Migración `020-base-del-cierre`. Cada tabla se escribe solo desde `closing.repository.ts`.

| Modelo               | Campos clave                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `Company`            | `id`, `name` (único por `nameKey` normalizado), `active`                                           |
| `Kiosk`              | `companyId`, `name`, `parlevelAsset?` (único), `cantaloupeDeviceId?` (único), `active`             |
| `BankAccount`        | `companyId`, `name`, `type` (`checking`/`credit`/`master`), `last4?`, `active`                     |
| `Category`           | `code` (único), `name`, `edoResLine` (texto del conjunto permitido), `kind`, `sortOrder`, `active` |
| `ClassificationRule` | `pattern`, `patternKey` (normalizado), `categoryId`, `priority` (int, por omisión 0), `active`     |

Dinero y movimientos llegan en la 021; aquí no hay importes.

### Semilla

`prisma/seed` agrega las categorías según los renglones de la pestaña EDO RES del archivo de ejemplo: Ventas,
Venta directa, Otros ingresos, Robos, Mermas, Costo de lo vendido, Rentas, Nóminas, Gasolina, Fee Cantaloupe, Fee
Nayax, Telemetría, Fee software, Teléfono/internet/luz/agua, Seguridad y vigilancia, Papelería y MKT, Fumigación,
Tarjetas de crédito, Créditos, Comisión bancaria, Intereses, Impuestos, Inversiones y No deducibles. La lista
exacta y su orden son **decisión abierta** (ver abajo) y se ajustan con la contadora; el catálogo es dato, no
código.

### Contratos

`packages/contracts/src/closing.ts`: `CompanyDto`, `KioskDto`, `BankAccountDto`, `CategoryDto`, `RuleDto` y sus
`Create*`/`Update*`; `EDO_RES_LINES` (conjunto permitido). `permissions.ts`: `reports:read`, `reports:write`.
`errors.ts`: reutiliza `CONFLICT`, `VALIDATION`, `FORBIDDEN`.

### API

| Método y ruta                                            | Permiso         | Entrada            | Salida                 | Errores       |
| -------------------------------------------------------- | --------------- | ------------------ | ---------------------- | ------------- |
| `GET /api/closing/{companies,kiosks,accounts,rules}`     | `reports:read`  | `includeInactive?` | lista                  | 401, 403      |
| `GET /api/closing/categories`                            | `reports:read`  | —                  | lista                  | 401, 403      |
| `POST /api/closing/{companies,kiosks,accounts,...}`      | `reports:write` | cuerpo `Create*`   | recurso                | 403, 409, 400 |
| `PATCH /api/closing/{companies,kiosks,accounts,...}/:id` | `reports:write` | campos a cambiar   | recurso                | 403, 404, 409 |
| `POST /api/closing/rules/test`                           | `reports:read`  | `{ concept }`      | `{ rule?, category? }` | 403, 400      |

### Reglas

`closing.rules.ts` (puro): `normalizeKey(text)` (minúsculas, sin acentos, espacios colapsados) y
`matchRule(concept, rules)`.

| Concepto                           | Reglas activas (patrón → prioridad) | Resultado                  |
| ---------------------------------- | ----------------------------------- | -------------------------- |
| `ADT SECURITY CR MU RFC:XXX 7455…` | `ADT SECURITY`→0                    | regla ADT                  |
| `adt  security`                    | `ADT SECURITY`→0                    | regla ADT (normaliza)      |
| `PAGO TELCEL PLAZA SATELITE`       | `TELCEL`→0, `TELCEL PLAZA`→0        | `TELCEL PLAZA` (más larga) |
| `PAGO TELCEL PLAZA SATELITE`       | `TELCEL`→5, `TELCEL PLAZA`→0        | `TELCEL` (prioridad)       |
| `COMPRA FERRETERIA`                | `ADT SECURITY`→0                    | `null`                     |

### UI

`features/closing/` copiando `features/suppliers`: `closing.api.ts`, `CatalogPage.tsx` con pestañas, diálogos y
formularios con `useZodForm`. Ruta `/cierre/catalogo` con `RequirePermission`; entrada en `nav-items.tsx`.

### Auditoría

`company.created|updated|deactivated`, `kiosk.…`, `account.…`, `category.…`, `rule.…` con `diffFields`.

## Tareas

- [x] 1. Contratos y permisos (`closing.ts`, `permissions.ts`) con pruebas (AC-020-01).
- [x] 2. `closing.rules.ts`: `normalizeKey` y `matchRule` con su tabla (AC-020-10).
- [x] 3. Esquema Prisma, migración `020-base-del-cierre` y semilla de categorías.
- [x] 4. Módulo `closing`: repositorio, service, controller y permisos; integración (AC-020-02 a 09, 11).
- [x] 5. Web: `CatalogPage`, ruta y menú (AC-020-12, 13).
- [x] 6. `pnpm check`, recorrido manual AC-020-14, fila en `specs/README.md`; `hecha`.

## Fuera de alcance y decisiones

- **Permisos nuevos, no rol nuevo.** «Gerencia» es `manager` y «admin» ya existe; se añaden `reports:read/write`
  (ADR-15: matriz fija en código). `payables` no recibe acceso: no es su función.
- **Catálogo y renglón de EDO RES:** decisión abierta del SRS (§9.3). Se siembra desde el Excel de ejemplo y se
  corrige con la contadora antes de aprobar.
- **Identificar el kiosko por fuente:** decisión abierta (§9.4). Se propone `Asset` de Parlevel y `Device ID` de
  Cantaloupe, columnas vistas en el export «Sales by POS». Si una fuente no trae ninguno, la 021 pedirá mapeo
  manual.
- **Quién mantiene las reglas:** `admin` (§9.6).
- **Sin datos reales en el repositorio:** los ejemplos y la semilla usan nombres sintéticos.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-18 · Aprobada por el usuario; estado `en-progreso`. El catálogo de errores no tiene `DUPLICATE` ni
  `VALIDATION_FAILED` y la validación responde 400, no 422: se usan `CONFLICT` (409) y `VALIDATION` (400) y se
  corrigió el texto de los criterios.
- 2026-11-18 · «Ordenado por `edoResLine` y `sortOrder`» (AC-020-07) se entiende como la posición del renglón en
  `EDO_RES_LINES` (orden del Estado de resultados), no alfabético, y luego `sortOrder`.
- 2026-11-18 · Tareas 1–5 hechas. `pnpm check:fast` y `pnpm test:int` (197) en verde. `pnpm check` solo falla por el
  lint de `infra/probador/src/paquete-manual.ts` (anterior a esta spec). Falta AC-020-14 [manual] (necesita IDs de un
  export real): quedó en `docs/pendientes-de-verificar.md`; la spec sigue `en-progreso` hasta hacerlo.
- 2026-11-18 · Campos opcionales de formulario (`parlevelAsset`, `cantaloupeDeviceId`, `last4`) aceptan texto vacío como
  «sin valor». Por eso en una edición no se puede borrar un valor ya guardado (vaciar el campo = sin cambio).
- 2026-11-18 · `POST /api/closing/rules/test` responde 200 (es una consulta, no crea nada).
- 2026-11-18 · AC-020-14 verificado a mano (`pnpm dev`, Chrome, IA y API locales): como `admin` (usuario de prueba
  `verif-admin`) se creó una empresa, tres kioskos con Asset y Device ID tomados de una tabla real de Parlevel/Cantaloupe
  (transcritos de una imagen; no se guardan en el repo) y la regla «ADT SECURITY → Seguridad y vigilancia»; los kioskos
  salieron en la lista con sus IDs. «Probar» con `adt  security CR MU RFC:XXX 7455` (concepto con el formato de la
  spec, no de un estado de cuenta real) devolvió «Gana la regla ADT SECURITY → Seguridad y vigilancia». Como `manager`
  (`verif-gerencia`): «Cierre» es su única entrada nueva, ve las listas sin «Agregar» ni «Editar» y un `POST` directo
  responde 403 `FORBIDDEN`. Después se borraron esos datos de la base local.
- 2026-11-18 · Los usuarios `verif-admin` y `verif-gerencia` se agregaron a `db:verification-users` y a
  `docs/verificacion-manual.md`. Se dividió `infra/probador/src/paquete-manual.ts` (límite de 300 líneas del lint).
- 2026-11-18 · Hallazgo para la 021: el Asset del export parece repetirse entre filas; ver `docs/pendientes-de-verificar.md`.
- 2026-11-18 · Revisión independiente: desactivar ahora se audita como `*.deactivated` (antes `*.updated`), como pide «Auditoría».
