import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { Me } from '../lib/types';

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/api/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 15_000,
  });
}

/** Usuário autenticado garantido (usado dentro do layout protegido). */
export function useSession(): Me {
  const { data } = useMe();
  if (!data) throw new Error('Sessão ausente');
  return data;
}
