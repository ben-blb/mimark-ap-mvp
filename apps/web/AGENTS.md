# Web · apps/web

React 19 + Vite 8 + MUI 9, TanStack Query y React Router. Se publica como archivos estáticos; `/api` llega al
backend por la reescritura de `vercel.json` (y por el proxy de Vite en local).

## Estructura

```
src/app/          router.tsx (todas las rutas), AppShell.tsx (navegación), theme.ts, query-client.ts
src/lib/          api-client.ts (único fetch), use-zod-form.ts, format.ts, labels.ts
src/components/   piezas usadas por 2+ features (ErrorAlert, PageHeader…)
src/features/<x>/ una carpeta por recurso: <x>.api.ts, páginas, diálogos, formularios y sus pruebas
```

## Reglas

- Los componentes no hacen `fetch`: cada feature expone hooks en `<x>.api.ts` (query keys + `useQuery` /
  `useMutation`) que usan `api` de `lib/api-client.ts`, que valida cada respuesta con su esquema de contracts.
- Formularios con `useZodForm(esquemaDeContracts, valoresIniciales, error.fieldErrors)`: el mismo esquema que
  valida la API. Formularios puros (sin API) para poder probarlos.
- Sin estado global: datos del servidor en TanStack Query, estado local con `useState`.
- Textos visibles en español; etiquetas de enums en `lib/labels.ts`; dinero y fechas con `lib/format.ts`.
- Estilos solo con el tema (`app/theme.ts`) y la prop `sx`. Selects nativos (`slotProps={{ select: { native: true } }}`).
- Prohibido `dangerouslySetInnerHTML`: el contenido de documentos y de la IA se muestra como texto (lint).
- Las acciones de un expediente se dibujan desde `allowedActions` del DTO; la UI no repite reglas de negocio.
- Ruta nueva → `app/router.tsx`; pantalla de primer nivel → `NAV_ITEMS` en `app/AppShell.tsx`.
- Imports relativos sin extensión (los resuelve Vite).

## Pruebas

Vitest + Testing Library (`*.test.tsx`), sin red: se prueban los formularios y componentes puros. Busca por rol o
etiqueta, como lo haría una persona.
