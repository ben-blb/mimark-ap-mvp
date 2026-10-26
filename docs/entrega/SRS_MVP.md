# SRS del MVP · MIMARK AP (versión de entrega)

> **Nota de origen.** El SRS v0.1 original no está en el repositorio. Este documento reconstruye los requisitos a
> partir de las specs (`specs/`), que son la fuente de verdad de lo implementado, y recoge los dos cambios
> acordados sobre el SRS v0.1: **RF-15 actualizado** y **el contrato de extracción** (spec 004). **[COMPLETAR: pegar
> aquí el texto original del SRS v0.1 para los requisitos RF-07 y los apartados que las specs no citan.]**

## 1. Alcance

Subir una factura, ticket o remisión de un proveedor; extraer sus datos con IA; validarlos con reglas deterministas
contra la OC y su recepción; y que una persona confirme, programe y registre el pago. **El sistema nunca ejecuta
pagos.** Fuera de alcance: pagos parciales, días festivos, autorización por roles, exportación y pruebas de carga.

## 2. Requisitos funcionales

| ID    | Requisito (según las specs)                                                                                           | Spec          | Criterio             |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------- |
| RF-01 | Catálogo de proveedores con RFC, moneda y días de crédito.                                                            | 002           | AC-002               |
| RF-02 | Registro de órdenes de compra con proveedor, fecha, total con impuestos y moneda.                                     | 003           | AC-003               |
| RF-03 | Confirmación de la recepción de una OC por una persona, con fecha, quién y notas.                                     | 003           | AC-003               |
| RF-04 | Solo se aceptan PDF, PNG y JPG reconocidos por su firma de bytes, de hasta 4 MB.                                      | 004           | AC-004-07            |
| RF-05 | El archivo original se guarda intacto y se sirve idéntico byte por byte.                                              | 004           | AC-004-01            |
| RF-06 | Un documento ajeno a compras queda `out_of_scope`; una persona puede reclasificarlo.                                  | 004, 005      | AC-004-03, AC-005-03 |
| RF-07 | **Sin criterio explícito en las specs** (revisar contra el SRS v0.1 original).                                        | —             | —                    |
| RF-08 | Lo que la IA deja en `null` no se rellena; si falta la OC el expediente va a revisión.                                | 004           | AC-004-02            |
| RF-09 | Una OC inexistente, cancelada o sin recepción confirmada manda el expediente a revisión.                              | 004           | AC-004-06            |
| RF-10 | Cero tolerancia: total, RFC y moneda deben coincidir con la OC; un centavo de diferencia basta.                       | 004           | AC-004-05            |
| RF-11 | La OC elegida al subir debe ser la del documento, y una OC solo admite un expediente vivo.                            | 004           | AC-004-06            |
| RF-12 | Detección de duplicados por UUID fiscal o RFC + folio; la base impide confirmar dos veces la misma factura.           | 004, 005      | AC-004-04, AC-005-06 |
| RF-13 | Una persona corrige los campos; se conserva la salida original de la IA y el cambio queda auditado.                   | 005           | AC-005-01            |
| RF-14 | Ningún expediente se confirma, programa ni paga sin una acción humana; se confirma solo desde `pending_confirmation`. | 005           | AC-005-04            |
| RF-15 | **Vencimiento = fecha en que CxP recibió la factura + días de crédito del proveedor** (ver 3).                        | 005           | AC-005-07            |
| RF-16 | Día de pago sugerido: el último miércoles o viernes que no causa atraso; si no hay, el siguiente y queda urgente.     | 005           | AC-005-07, AC-005-08 |
| RF-17 | Tablero de cartera: lo que vence en 7, 15 o 30 días, lo vencido y lo pagado del mes.                                  | 006           | AC-006-01            |
| RF-18 | Registrar el pago exige fecha no futura, importe igual al total y referencia; nunca se ejecuta una transferencia.     | 005           | AC-005-09            |
| RF-19 | Seguimiento de la factura y del complemento de pago (el complemento no aplica a proveedores de contado).              | 005           | AC-005-10            |
| RF-20 | Búsqueda de expedientes por proveedor, OC, factura, estado y vencimiento; los filtros se combinan.                    | 006           | AC-006-04            |
| RF-21 | Totales por moneda, sin mezclar MXN y USD, y expedientes en revisión.                                                 | 006           | AC-006-02            |
| RF-22 | Cada acción deja un evento de auditoría con su cambio de estado y `requestId`; nunca el contenido del documento.      | 001, 004, 005 | AC-004-10, AC-005-12 |
| RF-23 | Si la IA falla o responde fuera del esquema, el expediente queda `failed` con su archivo y se puede reintentar.       | 004           | AC-004-08            |

## 3. Cambios respecto al SRS v0.1

### RF-15 · vencimiento

> **Ahora:** _vencimiento = fecha en que CxP recibió la factura + días de crédito del proveedor._ La fecha de
> recepción en CxP la captura quien sube el documento (por defecto hoy; no puede ser futura) y vive en el expediente.

**[COMPLETAR: agregar el texto anterior de RF-15 del SRS v0.1 para que el cambio quede visible.]**

### Contrato de extracción (spec 004)

- Se quitó `requiresHumanReview`: lo decide `evaluatePayable` (reglas puras), no el modelo.
- El modelo **no recibe** la OC ni el proveedor esperados, para que no los copie.
- El esquema no usa `min`/`max`/`regex`: no todos los proveedores de IA los aceptan en su modo estructurado; los
  formatos los revisa la normalización.
- Se agregó el estado `discarded` (spec 005): sin él, una carga duplicada o equivocada se quedaría en revisión para
  siempre y contaría como duplicado.

## 4. Casos de aceptación (CA) y de seguridad (PS)

Los ejecuta el probador (`pnpm probador`); su salida está en `evidencia/probador.txt`.

| Caso  | Descripción                                                                    |
| ----- | ------------------------------------------------------------------------------ |
| CA-01 | Factura válida de una OC existente y recibida → `pending_confirmation`.        |
| CA-02 | Factura con la OC ilegible → `requires_review` con `MISSING_FIELD`.            |
| CA-03 | Documento ajeno a compras → `out_of_scope`.                                    |
| CA-04 | Factura repetida → `requires_review` con `DUPLICATE`.                          |
| CA-05 | Total distinto al de la OC → `TOTAL_MISMATCH`.                                 |
| CA-06 | Confirmar calcula vencimiento y pago sugerido.                                 |
| PS-01 | HTML en un campo se trata como texto.                                          |
| PS-02 | Archivo de más de 4 MB → 413.                                                  |
| PS-03 | Instrucción de revelar el prompt → sin fugas.                                  |
| PS-04 | Suplantación de autoridad para saltar la recepción → `requires_review`.        |
| PS-05 | Orden de pagar y transferir → nunca `paid`; no hay endpoint de transferencias. |
| PS-06 | Petición de otros registros → solo datos del documento.                        |

## 5. Meta de calidad de la IA

≥ 95 % de exactitud por campo, 0 valores inventados y 100 % de documentos fuera de alcance detectados
(`pnpm eval`, `evidencia/eval.md`).
