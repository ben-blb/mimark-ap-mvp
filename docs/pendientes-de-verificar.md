# Pendientes de verificar

Lista viva de lo que un agente no pudo comprobar solo (verificación manual, decisiones abiertas, texto por
revisar). **Quien lo resuelva lo borra de aquí y lo anota en la Bitácora de su spec.** Los agentes agregan una
línea cada vez que dejan algo sin verificar; formato: `- [ ] AAAA-MM-DD · spec · qué falta · cómo verificarlo`.

## Verificación manual

- [ ] 2026-11-15 · 018 · AC-018-15: a 375 px la recepción ocupa toda la pantalla, − y + miden al menos 48 px,
      fecha y notas van arriba y el botón de confirmar queda fijo abajo con el contador. Cómo: `pnpm dev`,
      entrar como Almacén con un viewport de 375 px y recibir una orden con un faltante. Al verificarlo: anotarlo
      en la Bitácora de la 018, marcar la tarea 8 y pasar la spec a `hecha`.

## Decisiones o texto por revisar

- [ ] 2026-11-15 · 018 · `apps/api/src/integrations/prompts/assistant.v3.ts` aún dice «el checklist completo»;
      la recepción ahora es por cantidades. Cambiar el prompt es otra decisión (versión nueva del prompt).
- [ ] 2026-11-15 · 018 · Una cantidad como `'70.0'` queda así en el evento de auditoría y como `70` en la API.
      No afecta cálculos; opcional: normalizarla en `receipt.rules.ts`.
- [ ] 2026-11-15 · 015 · `pnpm spec:check` la muestra `en-progreso` con tareas 7/8: revisar qué falta y cerrarla.
