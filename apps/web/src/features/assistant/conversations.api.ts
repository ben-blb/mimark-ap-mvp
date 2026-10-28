import {
  ConversationDto,
  ConversationList,
  type SaveConversationInput,
} from '@mimark/contracts/conversations';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

/** Query keys y llamadas de las conversaciones guardadas (spec 011). */
export const conversationKeys = {
  all: ['conversations'] as const,
  list: ['conversations', 'list'] as const,
};

export function useConversations() {
  return useQuery({
    queryKey: conversationKeys.list,
    queryFn: () => api.get('/conversations', ConversationList),
  });
}

/** La conversación completa; se lee una vez al abrirla (no se refresca: la página es la dueña del estado). */
export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: [...conversationKeys.all, 'detail', id] as const,
    queryFn: () => api.get(`/conversations/${id}`, ConversationDto),
    enabled: !!id,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
}

export function useSaveConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: SaveConversationInput }) =>
      api.put(`/conversations/${args.id}`, args.input, ConversationDto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationKeys.list }),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/conversations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationKeys.list }),
  });
}
