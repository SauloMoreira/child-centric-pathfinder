// Domínio: vínculos Membro ↔ Defensor + contexto do Defensor selecionado.
// Nenhum vínculo artificial é criado para o Administrador Técnico:
// a autorização técnica decorre exclusivamente do papel admin_tecnico.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---------- Tipos DTO ----------

export type AvailableDefender = {
  defenderUserId: string;
  displayName: string;
  institutionalLabel: string | null;
  isCurrentContext: boolean;
};

export type AvailableDefendersResponse = {
  ok: true;
  mode: "technical" | "member" | "owner" | "none";
  items: AvailableDefender[];
};

export type CandidateMember = {
  userId: string;
  displayName: string;
  email: string;
  alreadyBoundToMe: boolean;
};

export type DefenderBond = {
  bondId: string;
  memberUserId: string;
  displayName: string;
  email: string;
  status: "ativo" | "encerrado";
  createdAt: string;
  endedAt: string | null;
  optimisticVersion: number;
};

export type DefenderTeam = {
  ok: true;
  defenderUserId: string;
  accessMode: "owner" | "technical_readonly";
  canLinkMembers: boolean;
  canEndBonds: boolean;
  members: DefenderBond[];
};

// ---------- Query keys ----------

export const defenderBondsKeys = {
  availableDefenders: ["defender-bonds", "available"] as const,
  team: (defenderUserId: string) =>
    ["defender-bonds", "team", defenderUserId] as const,
  candidateMembers: (termo: string) =>
    ["defender-bonds", "candidates", termo] as const,
};

// ---------- Hooks ----------

export function useAvailableDefenders(
  options?: Omit<UseQueryOptions<AvailableDefendersResponse>, "queryKey" | "queryFn">,
) {
  return useQuery<AvailableDefendersResponse>({
    queryKey: defenderBondsKeys.availableDefenders,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "listar_defensores_disponiveis_contexto" as never,
      );
      if (error) throw error;
      return data as AvailableDefendersResponse;
    },
    staleTime: 30_000,
    ...options,
  });
}

export function useDefenderTeam(defenderUserId: string | null | undefined) {
  return useQuery<DefenderTeam>({
    queryKey: defenderUserId
      ? defenderBondsKeys.team(defenderUserId)
      : ["defender-bonds", "team", "none"],
    enabled: !!defenderUserId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_membros_do_defensor", {
        p_defensor_user_id: defenderUserId!,
      } as never);
      if (error) throw error;
      return data as DefenderTeam;
    },
    staleTime: 15_000,
  });
}

export function useSearchCandidateMembers(termo: string, enabled: boolean) {
  return useQuery({
    queryKey: defenderBondsKeys.candidateMembers(termo),
    enabled: enabled && termo.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "buscar_usuarios_membro_equipe",
        { p_termo: termo } as never,
      );
      if (error) throw error;
      return (data as { ok: true; items: CandidateMember[] }).items;
    },
    staleTime: 5_000,
  });
}

export function useLinkMember(defenderUserId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberUserId: string) => {
      const { data, error } = await supabase.rpc(
        "vincular_membro_defensor",
        {
          p_member_user_id: memberUserId,
          p_idempotency_key: crypto.randomUUID(),
        } as never,
      );
      if (error) throw error;
      return data as {
        ok: true;
        code: "MEMBERSHIP_CREATED";
        bondId: string;
        optimisticVersion: number;
      };
    },
    onSuccess: () => {
      if (defenderUserId) {
        qc.invalidateQueries({
          queryKey: defenderBondsKeys.team(defenderUserId),
        });
      }
      qc.invalidateQueries({ queryKey: defenderBondsKeys.availableDefenders });
    },
  });
}

export function useEndBond(defenderUserId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bondId: string; expectedVersion: number }) => {
      const { data, error } = await supabase.rpc(
        "encerrar_member_defensor_bond",
        {
          p_bond_id: input.bondId,
          p_expected_version: input.expectedVersion,
          p_reason: "Encerrado pelo Defensor via Minha equipe.",
          p_idempotency_key: crypto.randomUUID(),
        } as never,
      );
      if (error) throw error;
      return data as {
        ok: true;
        bondId: string;
        optimisticVersion: number;
      };
    },
    onSuccess: () => {
      if (defenderUserId) {
        qc.invalidateQueries({
          queryKey: defenderBondsKeys.team(defenderUserId),
        });
      }
      qc.invalidateQueries({ queryKey: defenderBondsKeys.availableDefenders });
    },
  });
}

export function useSelectDefenderContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (defenderUserId: string) => {
      const { data, error } = await supabase.rpc(
        "selecionar_contexto_defensor",
        {
          p_defensor_user_id: defenderUserId,
          p_idempotency_key: crypto.randomUUID(),
        } as never,
      );
      if (error) throw error;
      return data as { ok: true; defenderUserId: string; mode: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: defenderBondsKeys.availableDefenders });
      qc.invalidateQueries({ queryKey: ["work-area"] });
      qc.invalidateQueries({ queryKey: ["ws"] });
      qc.invalidateQueries({ queryKey: ["estado-institucional"] });
    },
  });
}

/**
 * Retorna o Defensor atualmente selecionado como contexto pelo caller,
 * derivado do payload público. Fonte única: `listar_defensores_disponiveis_contexto`.
 */
export function useCurrentDefenderContext() {
  const q = useAvailableDefenders();
  const current = q.data?.items.find((d) => d.isCurrentContext) ?? null;
  return {
    ...q,
    mode: q.data?.mode ?? "none",
    current,
    items: q.data?.items ?? [],
  };
}
