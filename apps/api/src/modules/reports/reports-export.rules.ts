import {
  UNCLASSIFIED_LINE,
  type EdoResRowDto,
  type KioskReportDto,
  type SupplierRowDto,
} from '@mimark/contracts/reports';
import { signedMoneyToCents } from '../closing/closing-checks.rules.js';
import { indexCategories, lineOf, type ReportCategory, type ReportEntry } from './reports.rules.js';

/** Una hoja del libro de exportación; coincide con lo que escribe `SpreadsheetClient.write`. */
export interface ExportSheet {
  name: string;
  rows: (string | number | null)[][];
}

export interface ExportInput {
  edo: readonly EdoResRowDto[];
  kiosks: Pick<KioskReportDto, 'rows' | 'overhead' | 'unclassified' | 'totals'>;
  suppliers: readonly SupplierRowDto[];
  entries: readonly (ReportEntry & {
    kioskName: string | null;
    accountName: string | null;
    fileName: string | null;
  })[];
  categories: readonly ReportCategory[];
}

const num = (money: string) => signedMoneyToCents(money) / 100;

/** Las hojas del libro de exportación: EDO RES, Kioskos, Proveedores y Movimientos (AC-024-14). */
export function exportSheets(input: ExportInput): ExportSheet[] {
  const compare = input.edo.some((r) => r.previousAmount !== undefined);
  const index = indexCategories(input.categories);
  const { totals } = input.kiosks;
  return [
    {
      name: 'EDO RES',
      rows: [
        ['Renglón', 'Importe', '% de ventas', ...(compare ? ['Mes anterior', 'Diferencia'] : [])],
        ...input.edo.map((r) => [
          r.label,
          num(r.amount),
          r.percentOfSales === null ? null : Number(r.percentOfSales),
          ...(compare ? [num(r.previousAmount ?? '0.00'), num(r.delta ?? '0.00')] : []),
        ]),
      ],
    },
    {
      name: 'Kioskos',
      rows: [
        [
          'Kiosko',
          'Ventas',
          'Costo',
          'Margen',
          '% margen',
          'Mermas',
          'Robos',
          'Comisiones',
          'Utilidad antes de gastos generales',
        ],
        ...input.kiosks.rows.map((r) => [
          r.name,
          num(r.sales),
          num(r.cost),
          num(r.margin),
          r.marginPercent === null ? null : Number(r.marginPercent),
          num(r.waste),
          num(r.theft),
          num(r.commissions),
          num(r.profitBeforeOverhead),
        ]),
        [
          'Total',
          num(totals.sales),
          num(totals.cost),
          num(totals.margin),
          null,
          num(totals.waste),
          num(totals.theft),
          num(totals.commissions),
          num(totals.profitBeforeOverhead),
        ],
        [
          'Gastos generales (sin asignar)',
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          num(input.kiosks.overhead),
        ],
        [
          UNCLASSIFIED_LINE,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          num(input.kiosks.unclassified),
        ],
      ],
    },
    {
      name: 'Proveedores',
      rows: [
        [
          'Proveedor',
          'Pago total',
          'Pagos',
          'Ticket promedio',
          '% del gasto',
          'Primer pago',
          'Último pago',
        ],
        ...input.suppliers.map((r) => [
          r.name,
          num(r.total),
          r.count,
          num(r.average),
          Number(r.percentOfSpend),
          r.firstPaymentOn,
          r.lastPaymentOn,
        ]),
      ],
    },
    {
      name: 'Movimientos',
      rows: [
        [
          'Fecha',
          'Concepto',
          'Kiosko',
          'Cuenta',
          'Categoría',
          'Renglón',
          'Importe',
          'Origen',
          'Fila',
        ],
        ...input.entries.map((e) => [
          e.date,
          e.concept,
          e.kioskName,
          e.accountName,
          (e.categoryId && index.get(e.categoryId)?.name) || null,
          lineOf(e, index) ?? 'Fuera de los reportes',
          e.cents / 100,
          e.fileName,
          e.rowNumber,
        ]),
      ],
    },
  ];
}
