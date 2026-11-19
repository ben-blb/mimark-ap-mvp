import { CompanyList } from '@mimark/contracts/closing';
import {
  DrillDto,
  EdoResDto,
  KioskReportDto,
  SupplierReportDto,
  type ReportLine,
} from '@mimark/contracts/reports';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, toQuery } from '../../lib/api-client';

/** Query keys y llamadas de los reportes del cierre (spec 024). Los componentes no hacen fetch. */
const enabled = (companyId: string, month: string) => companyId !== '' && month !== '';

export const useReportCompanies = () =>
  useQuery({
    queryKey: ['reports', 'companies'],
    queryFn: () => api.get('/reports/companies', CompanyList),
  });

export const useEdoRes = (companyId: string, month: string, compareTo: string) =>
  useQuery({
    queryKey: ['reports', 'edo-res', { companyId, month, compareTo }],
    queryFn: () =>
      api.get(`/reports/edo-res${toQuery({ companyId, month, compareTo })}`, EdoResDto),
    enabled: enabled(companyId, month),
    placeholderData: keepPreviousData,
  });

export const useDrill = (line: ReportLine | null, companyId: string, month: string, page: number) =>
  useQuery({
    queryKey: ['reports', 'drill', { line, companyId, month, page }],
    queryFn: () =>
      api.get(
        `/reports/edo-res/lines/${encodeURIComponent(line ?? '')}/entries${toQuery({ companyId, month, page, pageSize: 50 })}`,
        DrillDto,
      ),
    enabled: line !== null && enabled(companyId, month),
    placeholderData: keepPreviousData,
  });

export const useKioskReport = (companyId: string, month: string) =>
  useQuery({
    queryKey: ['reports', 'kiosks', { companyId, month }],
    queryFn: () => api.get(`/reports/kiosks${toQuery({ companyId, month })}`, KioskReportDto),
    enabled: enabled(companyId, month),
    placeholderData: keepPreviousData,
  });

export const useSupplierReport = (companyId: string, month: string) =>
  useQuery({
    queryKey: ['reports', 'suppliers', { companyId, month }],
    queryFn: () => api.get(`/reports/suppliers${toQuery({ companyId, month })}`, SupplierReportDto),
    enabled: enabled(companyId, month),
    placeholderData: keepPreviousData,
  });

/** Descarga directa (la sesión viaja en la cookie): el navegador guarda el `.xlsx`. */
export const exportUrl = (companyId: string, month: string, compareTo: string) =>
  `/api/reports/edo-res/export${toQuery({ companyId, month, compareTo })}`;

export const sourceFileUrl = (uploadId: string) => `/api/reports/uploads/${uploadId}/file`;
