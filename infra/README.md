# Infraestructura y entornos

Casi toda la infraestructura es configuración en servicios gratuitos. Este documento sustituye a Terraform: con él
se monta todo desde cero en unos 15 minutos.

| Pieza               | Servicio                                  | Plan                         | Lo crea la spec |
| ------------------- | ----------------------------------------- | ---------------------------- | --------------- |
| Web estática        | Vercel, servicio `web` del proyecto       | Hobby                        | base            |
| API (1 función)     | Vercel, servicio `api` del mismo proyecto | Hobby                        | base            |
| Base de datos       | Neon Postgres (ramas `main` y `preview`)  | Free                         | base            |
| Archivos originales | Vercel Blob, store privado                | incluido en Hobby            | 004             |
| IA                  | Anthropic o Google (AI SDK)               | pago por uso / capa gratuita | 004             |

> Vercel Hobby es para uso personal y no comercial: sirve para la entrega del curso. Un piloto real con MIMARK pasa
> a Vercel Pro sin cambiar código.

## Local

```bash
pnpm install
pnpm bootstrap   # crea apps/api/.env, levanta Postgres con Docker, migra y siembra
pnpm dev         # web http://localhost:5173 · API http://localhost:3000/api/health
```

Sin Docker: usa cualquier Postgres 16 (por ejemplo una rama de Neon) y pon su URL en `DATABASE_URL` de
`apps/api/.env`; para las pruebas de integración define `TEST_DATABASE_URL` (una base que se puede borrar).

## Día 0: desplegar el esqueleto

1. **GitHub:** sube el repositorio (sin `.env`; el `.gitignore` ya lo excluye).
2. **Neon:** crea el proyecto `mimark-ap` en la región `aws-us-east-1` (cerca de Vercel `iad1`) y una rama `preview`.
   Copia de cada rama la URL con pooling (`DATABASE_URL`) y la directa (`DATABASE_URL_UNPOOLED`).
   Alternativa: Vercel → Storage → Neon, que crea las variables sola.
3. **Proyecto de Vercel** (Add New → Project → este repo): un solo proyecto con dos servicios, declarados en el
   `vercel.json` de la raíz (`api` en `apps/api`, `web` en `apps/web`). `/api/*` va al servicio `api` y todo lo demás
   al servicio `web`, en un solo dominio. Ninguno llama al otro desde el servidor, así que no hay bindings.
   - Node.js: 22.x.
   - Deja activado "Include files outside the root directory" (lo necesita `packages/contracts`).
   - Variables (Production con la rama `main`, Preview con la rama `preview`):

     | Variable                                 | Valor                                                    |
     | ---------------------------------------- | -------------------------------------------------------- |
     | `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | URLs de Neon                                             |
     | `ACCESS_CODE_HASH`                       | `pnpm --filter @mimark/api access:hash "<código largo>"` |
     | `SESSION_SECRET`                         | `openssl rand -base64 48` (distinto por entorno)         |
     | `BUSINESS_TZ`                            | `America/Monterrey`                                      |
     | `ENABLE_EXPERIMENTAL_COREPACK`           | `1` (usa el pnpm de `packageManager`)                    |

   - El build corre `vercel-build`: `prisma migrate deploy` contra la rama del entorno y `nest build`. Vercel toma
     `src/main.ts` como entrada; no fijes `outputDirectory` en la API.
4. Variable `ENABLE_EXPERIMENTAL_COREPACK=1` en el proyecto (la usan ambos servicios).
5. **Monorepo:** en Settings → Git activa "Skip deployments when there are no changes".
6. **Verificar:** abre `https://<web>/api/health` → `{"status":"ok","db":"ok",...}`; entra con el código y registra
   un proveedor.
7. **Semilla en producción** (una vez, datos sintéticos para la demo y el probador):
   `DATABASE_URL="<url directa de main>" pnpm db:seed`.

## Spec 004: archivos e IA

- **Blob:** Vercel → Storage → Create → Blob → acceso **Private** → conéctalo a `mimark-ap-api` (crea
  `BLOB_READ_WRITE_TOKEN`). Un solo store; los archivos llevan prefijo por entorno.
- **IA:** `AI_PROVIDER` (`anthropic` o `google`), `AI_MODEL` y la llave del proveedor (`ANTHROPIC_API_KEY` o
  `GOOGLE_GENERATIVE_AI_API_KEY`). En local puedes usar `AI_PROVIDER=fake` sin llaves.
- **Cuotas:** `DAILY_AI_LIMIT` (por persona, 30) y `DAILY_AI_LIMIT_GLOBAL` (200).
- Para documentos reales (después del curso) usa una cuenta de pago cuyos términos excluyan entrenar con tus datos.

## Dónde vive cada secreto

| Secreto                             | Local                                         | Vercel                                    |
| ----------------------------------- | --------------------------------------------- | ----------------------------------------- |
| Conexión a la base                  | `apps/api/.env`                               | proyecto `api`, por entorno               |
| Hash del código y secreto de sesión | `apps/api/.env` (valores de desarrollo)       | proyecto `api`, por entorno               |
| Token de Blob                       | opcional (sin él se usa `apps/api/.storage/`) | lo crea la integración                    |
| Llave de IA                         | `apps/api/.env`                               | proyecto `api`                            |
| Código de acceso en claro           | nunca en archivos                             | se comparte por separado con quien evalúa |

La web no tiene variables: llama a `/api` en su propio origen.

## Límites que conviene recordar

- Peticiones a funciones de hasta 4.5 MB (la API acepta archivos de hasta 4 MB) y 300 s por petición.
- Neon Free: 0.5 GB y 100 CU-hora por mes; se suspende tras 5 minutos sin uso (la primera consulta tarda más).
- Los logs de Vercel Hobby duran poco: el detalle durable está en `audit_events`.
- Las previews de `web` llaman a la API de producción (por la reescritura fija): prueba cambios de API en la URL
  preview de `api`.

## Problemas comunes

| Síntoma                                         | Causa probable                                      | Arreglo                                               |
| ----------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| `Variables de entorno inválidas` al arrancar    | falta una variable o tiene mal formato              | el mensaje dice cuál; revisa `apps/api/.env.example`  |
| Build de `api` falla en `prisma migrate deploy` | falta `DATABASE_URL_UNPOOLED` o la rama no existe   | revisa las variables del entorno (Production/Preview) |
| La web responde 404 en `/api/...`               | el rewrite `/api/(.*)` de la raíz no apunta a `api` | revisa `services` y `rewrites` en `vercel.json`       |
| Las pruebas de integración no conectan          | no hay Postgres de pruebas                          | `pnpm db:up` o define `TEST_DATABASE_URL`             |
