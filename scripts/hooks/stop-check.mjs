#!/usr/bin/env node
/**
 * Hook Stop de Claude Code: antes de que el agente dé por terminado su turno, corre la
 * verificación rápida si cambió código. Si falla, le devuelve el error para que lo corrija.
 *
 *  - Sin cambios desde la última verificación exitosa → no hace nada.
 *  - Solo cambiaron archivos .md → corre `pnpm spec:check`.
 *  - Cambió código → corre `pnpm check:fast` (tipos, capas, specs y pruebas unitarias).
 *  - Si ya se le pidió corregir una vez (stop_hook_active) y sigue fallando, deja terminar y
 *    avisa al usuario, para no entrar en un ciclo.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const cacheFile = join(root, '.claude/.cache/last-check');

const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout ?? '';
const status = git(['status', '--porcelain', '--untracked-files=all']);
if (!status.trim()) process.exit(0);

// Archivos cambiados (incluye nuevos); "R  viejo -> nuevo" cuenta como el nuevo.
const changed = status
  .split('\n')
  .filter(Boolean)
  .map((line) => line.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''));

// Huella del contenido actual de lo que cambió: si es igual a la última verificación exitosa, no se repite.
const hash = createHash('sha256').update(status);
for (const path of changed) {
  try {
    hash.update(path).update(readFileSync(join(root, path)));
  } catch {
    // Archivo borrado o carpeta: basta con su línea en el status.
  }
}
const fingerprint = hash.digest('hex');
try {
  if (readFileSync(cacheFile, 'utf8') === fingerprint) process.exit(0);
} catch {
  // Primera verificación.
}

const onlyDocs = changed.every((path) => path.endsWith('.md'));
const script = onlyDocs ? 'spec:check' : 'check:fast';
const result = spawnSync('pnpm', ['run', script], { cwd: root, encoding: 'utf8', shell: true });

if (result.status === 0) {
  mkdirSync(join(root, '.claude/.cache'), { recursive: true });
  writeFileSync(cacheFile, fingerprint);
  process.exit(0);
}

const tail = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-60).join('\n');
if (input.stop_hook_active) {
  console.log(
    JSON.stringify({
      systemMessage: `pnpm ${script} sigue fallando. Revisa la salida antes de continuar.`,
    }),
  );
} else {
  console.log(
    JSON.stringify({
      decision: 'block',
      reason: `pnpm ${script} falló. Corrige la causa (no desactives la regla ni la prueba) y vuelve a verificar:\n\n${tail}`,
    }),
  );
}
