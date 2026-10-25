import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Api, type PayableView } from './api.js';

/** Raíz del repositorio (este archivo vive en infra/probador/src). */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const EVIDENCE_DIR = `${ROOT}docs/entrega/evidencia`;

/**
 * Lee la URL (`--url`) y entra con el código de `PROBADOR_CODE`. El código nunca se acepta como argumento
 * (quedaría en el historial del shell) ni se lee de un archivo.
 */
export async function connect(): Promise<{ api: Api; url: string }> {
  const { values } = parseArgs({ options: { url: { type: 'string' } } });
  const code = process.env.PROBADOR_CODE;
  if (!values.url) fatal('Falta --url <URL de la app>.');
  if (!code) fatal('Falta la variable de entorno PROBADOR_CODE (el código de acceso).');
  const api = new Api(values.url);
  try {
    await api.login(code);
  } catch (error) {
    fatal(error instanceof Error ? error.message : 'No se pudo iniciar sesión.');
  }
  return { api, url: api.base };
}

export function fatal(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

export async function writeEvidence(fileName: string, content: string): Promise<string> {
  const path = `${EVIDENCE_DIR}/${fileName}`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
  return path;
}

/** Estados desde los que la API permite descartar. Un expediente confirmado ya no se puede descartar. */
const DISCARDABLE = 'requires_review,pending_confirmation,out_of_scope,failed';

/** Descarta expedientes vivos de `createdBy=probador` (los que dejó una corrida anterior). */
export async function discardLeftovers(api: Api): Promise<number> {
  const list = await api.get<{ items: { id: string }[] }>(
    `/api/payables?createdBy=probador&status=${DISCARDABLE}`,
  );
  const ids = list.status === 200 ? list.body.items.map((i) => i.id) : [];
  return discardIds(api, ids);
}

/** Descarta los expedientes dados que sigan en un estado descartable. Devuelve cuántos descartó. */
export async function discardIds(api: Api, ids: string[]): Promise<number> {
  let done = 0;
  for (const id of new Set(ids)) {
    const res = await api.post(`/api/payables/${id}/discard`, { reason: 'Limpieza del probador' });
    if (res.status === 201) done += 1;
  }
  return done;
}

export type { PayableView };
