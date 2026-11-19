import {
  BankStatementDraft,
  type BankRowEdit,
  UploadDto,
  UploadList,
  UploadPreviewDto,
  type Month,
} from '@mimark/contracts/closing-uploads';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from '../../lib/api-client';

/** Cargas de fuentes del mes (spec 021). Los componentes no hacen fetch. */
export const useUploads = (companyId: string, month: Month) =>
  useQuery({
    queryKey: ['closing', 'uploads', { companyId, month }],
    queryFn: () => api.get(`/closing/uploads${toQuery({ companyId, month })}`, UploadList),
    enabled: companyId !== '',
  });

/** Sube el archivo y devuelve la vista previa; todavía no crea movimientos. */
export function useUploadSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.upload('/closing/uploads', form, UploadPreviewDto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['closing', 'uploads'] }),
  });
}

/** Sube el PDF de un estado de cuenta; la IA propone un borrador y todavía no crea movimientos (spec 022). */
export function useUploadBankPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) =>
      api.upload('/closing/uploads/bank-pdf', form, BankStatementDraft),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['closing', 'uploads'] }),
  });
}

export function useEditBankDraft() {
  return useMutation({
    mutationFn: (input: { id: string; rows: BankRowEdit[] }) =>
      api.patch(`/closing/uploads/${input.id}/draft`, { rows: input.rows }, BankStatementDraft),
  });
}

/** `acceptDifference` solo lo usa el estado de cuenta en PDF cuando los saldos no cuadran. */
export function useConfirmUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { id: string; acceptDifference?: boolean }) => {
      const { id, acceptDifference } = typeof input === 'string' ? { id: input } : input;
      return api.post(
        `/closing/uploads/${id}/confirm`,
        acceptDifference ? { acceptDifference } : {},
        UploadDto,
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['closing'] }),
  });
}

export function useDiscardUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/closing/uploads/${id}/discard`, {}, UploadDto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['closing', 'uploads'] }),
  });
}
