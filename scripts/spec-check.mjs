#!/usr/bin/env node
/**
 * pnpm spec:check — conecta las specs con las pruebas y muestra el tablero de estado.
 *
 * Revisa:
 *  - Cada spec (specs/NNN-nombre.md) tiene frontmatter válido y su id coincide con el archivo.
 *  - Los criterios de aceptación (AC-NNN-NN) son únicos y pertenecen a su spec.
 *  - Una spec "hecha" tiene todas sus tareas marcadas y cada criterio citado en al menos una
 *    prueba (salvo los marcados [manual]).
 *  - Ninguna prueba cita un criterio que no existe.
 *  - Una spec "en-progreso" o "hecha" solo depende de specs "hechas".
 * Sale con código 1 si encuentra errores; cada error dice cómo arreglarlo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SPECS_DIR = join(ROOT, 'specs');
const TEST_ROOTS = ['apps', 'packages', 'infra'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'generated', '.storage', 'coverage']);
const STATES = ['borrador', 'lista', 'en-progreso', 'hecha'];
const AC_PATTERN = /AC-\d{3}-\d{2}/g;

const errors = [];
const fail = (where, message, fix) => errors.push({ where, message, fix });

// --- Specs -------------------------------------------------------------------------------

/** YAML mínimo del frontmatter: `clave: valor` y listas `[a, b]` (Prettier las parte en varias líneas). */
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const yaml = match[1]
    .replace(/:\s*\r?\n\s*\[/g, ': [')
    .replace(/\[([^\]]*)\]/g, (list) => list.replace(/\s*\r?\n\s*/g, ' '));
  const data = {};
  for (const line of yaml.split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*?)\s*(#.*)?$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    data[key] = raw.startsWith('[')
      ? raw
          .slice(1, -1)
          .split(',')
          .map((v) => v.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
      : raw.replace(/^["']|["']$/g, '');
  }
  return data;
}

function section(text, title) {
  const start = text.search(new RegExp(`^## ${title}\\b`, 'm'));
  if (start === -1) return '';
  const rest = text.slice(start + 3);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}

const specs = readdirSync(SPECS_DIR)
  .filter((name) => /^\d{3}-.+\.md$/.test(name))
  .sort()
  .map((file) => {
    const text = readFileSync(join(SPECS_DIR, file), 'utf8');
    const meta = parseFrontmatter(text) ?? {};
    const criteria = [...text.matchAll(/^\s*-\s+\*\*(AC-\d{3}-\d{2})\*\*(\s*\[manual\])?/gm)].map(
      (m) => ({
        id: m[1],
        manual: Boolean(m[2]),
      }),
    );
    const tasks = [...section(text, 'Tareas').matchAll(/^\s*-\s+\[( |x|X)\]/gm)].map(
      (m) => m[1] !== ' ',
    );
    return { file: `specs/${file}`, id: file.slice(0, 3), meta, criteria, tasks };
  });

const byId = new Map(specs.map((s) => [s.id, s]));
const allCriteria = new Map();

for (const spec of specs) {
  const { meta, file } = spec;
  if (meta.id !== spec.id)
    fail(
      file,
      `id "${meta.id ?? '(falta)'}" no coincide con el archivo`,
      `pon id: "${spec.id}" en el frontmatter`,
    );
  if (!meta.titulo) fail(file, 'falta titulo', 'agrega titulo: <nombre corto> al frontmatter');
  if (!STATES.includes(meta.estado))
    fail(file, `estado inválido "${meta.estado ?? ''}"`, `usa uno de: ${STATES.join(', ')}`);
  if (meta.estado !== 'borrador' && spec.criteria.length === 0) {
    fail(
      file,
      'no tiene criterios de aceptación',
      'agrega líneas "- **AC-NNN-01** · Dado…, cuando…, entonces…"',
    );
  }
  for (const c of spec.criteria) {
    if (!c.id.startsWith(`AC-${spec.id}-`))
      fail(file, `${c.id} no pertenece a la spec ${spec.id}`, `renómbralo a AC-${spec.id}-NN`);
    if (allCriteria.has(c.id))
      fail(file, `${c.id} está repetido`, 'cada criterio necesita un número único');
    allCriteria.set(c.id, { spec, manual: c.manual });
  }
  for (const dep of meta.depende_de ?? []) {
    const target = byId.get(dep);
    if (!target) fail(file, `depende de "${dep}", que no existe`, 'corrige depende_de');
    else if (['en-progreso', 'hecha'].includes(meta.estado) && target.meta.estado !== 'hecha') {
      fail(
        file,
        `está ${meta.estado} pero depende de ${dep} (${target.meta.estado})`,
        `termina primero la spec ${dep}`,
      );
    }
  }
}

// --- Pruebas -----------------------------------------------------------------------------

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const isTestFile = (path) =>
  /\.test\.tsx?$/.test(path) || /infra[\\/]probador[\\/].+\.ts$/.test(path);
const citedBy = new Map();

for (const root of TEST_ROOTS) {
  const dir = join(ROOT, root);
  try {
    statSync(dir);
  } catch {
    continue;
  }
  for (const path of walk(dir)) {
    if (!isTestFile(path)) continue;
    const rel = relative(ROOT, path);
    for (const [id] of readFileSync(path, 'utf8').matchAll(AC_PATTERN)) {
      if (!allCriteria.has(id))
        fail(
          rel,
          `cita ${id}, que no existe en ninguna spec`,
          'corrige el id o agrega el criterio a su spec',
        );
      citedBy.set(id, [...(citedBy.get(id) ?? []), rel]);
    }
  }
}

for (const spec of specs.filter((s) => s.meta.estado === 'hecha')) {
  const pending = spec.tasks.filter((done) => !done).length;
  if (pending > 0)
    fail(
      spec.file,
      `está hecha pero tiene ${pending} tarea(s) sin marcar`,
      'termina las tareas o regresa el estado a en-progreso',
    );
  for (const c of spec.criteria) {
    if (!c.manual && !citedBy.has(c.id)) {
      fail(
        spec.file,
        `${c.id} no tiene prueba`,
        `agrega una prueba cuyo nombre empiece con "${c.id}" o márcalo [manual] si no se puede automatizar`,
      );
    }
  }
}

// --- Reporte -----------------------------------------------------------------------------

const ICON = { borrador: '·', lista: '○', 'en-progreso': '◐', hecha: '●' };
console.log('\nSpecs');
for (const spec of specs) {
  const tested = spec.criteria.filter((c) => c.manual || citedBy.has(c.id)).length;
  const done = spec.tasks.filter(Boolean).length;
  const deps = spec.meta.depende_de?.length
    ? `  · depende de ${spec.meta.depende_de.join(', ')}`
    : '';
  const title = `${spec.id} ${spec.meta.titulo ?? ''}`.padEnd(42, ' ');
  const state = `${ICON[spec.meta.estado] ?? '?'} ${spec.meta.estado ?? '?'}`.padEnd(14, ' ');
  console.log(
    `  ${title}${state}criterios ${tested}/${spec.criteria.length}  tareas ${done}/${spec.tasks.length}${deps}`,
  );
}

if (errors.length > 0) {
  console.error(`\n✖ ${errors.length} problema(s):`);
  for (const e of errors) console.error(`  ${e.where}: ${e.message}\n    → ${e.fix}`);
  process.exit(1);
}
console.log(`\n✔ ${specs.length} specs, ${allCriteria.size} criterios, sin problemas.\n`);
