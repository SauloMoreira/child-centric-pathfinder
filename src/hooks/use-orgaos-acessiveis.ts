import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrgaoAcessivel = {
  orgaoId: string;
  nome: string;
  comarcas: Array<{ nome: string | null; principal: boolean }>;
  membershipId: string | null;
  dataInicio?: string | null;
  selecionado: boolean;
};

type Page = { items: OrgaoAcessivel[]; nextCursor: string | null };

export function useOrgaosAcessiveis(termo: string, enabled = true) {
  return useInfiniteQuery<Page>({
    queryKey: ["orgaos-acessiveis", termo],
    enabled,
    staleTime: 15_000,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("listar_orgaos_acessiveis", {
        p_termo: termo || undefined,
        p_cursor: (pageParam as string | null) ?? undefined,
        p_limit: 20,
      });
      if (error) throw error;
      const d = data as unknown as Page;
      return { items: d.items ?? [], nextCursor: d.nextCursor ?? null };
    },
  });
}
