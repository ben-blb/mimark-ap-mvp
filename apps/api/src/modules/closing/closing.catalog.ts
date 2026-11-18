import type { CategoryKind, EdoResLine } from '@mimark/contracts/closing';

/**
 * Categorías iniciales del cierre, una por renglón del EDO RES del archivo de ejemplo (spec 020).
 * Es dato: se ajusta con la contadora y se edita desde la pantalla de catálogo. La usa la semilla.
 */
export const CLOSING_CATEGORIES: readonly {
  code: string;
  name: string;
  edoResLine: EdoResLine;
  kind: CategoryKind;
  sortOrder: number;
}[] = (
  [
    ['VENTAS', 'Ventas', 'Ventas', 'income'],
    ['VENTA_DIRECTA', 'Venta directa', 'Venta directa', 'income'],
    ['OTROS_INGRESOS', 'Otros ingresos', 'Otros ingresos', 'income'],
    ['ROBOS', 'Robos', 'Robos', 'cost'],
    ['MERMAS', 'Mermas', 'Mermas', 'cost'],
    ['COSTO_VENDIDO', 'Costo de lo vendido', 'Costo de lo vendido', 'cost'],
    ['RENTAS', 'Rentas', 'Rentas', 'expense'],
    ['NOMINAS', 'Nóminas', 'Nóminas', 'expense'],
    ['GASOLINA', 'Gasolina', 'Gasolina', 'expense'],
    ['FEE_CANTALOUPE', 'Fee Cantaloupe', 'Fee Cantaloupe', 'expense'],
    ['FEE_NAYAX', 'Fee Nayax', 'Fee Nayax', 'expense'],
    ['TELEMETRIA', 'Telemetría', 'Telemetría', 'expense'],
    ['FEE_SOFTWARE', 'Fee software', 'Fee software', 'expense'],
    ['SERVICIOS', 'Teléfono, internet, luz y agua', 'Teléfono, internet, luz y agua', 'expense'],
    ['SEGURIDAD', 'Seguridad y vigilancia', 'Seguridad y vigilancia', 'expense'],
    ['PAPELERIA_MKT', 'Papelería y MKT', 'Papelería y MKT', 'expense'],
    ['FUMIGACION', 'Fumigación', 'Fumigación', 'expense'],
    ['TARJETAS_CREDITO', 'Tarjetas de crédito', 'Tarjetas de crédito', 'expense'],
    ['CREDITOS', 'Créditos', 'Créditos', 'expense'],
    ['COMISION_BANCARIA', 'Comisión bancaria', 'Comisión bancaria', 'expense'],
    ['INTERESES', 'Intereses', 'Intereses', 'expense'],
    ['IMPUESTOS', 'Impuestos', 'Impuestos', 'expense'],
    ['INVERSIONES', 'Inversiones', 'Inversiones', 'expense'],
    ['NO_DEDUCIBLES', 'No deducibles', 'No deducibles', 'expense'],
  ] as const
).map(([code, name, edoResLine, kind], i) => ({
  code,
  name,
  edoResLine,
  kind,
  sortOrder: (i + 1) * 10,
}));
