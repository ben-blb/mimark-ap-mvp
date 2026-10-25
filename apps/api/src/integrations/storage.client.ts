import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { get, put } from '@vercel/blob';
import { env } from '../config/env.js';

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};
const LOCAL_DIR = resolve(process.cwd(), '.storage');

/** Archivos originales: Vercel Blob privado, o disco local (sin token) en desarrollo. */
@Injectable()
export class StorageClient {
  /** Guarda los bytes y devuelve la llave. Esta no incluye el nombre original (puede traer datos personales). */
  async put(bytes: Buffer, mimeType: string): Promise<string> {
    const now = new Date();
    const key = [
      env.VERCEL_ENV ?? 'local',
      'payables',
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.${EXTENSIONS[mimeType] ?? 'bin'}`,
    ].join('/');

    if (env.BLOB_READ_WRITE_TOKEN) {
      const { pathname } = await put(key, bytes, {
        access: 'private',
        contentType: mimeType,
        addRandomSuffix: true,
      });
      return pathname;
    }
    const path = join(LOCAL_DIR, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    if (env.BLOB_READ_WRITE_TOKEN) {
      const result = await get(key, { access: 'private' });
      if (result?.statusCode !== 200) throw new Error('Archivo no encontrado en el almacenamiento');
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    }
    return readFile(join(LOCAL_DIR, key));
  }
}
