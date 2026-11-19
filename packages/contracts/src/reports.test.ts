import { describe, expect, it } from 'vitest';
import {
  DrillDto,
  DrillQuery,
  EdoResDto,
  EdoResQuery,
  KioskReportDto,
  REPORT_STATUSES,
  SupplierReportDto,
  UNCLASSIFIED_LINE,
} from './reports.js';

const row = {
  key: 'net_sales',
  label: 'Ventas netas',
  kind: 'subtotal',
  line: null,
  amount: '463989.77',
  percentOfSales: '100.00',
};

describe('contratos de reportes del cierre (spec 024)', () => {
  it('AC-024-01 el EDO RES lleva renglones con importe con signo y porcentaje sobre ventas', () => {
    const dto = {
      companyId: 'c1',
      month: '2026-09',
      status: 'provisional',
      compareTo: null,
      rows: [
        row,
        { ...row, key: 'Mermas', label: 'Mermas', kind: 'line', line: 'Mermas', amount: '-12.50' },
        {
          ...row,
          key: 'unclassified',
          kind: 'line',
          line: UNCLASSIFIED_LINE,
          percentOfSales: null,
        },
      ],
    };
    expect(EdoResDto.safeParse(dto).success).toBe(true);
    expect(EdoResDto.safeParse({ ...dto, rows: [{ ...row, line: 'Otro' }] }).success).toBe(false);
  });

  it('AC-024-02 y AC-024-04 el estado del reporte es empty, provisional o final', () => {
    expect([...REPORT_STATUSES]).toEqual(['empty', 'provisional', 'final']);
    const base = { companyId: 'c1', month: '2026-09', compareTo: null, rows: [] };
    for (const status of REPORT_STATUSES) {
      expect(EdoResDto.safeParse({ ...base, status }).success).toBe(true);
    }
    expect(EdoResDto.safeParse({ ...base, status: 'closed' }).success).toBe(false);
  });

  it('AC-024-05 el comparativo es opcional y un valor vacío es «sin comparar»', () => {
    const ok = { companyId: 'c1', month: '2026-09' };
    expect(EdoResQuery.safeParse(ok).data?.compareTo).toBeUndefined();
    expect(EdoResQuery.safeParse({ ...ok, compareTo: '' }).data?.compareTo).toBeUndefined();
    expect(EdoResQuery.safeParse({ ...ok, compareTo: '2026-08' }).data?.compareTo).toBe('2026-08');
    expect(EdoResQuery.safeParse({ ...ok, compareTo: '2026-8' }).success).toBe(false);
    const withPrevious = { ...row, previousAmount: '400000.00', delta: '63989.77' };
    expect(
      EdoResDto.safeParse({
        companyId: 'c1',
        month: '2026-09',
        status: 'final',
        compareTo: '2026-08',
        rows: [withPrevious],
      }).success,
    ).toBe(true);
  });

  it('AC-024-06 el detalle valida la consulta y trae subtotales por categoría y origen por movimiento', () => {
    const query = { companyId: 'c1', month: '2026-09' };
    expect(DrillQuery.parse(query)).toMatchObject({ page: 1, pageSize: 100 });
    expect(DrillQuery.safeParse({ ...query, pageSize: '501' }).success).toBe(false);
    const dto = {
      line: 'Rentas',
      amount: '300.00',
      categories: [{ code: 'RENTAS', name: 'Rentas', amount: '300.00', count: 2 }],
      items: [
        {
          id: 'e1',
          date: '2026-09-03',
          concept: '=HYPERLINK("x")',
          kioskId: null,
          kioskName: null,
          accountId: 'a1',
          accountName: 'BBVA',
          categoryCode: 'RENTAS',
          amount: '300.00',
          uploadId: 'u1',
          fileName: 'banco.csv',
          rowNumber: 4,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    };
    expect(DrillDto.safeParse(dto).success).toBe(true);
  });

  it('AC-024-09 el reporte de kioskos trae filas, gastos generales y totales', () => {
    const money = '10.00';
    const totals = {
      sales: money,
      cost: money,
      margin: money,
      waste: money,
      theft: money,
      commissions: money,
      profitBeforeOverhead: money,
    };
    const dto = {
      companyId: 'c1',
      month: '2026-09',
      status: 'final',
      rows: [
        {
          kioskId: 'k1',
          name: 'Kiosko 1',
          ...totals,
          marginPercent: '39.25',
          negativeMargin: false,
        },
        {
          kioskId: null,
          name: 'Sin kiosko',
          ...totals,
          marginPercent: null,
          negativeMargin: false,
        },
      ],
      overhead: '-5.00',
      unclassified: '0.00',
      totals,
    };
    expect(KioskReportDto.safeParse(dto).success).toBe(true);
    expect(KioskReportDto.safeParse({ ...dto, overhead: undefined }).success).toBe(false);
  });

  it('AC-024-12 el reporte de proveedores trae pago total, número, promedio, % y fechas', () => {
    const dto = {
      companyId: 'c1',
      month: '2026-09',
      status: 'final',
      totalSpend: '1000.00',
      rows: [
        {
          name: 'COCA COLA',
          total: '1000.00',
          count: 4,
          average: '250.00',
          percentOfSpend: '100.00',
          firstPaymentOn: '2026-09-02',
          lastPaymentOn: '2026-09-28',
        },
      ],
    };
    expect(SupplierReportDto.safeParse(dto).success).toBe(true);
    expect(
      SupplierReportDto.safeParse({ ...dto, rows: [{ ...dto.rows[0], count: 1.5 }] }).success,
    ).toBe(false);
  });
});
