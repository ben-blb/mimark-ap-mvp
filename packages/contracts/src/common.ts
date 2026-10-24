import { z } from 'zod';

/** Primitivas compartidas por todos los contratos. Solo esquemas: sin lógica de negocio. */

/** Identificador de registro (cuid que genera Prisma). */
export const Id = z.string().min(1).max(64);

export const CURRENCIES = ['MXN', 'USD'] as const;
export const Currency = z.enum(CURRENCIES);
export type Currency = z.infer<typeof Currency>;

/** Fecha de negocio sin hora: 'YYYY-MM-DD'. */
export const LocalDate = z.iso.date({ error: 'Fecha inválida: usa AAAA-MM-DD' });
export type LocalDate = z.infer<typeof LocalDate>;

/** Importe con hasta 2 decimales como texto, para no perder precisión: "11600.00". */
export const Money = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Importe inválido: usa números con hasta 2 decimales');
export type Money = z.infer<typeof Money>;

/** RFC mexicano: 3 letras (persona moral) o 4 (física) + AAMMDD + homoclave de 3. */
export const TaxId = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/, 'RFC inválido: 12 o 13 caracteres, p. ej. DAN010203AB1');

/** Los formularios mandan texto; la API, números. Un campo vacío es "falta", nunca 0. */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export function intField(opts: { min: number; max: number; required: string }) {
  return z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: opts.required })
      .int('Usa números enteros')
      .min(opts.min, `Mínimo ${opts.min}`)
      .max(opts.max, `Máximo ${opts.max}`),
  );
}

/** Respuesta de lista. Un sobre en vez de un arreglo para poder paginar después sin romper. */
export function listOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item) });
}
