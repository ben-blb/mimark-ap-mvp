@AGENTS.md

## Claude Code

- **No crees ramas.** Todo se trabaja y se commitea directo sobre `main`.
- Skills del proyecto: `/spec-nueva <qué>`, `/spec-implementar <id>`, `/spec-revisar <id>`.
- Hooks (`.claude/settings.json`): formatean cada archivo que editas, bloquean archivos protegidos y, antes de
  terminar un turno con cambios de código, corren `pnpm check:fast`. Si el hook te devuelve un error, corrígelo.
- Si no hay Postgres (sin Docker), pide al usuario una `DATABASE_URL`/`TEST_DATABASE_URL` (por ejemplo una rama de
  Neon) en vez de saltarte las pruebas de integración.
