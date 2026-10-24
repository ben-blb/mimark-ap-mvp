#!/usr/bin/env node
/**
 * Hook PostToolUse (Edit|Write) de Claude Code: formatea con Prettier el archivo que se acaba
 * de editar, para que el agente nunca piense en formato. Si el archivo no se puede formatear
 * (error de sintaxis), sale con código 2 para que Claude vea el error.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import * as prettier from 'prettier';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const file = input.tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

if (!file || relative(root, file).startsWith('..')) process.exit(0);

try {
  const info = await prettier.getFileInfo(file, { ignorePath: `${root}/.prettierignore` });
  if (info.ignored || !info.inferredParser) process.exit(0);

  const source = readFileSync(file, 'utf8');
  const options = (await prettier.resolveConfig(file)) ?? {};
  const formatted = await prettier.format(source, { ...options, filepath: file });
  if (formatted !== source) writeFileSync(file, formatted);
} catch (error) {
  console.error(`Prettier no pudo formatear ${relative(root, file)}: ${error.message}`);
  process.exit(2);
}
