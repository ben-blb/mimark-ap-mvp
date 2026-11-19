import {
  CantaloupeList,
  CheckList,
  ClassifyAndRuleResult,
  ClassifyResultDto,
  PeriodDto,
  PeriodList,
  ReviewList,
  TransferDto,
  type ClassifyAndRuleInput,
  type ReviewQuery,
} from '@mimark/contracts/closing-review';
import { LedgerEntryDto, type Month } from '@mimark/contracts/closing-uploads';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from '../../lib/api-client';

/** Clasificación, conciliación y cuadres del cierre (spec 023). Los componentes no hacen fetch. */
export const usePeriod = (companyId: string, month: Month) =>
  useQuery({
    queryKey: ['closing', 'period', { companyId, month }],
    queryFn: () => api.get(`/closing/periods${toQuery({ companyId, month })}`, PeriodList),
    enabled: companyId !== '',
    select: (list) => list.items[0] ?? null,
  });

export const useReview = (query: Partial<ReviewQuery> & { periodId: string }) =>
  useQuery({
    queryKey: ['closing', 'review', query],
    queryFn: () => api.get(`/closing/review${toQuery(query)}`, ReviewList),
    enabled: query.periodId !== '',
  });

export const useChecks = (periodId: string) =>
  useQuery({
    queryKey: ['closing', 'checks', periodId],
    queryFn: () => api.get(`/closing/periods/${periodId}/checks`, CheckList),
    enabled: periodId !== '',
  });

export const useCantaloupe = (periodId: string) =>
  useQuery({
    queryKey: ['closing', 'cantaloupe', periodId],
    queryFn: () => api.get(`/closing/periods/${periodId}/cantaloupe`, CantaloupeList),
    enabled: periodId !== '',
  });

/** Toda escritura del cierre invalida lo del cierre: cola, cuadres y conciliación se leen siempre frescos. */
function useClosingMutation<I, O>(run: (input: I) => Promise<O>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['closing'] }),
  });
}

export const useClassifyPeriod = () =>
  useClosingMutation((periodId: string) =>
    api.post(`/closing/periods/${periodId}/classify`, {}, ClassifyResultDto),
  );

export const useClassifyEntry = () =>
  useClosingMutation((input: { id: string; categoryId: string }) =>
    api.patch(`/closing/entries/${input.id}`, { categoryId: input.categoryId }, LedgerEntryDto),
  );

export const useClassifyAndRule = () =>
  useClosingMutation((input: { id: string } & ClassifyAndRuleInput) =>
    api.post(
      `/closing/entries/${input.id}/classify-and-rule`,
      { categoryId: input.categoryId, pattern: input.pattern },
      ClassifyAndRuleResult,
    ),
  );

export const useConfirmTransfer = () =>
  useClosingMutation((entryIds: [string, string]) =>
    api.post('/closing/transfers', { entryIds }, TransferDto),
  );

export const useClosePeriod = () =>
  useClosingMutation((periodId: string) =>
    api.post(`/closing/periods/${periodId}/close`, {}, PeriodDto),
  );

export const useReopenPeriod = () =>
  useClosingMutation((input: { periodId: string; reason: string }) =>
    api.post(`/closing/periods/${input.periodId}/reopen`, { reason: input.reason }, PeriodDto),
  );
