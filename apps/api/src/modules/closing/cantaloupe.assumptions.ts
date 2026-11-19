/**
 * Supuestos de la conciliación de Cantaloupe (spec 023) que **no están validados con la contadora**. Se tomaron del
 * Excel de ejemplo y viven aquí, juntos, para cambiarlos a mano sin tocar la lógica (`cantaloupe.rules.ts` los recibe
 * como parámetros). Pendiente: `docs/pendientes-de-verificar.md`. La comisión (3.4 %) está en `Company.cantaloupeRate`.
 */

/** IVA de la comisión, en diezmilésimas (1600 = 16 %). */
export const CANTALOUPE_VAT_BP = 1600;

/** Diferencia máxima, en centavos, para dar un día por conciliado. */
export const CANTALOUPE_TOLERANCE_CENTS = 50;

/** Días en que el banco abona (0 = domingo … 6 = sábado): lunes a viernes, sin festivos. */
export const BANK_BUSINESS_DAYS: readonly number[] = [1, 2, 3, 4, 5];
