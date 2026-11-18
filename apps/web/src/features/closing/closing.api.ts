import {
  BankAccountDto,
  BankAccountList,
  CategoryDto,
  CategoryList,
  CompanyDto,
  CompanyList,
  KioskDto,
  KioskList,
  RuleDto,
  RuleList,
  TestRuleResult,
} from '@mimark/contracts/closing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from '../../lib/api-client';

/** Query keys y llamadas del catálogo del cierre (spec 020). Los componentes no hacen fetch. */
const key = (resource: string, includeInactive = false) =>
  ['closing', resource, { includeInactive }] as const;
const inactive = (includeInactive: boolean) => toQuery({ includeInactive });

export const useCompanies = (includeInactive: boolean) =>
  useQuery({
    queryKey: key('companies', includeInactive),
    queryFn: () => api.get(`/closing/companies${inactive(includeInactive)}`, CompanyList),
  });

export const useKiosks = (includeInactive: boolean) =>
  useQuery({
    queryKey: key('kiosks', includeInactive),
    queryFn: () => api.get(`/closing/kiosks${inactive(includeInactive)}`, KioskList),
  });

export const useAccounts = (includeInactive: boolean) =>
  useQuery({
    queryKey: key('accounts', includeInactive),
    queryFn: () => api.get(`/closing/accounts${inactive(includeInactive)}`, BankAccountList),
  });

export const useCategories = () =>
  useQuery({
    queryKey: key('categories'),
    queryFn: () => api.get('/closing/categories', CategoryList),
  });

export const useRules = (includeInactive: boolean) =>
  useQuery({
    queryKey: key('rules', includeInactive),
    queryFn: () => api.get(`/closing/rules${inactive(includeInactive)}`, RuleList),
  });

const DTOS = {
  companies: CompanyDto,
  kiosks: KioskDto,
  accounts: BankAccountDto,
  categories: CategoryDto,
  rules: RuleDto,
};
export type CatalogResource = keyof typeof DTOS;

/** Alta (sin `id`) o edición (con `id`) de cualquier recurso del catálogo. */
export function useSaveCatalogItem(resource: CatalogResource, id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      id
        ? api.patch(`/closing/${resource}/${id}`, input, DTOS[resource])
        : api.post(`/closing/${resource}`, input, DTOS[resource]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['closing'] }),
  });
}

/** Prueba un concepto contra las reglas activas; no escribe nada. */
export function useTestRule() {
  return useMutation({
    mutationFn: (concept: string) => api.post('/closing/rules/test', { concept }, TestRuleResult),
  });
}
