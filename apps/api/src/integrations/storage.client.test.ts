import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError } from '../common/app-error.js';
import { StorageClient } from './storage.client.js';

describe('StorageClient (disco local)', () => {
  const keys: string[] = [];
  afterEach(async () => {
    await Promise.all(
      keys
        .splice(0)
        .map((key) => rm(join(resolve(process.cwd(), '.storage'), key), { force: true })),
    );
  });

  it('AC-004-01 guarda y devuelve los mismos bytes, con una llave sin el nombre del archivo', async () => {
    const storage = new StorageClient();
    const bytes = Buffer.from('%PDF-1.7 prueba');
    const key = await storage.put(bytes, 'application/pdf');
    keys.push(key);

    expect(key).toMatch(/^local\/payables\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
    expect((await storage.get(key)).equals(bytes)).toBe(true);
  });

  it('AC-004-11 un archivo que ya no existe es NOT_FOUND, no un error interno', async () => {
    const error = await new StorageClient()
      .get('local/payables/1999/01/no-existe.pdf')
      .catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('NOT_FOUND');
  });
});
