import {
  type CreateUserInput,
  ResetPasswordOutput,
  type UpdateUserInput,
  UserDto,
  UserList,
} from '@mimark/contracts/users';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export const userKeys = { all: ['users'] as const };

export function useUsers() {
  return useQuery({ queryKey: userKeys.all, queryFn: () => api.get('/users', UserList) });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post('/users', input, UserDto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => api.patch(`/users/${id}`, input, UserDto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/users/${id}/reset-password`, undefined, ResetPasswordOutput),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
