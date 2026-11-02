---
id: '013'
titulo: Usuarios, contraseñas y roles
estado: borrador # borrador | lista | en-progreso | hecha
depende_de: ['001', '002', '003', '005', '008']
requisitos: Acceso, RF-22, RF-23 (extensión)
---

# 013 · Usuarios, contraseñas y roles

## Objetivo

Que cada persona entre con su correo y contraseña, que el rol lo asigne un administrador (no quien entra) y que
cada rol solo pueda hacer lo suyo. Un administrador gestiona los usuarios (alta, edición, baja, restablecer
contraseña).

## Alcance

**Incluye:** tabla de usuarios; entrada por correo + contraseña (reemplaza el código compartido, **modifica
AC-001-01, AC-001-02 y AC-001-03**); configuración inicial que crea al primer administrador; cambio de contraseña
propio y obligatorio tras un alta o restablecimiento; matriz de permisos por rol aplicada en la API (y reflejada en
la web); CRUD de usuarios solo para `admin`; auditoría de todo lo anterior.

**No incluye:** registro público; recuperar contraseña por correo (no hay envío de correos); verificación de
correo; doble factor; proveedor de identidad externo; permisos configurables por pantalla (la matriz es fija en
código); varios roles por usuario; revocar al instante una sesión ya emitida (ver decisiones); dependencias nuevas.

## Roles y permisos

Una persona tiene un solo rol. Las lecturas de proveedores y órdenes de compra están abiertas a cualquier sesión.

| Permiso           | Qué permite                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `suppliers:write` | Crear y editar proveedores                                          |
| `orders:write`    | Crear y editar órdenes de compra                                    |
| `orders:receive`  | Confirmar la recepción de una orden                                 |
| `payables:read`   | Ver facturas, su archivo e historial                                |
| `payables:write`  | Subir, reintentar, corregir campos y documentos, descartar facturas |
| `payables:pay`    | Confirmar una factura, programar y registrar el pago                |
| `dashboard:read`  | Ver la cartera                                                      |
| `assistant:use`   | Usar el asistente y guardar conversaciones propias                  |
| `users:manage`    | CRUD de usuarios                                                    |

| Rol          | Permisos                                                                              |
| ------------ | ------------------------------------------------------------------------------------- |
| `purchasing` | `suppliers:write`, `orders:write`, `payables:read`, `dashboard:read`, `assistant:use` |
| `warehouse`  | `orders:receive`, `assistant:use` (solo órdenes: no ve facturas, pagos ni cartera)    |
| `payables`   | `payables:read`, `payables:write`, `payables:pay`, `dashboard:read`, `assistant:use`  |
| `manager`    | `payables:read`, `payables:pay`, `dashboard:read`, `assistant:use`                    |
| `admin`      | todos                                                                                 |

## Criterios de aceptación

### Configuración inicial

- **AC-013-01** · Dado que no existe ningún usuario, cuando se consulta `GET /api/setup`, entonces responde
  `{ needsSetup: true }`; con al menos un usuario responde `{ needsSetup: false }`. Es público.
- **AC-013-02** · Dado que no hay usuarios, cuando se envía `POST /api/setup` con el código de configuración
  correcto, nombre, correo y contraseña válidos, entonces responde 200 con la sesión, crea un usuario `admin`
  activo con `mustChangePassword=false` y deja un evento `user.created` (con `data.setup=true`).
- **AC-013-03** · Dado un código de configuración incorrecto, cuando se envía `POST /api/setup`, entonces responde
  401 `ACCESS_DENIED`, no crea nada y cuenta como intento fallido (mismo límite por IP que AC-013-06).
- **AC-013-04** · Dado que ya existe un usuario, cuando se envía `POST /api/setup` (aun con el código correcto),
  entonces responde 409 `SETUP_DONE` y no crea nada. Dos peticiones simultáneas con datos válidos crean un solo
  administrador.

### Entrada y sesión (modifica AC-001-01, AC-001-02, AC-001-03)

- **AC-013-05** · Dado un usuario activo, cuando envía `POST /api/session` con su correo (sin distinguir
  mayúsculas) y su contraseña, entonces recibe 200 con `{ userId, actor, role, mustChangePassword, expiresAt }` y la
  cookie `mimark_session` HttpOnly, SameSite=Lax (Secure en producción) que vence en 8 horas; queda `session.started`.
  `actor` es el nombre del usuario y `role` el que tiene en la base de datos.
- **AC-013-06** · Dado un correo inexistente, una contraseña incorrecta o un usuario inactivo, cuando intenta entrar,
  entonces recibe 401 `ACCESS_DENIED` con el mismo mensaje en los tres casos, ninguna cookie, y queda
  `session.failed` con `data.ip` y `data.email`. Tardan lo mismo (se calcula el hash aunque el correo no exista).
- **AC-013-07** · Dados 10 intentos fallidos desde una IP, o 5 fallidos para un mismo correo, en 15 minutos, cuando
  vuelve a intentar (aun con la contraseña correcta), entonces recibe 429 `RATE_LIMITED`; otras IP u otros correos no
  se afectan.
- **AC-013-08** · Dada una cookie con el formato anterior (sin `userId`), alterada, firmada con otro secreto o
  vencida, cuando llega a una ruta protegida, entonces responde 401 `UNAUTHENTICATED` (modifica AC-001-04).
- **AC-013-09** · Dado un usuario desactivado, cuando intenta entrar, entonces recibe 401 `ACCESS_DENIED`. Su cookie
  ya emitida sigue vigente hasta que venza (8 h): no hay revisión por petición.

### Contraseña

- **AC-013-10** · Dada una contraseña de menos de 10 caracteres, cuando se usa en el alta, la configuración inicial o
  el cambio de contraseña, entonces responde 400 `VALIDATION` con el error en el campo `password`.
- **AC-013-11** · Dada una sesión con `mustChangePassword=true`, cuando llama a cualquier ruta salvo
  `GET/DELETE /api/session` y `POST /api/session/password`, entonces responde 403 `PASSWORD_CHANGE_REQUIRED`.
- **AC-013-12** · Dada una sesión, cuando envía `POST /api/session/password` con la contraseña actual correcta y una
  nueva válida y distinta, entonces responde 200 con la sesión nueva y una cookie nueva con
  `mustChangePassword=false`, y queda `user.password_changed`. Con la actual incorrecta responde 401
  `ACCESS_DENIED` y cuenta como intento fallido del correo.

### Permisos por rol

- **AC-013-13** · Dada la matriz de permisos, cuando cada rol llama a cada ruta protegida, entonces recibe la
  respuesta normal si tiene el permiso y 403 `FORBIDDEN` si no, sin ejecutar nada ni escribir en la base de datos
  (una prueba recorre todas las rutas y roles).
- **AC-013-14** · Dado un `warehouse`, cuando consulta facturas, cartera o intenta registrar un pago, entonces recibe
  403 `FORBIDDEN`; sí puede listar proveedores y órdenes y confirmar recepciones.
- **AC-013-15** · Dado un `manager`, cuando confirma una factura, la programa o registra su pago, entonces funciona;
  cuando intenta subir una factura o corregir sus campos, recibe 403 `FORBIDDEN`.
- **AC-013-16** · Dado que el rol de una persona no permite una herramienta del asistente, cuando el asistente la
  propone o la persona intenta confirmarla, entonces la propuesta no se ofrece y la ejecución responde 403
  `FORBIDDEN` (regla 6: la confirmación pasa por las mismas rutas protegidas).
- **AC-013-17** · Dado cualquier rol distinto de `admin`, cuando llama a `/api/users`, entonces recibe 403
  `FORBIDDEN`.

### Usuarios (CRUD, solo `admin`)

- **AC-013-18** · Dado un admin, cuando envía `POST /api/users` con nombre, correo, rol y contraseña temporal
  válida, entonces responde 201 con el usuario (sin hash), `mustChangePassword=true`, y queda `user.created`. Con un
  correo ya usado responde 409 `EMAIL_TAKEN`.
- **AC-013-19** · Dado un admin, cuando consulta `GET /api/users` o `GET /api/users/:id`, entonces recibe los
  usuarios (activos e inactivos) con `{ id, name, email, role, active, createdAt }` y nunca el hash.
- **AC-013-20** · Dado un admin, cuando envía `PATCH /api/users/:id` con nombre, rol o `active`, entonces se
  guardan y queda `user.updated` con `fromStatus`/`toStatus` del rol o estado. El cambio de rol rige desde el
  siguiente inicio de sesión de esa persona.
- **AC-013-21** · Dado un admin, cuando envía `POST /api/users/:id/reset-password`, entonces responde 200 con una
  contraseña temporal aleatoria (se muestra una sola vez), el usuario queda con `mustChangePassword=true` y queda
  `user.password_reset` sin la contraseña ni el hash en `data`.
- **AC-013-22** · Dado un admin, cuando envía `DELETE /api/users/:id`, entonces el usuario queda `active=false` (no se
  borra la fila; la auditoría conserva su historial) y queda `user.deactivated`. Es idempotente.
- **AC-013-23** · Dado un admin, cuando intenta quitarse el rol, desactivarse, o dejar al sistema sin ningún
  administrador activo, entonces responde 409 `LAST_ADMIN` o `SELF_PROTECTED` y no cambia nada.

### Interfaz

- **AC-013-24** [manual] · `/login` pide correo y contraseña. Si no hay usuarios, redirige a `/configuracion-inicial`
  (código, nombre, correo, contraseña); tras crearse entra. Con `mustChangePassword` solo se ve la pantalla de
  cambio de contraseña. Cómo verificarlo: base de datos vacía, abrir `/`, completar la configuración, salir,
  entrar de nuevo con las credenciales nuevas.
- **AC-013-25** [manual] · `/usuarios` aparece en la navegación solo para `admin`; lista, crea, edita, desactiva y
  restablece la contraseña (mostrándola una vez, como texto). Las acciones que el rol no permite no se ofrecen
  (la API sigue siendo la barrera real). Cómo verificarlo: entrar como cada rol y revisar navegación y botones.

## Diseño

### Datos

Migración `013-usuarios`. Se elimina `ACCESS_CODE_HASH` como código de entrada: pasa a ser el **código de
configuración inicial** (misma variable, mismo formato scrypt, mismo `pnpm access:hash`).

```prisma
enum UserRole { purchasing warehouse payables manager admin }

model User {
  id                 String   @id @default(uuid()) @db.Uuid
  email              String   @unique            // siempre en minúsculas
  name               String
  passwordHash       String   @map("password_hash")
  role               UserRole
  active             Boolean  @default(true)
  mustChangePassword Boolean  @default(true) @map("must_change_password")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")
  @@map("users")
}
```

`AuditEvent.role` sigue siendo texto: los eventos históricos no cambian.

### Contratos

- `session.ts`: `LoginInput = { email, password }`; `SessionDto` añade `userId` y `mustChangePassword`;
  `SetupInput = { code, name, email, password }`; `ChangePasswordInput = { currentPassword, newPassword }`; se
  exporta `Permission` y la lista de permisos.
- `users.ts` (nuevo): `UserDto`, `CreateUserInput`, `UpdateUserInput`, `ResetPasswordOutput`.
- `errors.ts`: `FORBIDDEN` (403), `EMAIL_TAKEN` (409), `SETUP_DONE` (409), `LAST_ADMIN` (409), `SELF_PROTECTED`
  (409), `PASSWORD_CHANGE_REQUIRED` (403).

### API

| Método y ruta                        | Entrada               | Salida                    | Errores                                          |
| ------------------------------------ | --------------------- | ------------------------- | ------------------------------------------------ |
| `GET /api/setup` (público)           | —                     | `{ needsSetup }`          | —                                                |
| `POST /api/setup` (público)          | `SetupInput`          | 200 `SessionDto` + cookie | 400, 401 `ACCESS_DENIED`, 409 `SETUP_DONE`, 429  |
| `POST /api/session` (público)        | `LoginInput`          | 200 `SessionDto` + cookie | 400, 401 `ACCESS_DENIED`, 429 `RATE_LIMITED`     |
| `POST /api/session/password`         | `ChangePasswordInput` | 200 `SessionDto` + cookie | 400, 401, 429                                    |
| `GET /api/users`                     | —                     | `UserDto[]`               | 403                                              |
| `GET /api/users/:id`                 | —                     | `UserDto`                 | 403, 404                                         |
| `POST /api/users`                    | `CreateUserInput`     | 201 `UserDto`             | 400, 403, 409 `EMAIL_TAKEN`                      |
| `PATCH /api/users/:id`               | `UpdateUserInput`     | `UserDto`                 | 400, 403, 404, 409 `LAST_ADMIN`/`SELF_PROTECTED` |
| `POST /api/users/:id/reset-password` | —                     | `ResetPasswordOutput`     | 403, 404                                         |
| `DELETE /api/users/:id`              | —                     | 204                       | 403, 404, 409 `LAST_ADMIN`/`SELF_PROTECTED`      |

`GET /api/session` y `DELETE /api/session` no cambian.

### Reglas

`session.rules.ts` (puras):

- Token de la cookie: `{ i: userId, a: actor, r: role, m: mustChangePassword, e: expiresAt }`; `readSession` exige
  `i`. Sigue sin haber tabla de sesiones ni consulta por petición.
- `isLoginBlocked(fallasIp, fallasCorreo)` = `fallasIp >= 10 || fallasCorreo >= 5`.
- `validatePassword(texto)` = al menos 10 caracteres y máximo 200.
- `generateTemporaryPassword(bytes)` = 16 caracteres aleatorios (el azar llega como parámetro).
- `normalizeEmail(texto)` = recortado y en minúsculas.

`permissions.rules.ts` (puras): `ROLE_PERMISSIONS` (la tabla de arriba) y `can(role, permission)`.

| role         | permiso           | can   |
| ------------ | ----------------- | ----- |
| `warehouse`  | `orders:receive`  | true  |
| `warehouse`  | `payables:read`   | false |
| `manager`    | `payables:pay`    | true  |
| `manager`    | `payables:write`  | false |
| `purchasing` | `suppliers:write` | true  |
| `payables`   | `users:manage`    | false |
| `admin`      | cualquiera        | true  |

`users.rules.ts`: `canChangeUser(actual, objetivo, cambio, adminsActivos)` decide `LAST_ADMIN`/`SELF_PROTECTED`.

### Piezas transversales

- `@Requires('permiso')` (decorador) y el `SessionGuard` global: sin sesión → 401; con `mustChangePassword` → 403
  `PASSWORD_CHANGE_REQUIRED`; sin el permiso → 403 `FORBIDDEN`. Una ruta protegida **sin** `@Requires` solo exige
  sesión (lecturas de proveedores y órdenes, conversaciones propias). Una prueba lista las rutas sin `@Requires` y
  falla si aparece una no esperada, para que no se olvide proteger una ruta nueva.
- Asistente (spec 008): el catálogo de herramientas se filtra por `can(role, …)`; las herramientas de lectura que
  tocan facturas o cartera se omiten para quien no tiene `payables:read`/`dashboard:read`.
- `modules/users/` copia la forma de `modules/suppliers`. `modules/session` lee usuarios con un repositorio propio de
  solo lectura; el alta/edición/baja vive solo en `users.repository` (regla de una escritura por tabla). La
  configuración inicial usa `users.repository` desde `SetupService`, con bloqueo por transacción
  (`pg_advisory_xact_lock`) para que haya un solo primer administrador.
- Pruebas y semilla: `test/app.ts` gana un ayudante `loginAs(role)` que crea un usuario y devuelve su cookie;
  `pnpm bootstrap` ya no necesita crear usuarios (se usa la pantalla de configuración inicial).

### UI

- `features/session`: `/login` (correo y contraseña), `/configuracion-inicial` y pantalla de cambio de contraseña.
  `RequireSession` redirige según `needsSetup` y `mustChangePassword`.
- `features/users` (copia de `features/suppliers`): tabla, diálogo de alta/edición, confirmación de baja y diálogo
  que muestra la contraseña temporal una sola vez.
- `lib/permissions.ts` (web): usa la misma matriz (exportada desde `contracts`) para ocultar navegación y deshabilitar
  botones. El tutorial (spec 012) omite los pasos de secciones que el rol no ve.

### Auditoría

`user.created` (también el alta de la configuración inicial), `user.updated`, `user.deactivated`,
`user.password_reset`, `user.password_changed`, `session.started`, `session.failed` (con `data.ip`, `data.email`).
`actor`/`role` son los de la persona que hace la acción; `entityId` es el usuario afectado. Ningún evento guarda
contraseñas ni hashes.

## Tareas

- [ ] 1. Contratos: sesión, usuarios, permisos y códigos de error nuevos, con sus pruebas.
- [ ] 2. Reglas puras con pruebas: token con `userId`, límites, contraseña, `can()`, `canChangeUser()`.
- [ ] 3. Modelo `User`, migración `013-usuarios` y repositorios (escritura en `users`, lectura en `session`).
- [ ] 4. `@Requires` y guard (401 / `PASSWORD_CHANGE_REQUIRED` / `FORBIDDEN`); ayudante `loginAs(role)` y migración de
     las pruebas de integración existentes.
- [ ] 5. Entrada por correo, cambio de contraseña y límites por IP y por correo (AC-013-05…12).
- [ ] 6. Configuración inicial (AC-013-01…04).
- [ ] 7. Módulo `users` con auditoría (AC-013-18…23).
- [ ] 8. `@Requires` en `suppliers`, `purchase-orders`, `payables`, `dashboard`, `assistant`, y filtro de herramientas
     del asistente; prueba de recorrido por rol (AC-013-13…17).
- [ ] 9. Web: login, configuración inicial, cambio de contraseña, `/usuarios`, permisos en navegación y tutorial.
- [ ] 10. Docs: ADR nuevo que reemplaza a ADR-07, `.env.example`, `infra/README.md`, `apps/api/AGENTS.md`,
      `apps/web/AGENTS.md`, nota en las specs 001 y 005 ("modificada por 013").
- [ ] 11. `pnpm check` en verde y la spec pasa a `hecha`.

## Fuera de alcance y decisiones

- **Sesión de 8 h sin consulta por petición (decisión del dueño).** Una baja o un cambio de rol de alguien con sesión
  abierta rige hasta que su cookie venza (máx. 8 h). Se acepta; si deja de ser aceptable, el cambio es consultar
  `users` en el guard (una lectura por clave primaria).
- **Quién puede configurar al inicio.** Sin protección, la primera persona que abra un despliegue nuevo se haría
  administradora. Por eso la configuración inicial exige el código de configuración (`ACCESS_CODE_HASH`), que solo
  conoce quien despliega.
- **Despliegues existentes.** Al aplicar la migración no hay usuarios: la primera visita muestra la configuración
  inicial. Las cookies viejas dejan de valer (AC-013-08).
- **`actor` en la auditoría es el nombre**, no único. El correo único identifica a la persona en `entityId` y en
  `data`; no se pidió que el nombre sea único.
- **Matriz fija en código** y un solo rol por persona: cambiarla es un cambio de spec, no una pantalla.
- **Recuperación de contraseña** la hace un admin con una temporal. Recuperación por correo sería una spec nueva.
- **`manager` vs `payables`**: `manager` confirma, programa y paga pero no sube ni corrige facturas; `payables` hace
  todo el ciclo. Si deben ser iguales, se unifica la fila de la tabla.
- Interpretación mía a confirmar: `purchasing` puede ver facturas y cartera (solo lectura).

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-11-02 · Spec redactada en `borrador` a partir del plan acordado (sesión de 8 h en cookie, configuración
  inicial por pantalla, `warehouse` solo con órdenes, `manager` confirma y paga).
