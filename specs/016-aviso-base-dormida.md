---
id: '016'
titulo: Aviso de base de datos dormida
estado: en-progreso # borrador | lista | en-progreso | hecha
depende_de: ['001', '013']
requisitos: Usabilidad (extensión)
---

# 016 · Aviso de base de datos dormida

## Objetivo

Neon suspende el cómputo de la base tras un rato sin uso y la primera conexión tarda o falla. Hoy la persona ve un
error de entrada sin saber por qué. Esta spec hace que, al abrir las pantallas de acceso, la web despierte la base
y avise «Despertando la base de datos…» hasta que responda.

## Alcance

**Incluye:** consulta a `GET /api/health` al abrir entrar, configuración inicial y cambio de contraseña; aviso visible
mientras la base no responde; reintento automático hasta que responda; el contrato `Health` en `packages/contracts`
para validar la respuesta en la web.

**No incluye:** cambios de comportamiento en la API (`/api/health` ya despierta la base con su `SELECT 1`); bloquear el
botón de entrar mientras dura el aviso; avisos en las pantallas internas una vez iniciada la sesión; mantener la
base despierta con un cron; cambiar el plan o la suspensión de Neon; dependencias nuevas.

## Criterios de aceptación

- **AC-016-01** · Dada una pantalla de acceso recién abierta, cuando carga, entonces la web consulta
  `GET /api/health` una vez.
- **AC-016-02** · Dado que `/api/health` responde `db: 'ok'` en menos de 2 segundos, cuando termina, entonces no se
  muestra ningún aviso (sin parpadeo).
- **AC-016-03** · Dado que `/api/health` tarda más de 2 segundos, cuando pasa ese tiempo, entonces se muestra el
  aviso «Despertando la base de datos… Puede tardar unos segundos.» con rol `status`.
- **AC-016-04** · Dado que `/api/health` responde `db: 'error'` (HTTP 200, `status: 'degraded'`), cuando llega la
  respuesta, entonces se muestra el aviso y se vuelve a consultar cada 3 segundos.
- **AC-016-05** · Dado que la consulta falla por red o con un error HTTP, cuando falla, entonces se muestra el mismo
  aviso y se reintenta cada 3 segundos.
- **AC-016-06** · Dado el aviso visible, cuando `/api/health` responde `db: 'ok'`, entonces el aviso desaparece y
  deja de consultarse.
- **AC-016-07** · Dado el aviso visible, cuando la persona escribe su correo y su contraseña, entonces el formulario
  sigue usable (el aviso no bloquea el botón «Entrar»).
- **AC-016-08** · Dada una respuesta de `/api/health` que no cumple el contrato `Health`, cuando llega, entonces se
  trata como falla (AC-016-05) y no se lanza error en pantalla.

## Diseño

### Datos

Sin cambios.

### Contratos

`packages/contracts/src/health.ts`:

```ts
export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'error']),
  version: z.string(),
  environment: z.string(),
});
export type Health = z.infer<typeof Health>;
```

`HealthDto` de la API pasa a ser este tipo (una sola definición).

### API

Sin cambios. `GET /api/health` sigue respondiendo 200 aunque `db` sea `'error'`.

### Reglas

No hay lógica de negocio. La constante de umbral (2 s) y de reintento (3 s) viven en el hook de la web.

### UI

- `features/session/health.api.ts`: `useDbHealth()` con TanStack Query. `queryFn` llama `api.get('/health', Health)`;
  `retry: false`; `refetchInterval` devuelve 3000 mientras el resultado no sea `db: 'ok'` y `false` después.
- `features/session/DbWakeNotice.tsx`: usa `useDbHealth()` y un temporizador de 2 s para saber si ya tardó. Muestra
  un `Alert severity="info"` con `LinearProgress` cuando (tardó más de 2 s) o (hubo respuesta `db: 'error'` o falla).
  Se oculta con `db: 'ok'`.
- Se monta dentro de `AuthLayout`, arriba del contenido, así lo heredan entrar, configuración inicial y cambio de
  contraseña sin tocar cada página.
- El contenido del aviso es texto fijo; nunca se muestra contenido de la respuesta.

### Auditoría

Sin eventos: es una lectura sin efectos.

## Tareas

Pequeñas y en orden. Cada una deja `pnpm check:fast` en verde. Pruebas primero.

- [x] 1. Contrato `Health` en `packages/contracts/src/health.ts` (con prueba) y `HealthDto` de la API usando ese tipo.
- [ ] 2. `useDbHealth` en `health.api.ts` con pruebas de AC-016-01, 04, 05, 06, 08 (reloj simulado).
- [ ] 3. `DbWakeNotice` con pruebas de AC-016-02, 03 y 07.
- [ ] 4. Montarlo en `AuthLayout`; ajustar las pruebas de las pantallas de acceso que no esperan la llamada a `/health`.
- [ ] 5. `pnpm check`; verificar a mano con la base de Neon suspendida; estado `hecha`.

## Fuera de alcance y decisiones

- **No se bloquea «Entrar».** Decisión provisional: el aviso informa y no impide intentar; si la base sigue dormida el
  intento muestra el error normal. Si se prefiere bloquear, es un criterio nuevo y requiere compartir el estado entre
  `AuthLayout` y cada página.
- **Duda abierta, fuera de esta spec:** con la base apagada el login debería fallar con `INTERNAL` (500), no con
  `ACCESS_DENIED`. Leyendo `session.service.ts` y `error.filter.ts` no se explica que haya salido `ACCESS_DENIED`.
  Hay que reproducirlo con la base suspendida antes de decidir si es un bug aparte (spec propia).
- Despertar la base en la primera conexión sigue dependiendo de los tiempos de Neon (`connect_timeout` de Prisma);
  si 15 s no bastan, se ajusta el tiempo de espera en otra spec.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->
