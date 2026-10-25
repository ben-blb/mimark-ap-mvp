---
name: spec-implementar
description: Implementa una spec en estado lista, tarea por tarea, con pruebas primero y el check en verde. Úsala cuando el usuario pida construir una spec por su número.
argument-hint: '[id de la spec, p. ej. 003]'
disable-model-invocation: true
---

# Implementar la spec $ARGUMENTS

## Antes de empezar

1. Abre `specs/$ARGUMENTS-*.md`. Debe estar en `lista` (o en `en-progreso` si retomas). Si está en `borrador`,
   detente y pide que se apruebe. Sus `depende_de` deben estar en `hecha`.
2. Lee `AGENTS.md`, el `AGENTS.md` de cada app que vas a tocar, y el módulo plantilla
   (`apps/api/src/modules/suppliers`, `apps/web/src/features/suppliers`).
3. Si retomas: lee la Bitácora de la spec y `git log --oneline -15` para ver dónde quedó.
4. Cambia el estado a `en-progreso`.

## Por cada tarea, en orden

1. Escribe primero las pruebas de los criterios que cubre la tarea. El nombre de cada prueba empieza con su ID:
   `it('AC-003-04 …')`. Reglas → prueba unitaria; endpoints → `*.int.test.ts` con `createTestApp`; pantallas →
   Testing Library.
2. Implementa lo mínimo para que pasen, siguiendo el diseño de la spec y la forma del módulo plantilla.
3. Corre `pnpm check:fast` (y `pnpm test:int` si tocaste repositorios, services o controllers). Arregla la causa
   de cada falla; nunca desactives una regla, una prueba ni el hook.
4. Marca la tarea `[x]` en la spec y haz commit: `spec($ARGUMENTS): <tarea>`.
5. Si tomaste una decisión que la spec no cubría o descubriste algo útil para quien siga, anótalo en la Bitácora
   con fecha.

## Si la spec no alcanza

Si un criterio es ambiguo, contradice otro o choca con la arquitectura: detente, explica el problema en dos
líneas y propón el cambio a la spec. No implementes una interpretación propia sin dejarla escrita en la spec.

## Al terminar

1. `pnpm check` completo en verde (incluye lint, formato e integración; necesita Postgres).
2. Verifica a mano los criterios `[manual]` (con `pnpm dev`) y escribe en la Bitácora cómo los verificaste.
3. Cambia el estado a `hecha` y corre `pnpm spec:check` (exige tareas marcadas y una prueba por criterio).
4. Responde con: qué quedó, la salida resumida de `pnpm check` y `pnpm spec:check`, y lo que quedó pendiente.
   Sugiere correr `/spec-revisar $ARGUMENTS` para una revisión independiente.
