#!/usr/bin/env node
/**
 * Hook PreToolUse (Edit|Write) de Claude Code: bloquea cambios a archivos que no se editan a mano.
 * Sale con código 2 y explica en stderr qué hacer en su lugar (Claude lo lee y corrige el rumbo).
 */
import { existsSync, readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const file = String(input.tool_input?.file_path ?? '').replaceAll('\\', '/');

const RULES = [
  {
    test: (f) => /\/prisma\/migrations\/.+\/migration\.sql$/.test(f) && existsSync(f),
    why: 'Las migraciones aplicadas no se editan.',
    fix: 'Cambia apps/api/prisma/schema.prisma y crea una migración nueva con: pnpm db:migrate --name <spec>-<cambio>',
  },
  {
    test: (f) => /\/prisma\/migrations\//.test(f),
    why: 'Las migraciones no se escriben a mano.',
    fix: 'Cambia apps/api/prisma/schema.prisma y genera la migración con: pnpm db:migrate --name <spec>-<cambio>',
  },
  {
    test: (f) => /(^|\/)\.env(\.[\w-]+)?$/.test(f) && !f.endsWith('.env.example'),
    why: 'Los archivos .env tienen secretos y no se editan desde el agente.',
    fix: 'Documenta la variable nueva en apps/api/.env.example y en config/env.ts; el humano actualiza su .env.',
  },
  {
    test: (f) => f.endsWith('/pnpm-lock.yaml'),
    why: 'El lockfile lo escribe pnpm.',
    fix: 'Usa pnpm add / pnpm remove con --filter <paquete>.',
  },
  {
    test: (f) => f.includes('/src/generated/'),
    why: 'El cliente de Prisma es generado.',
    fix: 'Cambia prisma/schema.prisma y corre pnpm --filter @mimark/api exec prisma generate.',
  },
];

const rule = RULES.find((r) => r.test(file));
if (rule) {
  console.error(`Bloqueado: ${file}\n${rule.why}\n→ ${rule.fix}`);
  process.exit(2);
}
