import type { Extraction } from '@mimark/contracts/extraction';
import { fakeExtraction } from '../src/integrations/fake-extraction.js';

/** Almacenamiento en memoria. */
export class MemoryStorage {
  files = new Map<string, Buffer>();
  put(bytes: Buffer): Promise<string> {
    const key = `test/${this.files.size + 1}`;
    this.files.set(key, bytes);
    return Promise.resolve(key);
  }
  get(key: string): Promise<Buffer> {
    const bytes = this.files.get(key);
    return bytes ? Promise.resolve(bytes) : Promise.reject(new Error('no existe'));
  }
}

/** IA simulada: por defecto el modo fake; cada prueba puede fijar la respuesta o hacerla fallar. */
export class FakeExtraction {
  calls = 0;
  failNext = 0;
  override: Partial<Extraction> | null = null;
  extract(input: { bytes: Buffer; fileName: string }) {
    this.calls += 1;
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('contenido del documento que no debe registrarse'));
    }
    const data = { ...fakeExtraction(input.bytes, input.fileName), ...this.override };
    return Promise.resolve({ data, model: 'fake', promptVersion: 'fake', ms: 3 });
  }
}
