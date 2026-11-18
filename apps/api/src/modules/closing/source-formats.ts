import type { Source } from '@mimark/contracts/closing-uploads';

/**
 * Columnas de cada tipo de archivo (spec 021): una tabla de datos, no lógica. Son una propuesta basada en el archivo
 * de ejemplo hasta tener un mes real de cada export (SRS §9.1–9.2): para soportar otro nombre se agrega a `names`.
 * `names` van ya normalizados (minúsculas, sin acentos); `label` es como se le muestra a la persona.
 */
export interface ColumnDef {
  label: string;
  names: string[];
  required: boolean;
}

const col = (label: string, names: string[], required = true): ColumnDef => ({
  label,
  names,
  required,
});

const date = col('Date', ['date', 'fecha']);

export const SOURCE_FORMATS: Record<Source, Record<string, ColumnDef>> = {
  // Kiosko por `Asset`. La comisión y el costo, si vienen, se guardan en `meta`.
  parlevel_sales: {
    asset: col('Asset', ['asset']),
    date,
    sales: col('Sales', ['sales', 'ventas', 'total sales']),
    commission: col('Commission', ['commission', 'comision'], false),
    cost: col('Cost', ['cost', 'costo'], false),
  },
  parlevel_waste: {
    asset: col('Asset', ['asset']),
    date,
    type: col('Type', ['type', 'tipo']),
    amount: col('Amount', ['amount', 'monto', 'value', 'valor']),
  },
  // Kiosko por `Device ID`.
  cantaloupe: {
    device: col('Device ID', ['device id', 'deviceid', 'device']),
    date,
    amount: col('Amount', ['amount', 'sales', 'ventas', 'total']),
    transactions: col('Transactions', ['transactions', 'transacciones'], false),
    discountRate: col('Discount Rate', ['discount rate', 'tasa de descuento'], false),
    vat: col('VAT', ['vat', 'iva'], false),
  },
  bank_csv: {
    date: col('Fecha', ['fecha', 'date']),
    concept: col('Concepto', ['concepto', 'descripcion', 'description']),
    withdrawals: col('Retiros', ['retiros', 'cargos', 'withdrawals']),
    deposits: col('Depósitos', ['depositos', 'abonos', 'deposits']),
  },
  cash: {
    date: col('Fecha', ['fecha', 'date']),
    concept: col('Concepto', ['concepto', 'description']),
    amount: col('Monto', ['monto', 'amount']),
    kind: col('Tipo', ['tipo', 'entrada/salida']),
  },
  payroll: {
    date: col('Fecha', ['fecha', 'date']),
    name: col('Nombre', ['nombre', 'name']),
    amount: col('Monto', ['monto', 'amount']),
    imss: col('IMSS', ['imss'], false),
  },
};
