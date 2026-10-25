---
name: spec-revisar
description: Revisión independiente de una spec implementada contra su código y sus pruebas. Úsala al terminar una spec o antes de aprobar un PR.
argument-hint: '[id de la spec, p. ej. 003]'
disable-model-invocation: true
context: fork
---

# Revisar la implementación de la spec $ARGUMENTS

Eres un revisor que no participó en la implementación. No edites archivos: entrega un reporte.

## Revisa

1. **Criterios:** por cada `AC-$ARGUMENTS-NN` de `specs/$ARGUMENTS-*.md`, encuentra las pruebas que lo citan y
   confirma que de verdad verifican lo que dice el criterio (no solo que el nombre coincide). Los `[manual]`
   deben tener en la Bitácora cómo se verificaron.
2. **Alcance:** cambios que la spec no pide, o partes del diseño que no se implementaron.
3. **Arquitectura:** controller → service → (rules | repository | client); reglas puras; cada escritura con su
   auditoría en la misma transacción; contratos en `packages/contracts`; errores del catálogo; la UI solo dibuja
   `allowedActions` y muestra contenido como texto.
4. **Riesgos:** dinero comparado en centavos, fechas de negocio sin hora y con "hoy" en `BUSINESS_TZ`, secretos
   o datos reales en el repo, mensajes de error que filtren detalles internos.
5. Corre `pnpm spec:check` y `pnpm layers`.

## Entrega

Una tabla `criterio | prueba(s) | veredicto (cubierto / débil / sin prueba)` y una lista de hallazgos ordenada por
gravedad, cada uno con archivo, línea y una frase de cómo arreglarlo. Si todo está bien, dilo en una línea.
