---
id: '001'
titulo: Acceso
estado: hecha
depende_de: []
requisitos: Acceso protegido, límites de uso, RF-22, RF-23
---

# 001 · Acceso

## Objetivo

Proteger la entrega con un código de acceso compartido, saber quién hace cada acción para la auditoría y
dar a todo el backend un formato único de errores y una forma de rastrear cada petición.

## Alcance

**Incluye:** entrada con código + nombre + rol, sesión de 8 h en cookie firmada, guard global, bloqueo por
intentos fallidos, formato de error único, `requestId` por petición, una línea de log por petición, tabla de
auditoría, `/api/health`, pantalla de entrada y redirección cuando no hay sesión.

**No incluye:** usuarios con contraseña, proveedor de identidad, permisos por rol (el rol solo se audita).

## Criterios de aceptación

- **AC-001-01** · Dado el código correcto, cuando alguien entra con nombre y rol, entonces recibe 200 con
  `{ actor, role, expiresAt }` y una cookie `mimark_session` HttpOnly, SameSite=Lax (Secure en producción) que
  vence en 8 horas; queda un evento `session.started`.
- **AC-001-02** · Dado un código incorrecto, cuando alguien intenta entrar, entonces recibe 401 `ACCESS_DENIED`,
  ninguna cookie, y queda un evento `session.failed` con su IP.
- **AC-001-03** · Dados 10 intentos fallidos desde una IP en 15 minutos, cuando esa IP vuelve a intentar (aun con
  el código correcto), entonces recibe 429 `RATE_LIMITED`; otras IP no se afectan.
- **AC-001-04** · Dada una ruta protegida, cuando llega sin cookie o con una cookie alterada, firmada con otro
  secreto o vencida, entonces responde 401 `UNAUTHENTICATED`.
- **AC-001-05** · `GET /api/health` es público y responde `{ status, db, version, environment }`.
- **AC-001-06** · Todo error, incluidos 404 y fallas inesperadas, responde `{ code, message, requestId }` sin stack
  ni detalles internos; `requestId` es igual a la cabecera `x-request-id` y aparece en la línea de log.
- **AC-001-07** · `DELETE /api/session` borra la cookie; la siguiente petición protegida responde 401.
- **AC-001-08** [manual] · En la web, sin sesión cualquier pantalla manda a `/login` y, al entrar, regresa a la
  pantalla pedida; un error muestra el mensaje y `Ref. <requestId>`. Cómo verificarlo: abrir `/proveedores` sin
  sesión, entrar con un código incorrecto y luego con el correcto.

## Diseño

### Datos

`AuditEvent` (migración `20261023000000_base`): `actor, role, requestId, entity, entityId, action, fromStatus,
toStatus, data(Json)` con índices por entidad, por acción+fecha y por `requestId`. Nunca se edita ni se borra.

### Contratos

`contracts/session.ts` (`Role`, `LoginInput`, `SessionDto`) y `contracts/errors.ts` (`ErrorCode`, `ErrorResponse`).

### API

| Método y ruta         | Entrada      | Salida                                     | Errores                                                   |
| --------------------- | ------------ | ------------------------------------------ | --------------------------------------------------------- |
| `POST /api/session`   | `LoginInput` | 200 `SessionDto` + cookie                  | 400 `VALIDATION`, 401 `ACCESS_DENIED`, 429 `RATE_LIMITED` |
| `GET /api/session`    | cookie       | 200 `SessionDto`                           | 401 `UNAUTHENTICATED`                                     |
| `DELETE /api/session` | —            | 204 y borra la cookie                      | —                                                         |
| `GET /api/health`     | —            | 200 `{ status, db, version, environment }` | —                                                         |

### Reglas

`session.rules.ts`: `hashAccessCode` / `verifyAccessCode` (scrypt), `signSession` / `readSession` (HMAC-SHA256,
`<payload>.<firma>` en base64url), `isLoginBlocked(fallas) = fallas >= 10`, vigencia de 8 h.

### Piezas transversales

- `common/request-context.ts`: `requestId` = `x-vercel-id` o UUID; cabecera `x-request-id`; una línea de log JSON
  por petición `{ requestId, method, route, status, ms, actor, code }`.
- `common/error.filter.ts` + `common/app-error.ts`: todo error sale como `ErrorResponse`.
- `common/validation.ts`: `@Body({ schema })`, `@Query({ schema })`, `@Param('id', { schema })` validan con Zod y
  devuelven `VALIDATION` con `fieldErrors`.
- `modules/session/session.guard.ts`: guard global; `@Public()` para rutas abiertas. `@Ctx()` da `{ actor, role,
requestId }` al service.

### UI

`/login` (código, nombre, rol). `RequireSession` envuelve todo lo demás. `ErrorAlert` muestra mensaje y referencia.

### Auditoría

`session.started`, `session.failed` (con `data.ip`).

## Tareas

- [x] 1. Contratos de sesión y errores.
- [x] 2. Tabla `AuditEvent` y repositorio de auditoría.
- [x] 3. Reglas de sesión con pruebas unitarias.
- [x] 4. Guard global, decoradores `@Public()`, `@Ctx()` y `@ReqInfo()`.
- [x] 5. Filtro de errores, validación y contexto de petición.
- [x] 6. Controller y service de sesión; `/api/health`.
- [x] 7. Pruebas de integración AC-001-01…07.
- [x] 8. Pantalla de entrada, `RequireSession` y `ErrorAlert`.

## Fuera de alcance y decisiones

- Detrás de la reescritura de Vercel todas las peticiones podrían llegar con la misma IP. En ese caso el bloqueo
  funciona como límite global (10 fallas en 15 min bloquean a todos). Es aceptable para la entrega; con un
  proveedor de identidad desaparece.
- El rol no restringe acciones en el MVP: una persona simula varios roles (SRS §4).

## Bitácora

- 2026-10-23 · Implementada como parte del repositorio base.
- 2026-10-23 · La migración `20261023000000_base` se escribió en el formato de Prisma sin el CLI (el entorno
  donde se creó el repo no podía descargar el motor de migraciones). Las pruebas la aplican desde cero y CI
  compara la base resultante con `schema.prisma` (`prisma migrate diff --exit-code`). Si `pnpm db:migrate`
  detecta diferencias la primera vez, acepta la migración que propone y anótalo aquí.
