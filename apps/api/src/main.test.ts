import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;
const NEST_CORE_IMPORT = /(?:from|require|import)\s*(?:\(\s*)?["']@nestjs\/core["']/;

/**
 * Vercel elige como entrada el primer archivo main/app/index/server que importa '@nestjs/core'.
 * Si otro archivo con esos nombres lo importara, Vercel serviría ese y la API no arrancaría.
 */
describe('entrada de Vercel', () => {
  it('main.ts importa @nestjs/core y llama a listen()', () => {
    const main = readFileSync(join(SRC, 'main.ts'), 'utf8');
    expect(main).toMatch(NEST_CORE_IMPORT);
    expect(main).toMatch(/\.listen\(/);
  });

  it('no hay otros candidatos a entrada en src/', () => {
    const others = ['app', 'index', 'server'].flatMap((name) =>
      ['ts', 'js', 'mts', 'cts'].map((ext) => `${name}.${ext}`),
    );
    expect(others.filter((file) => existsSync(join(SRC, file)))).toEqual([]);
  });
});
