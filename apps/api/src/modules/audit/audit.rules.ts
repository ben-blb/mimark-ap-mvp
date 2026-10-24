/** Reglas puras de auditoría. */

type JsonValue = string | number | boolean | null | JsonValue[];

export type FieldChanges = Record<string, { from: JsonValue; to: JsonValue }>;

/**
 * Campos que cambiaron entre dos versiones de un registro, para guardarlos en el evento.
 * Compara por valor (fechas y decimales incluidos) y solo en los campos indicados.
 */
export function diffFields<T extends object>(
  before: T,
  after: T,
  fields: readonly (keyof T & string)[],
): FieldChanges {
  const changes: FieldChanges = {};
  for (const field of fields) {
    const from = toJson(before[field]);
    const to = toJson(after[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to };
  }
  return changes;
}

function toJson(value: unknown): JsonValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (isDecimal(value)) return value.toFixed();
  return JSON.stringify(value);
}

/** Prisma.Decimal (importes) sin depender del cliente de Prisma. */
function isDecimal(value: unknown): value is { toFixed(): string } {
  return typeof value === 'object' && value !== null && 'toFixed' in value;
}
