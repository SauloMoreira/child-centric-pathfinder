// Domínio: solicitações de acesso Membro → Defensor Público.
// O membro não cria vínculo diretamente: solicita, e o Defensor aprova/recusa.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defenderBondsKeys } from "@/features/team/defender-bonds";

// ---------- Tipos ----------

export type DefenderCandidate = {
  defensorUserId: string;
  displayName: string;
  institutionalLabel: string | null;
  hasActiveBond: boolean;
  hasPendingRequest: boolean;
};

export type PendingRequestForDefender = {
  requestId: string;
  memberUserId: string;
  displayName: string;
  email: string;
  message: string | null;
  createdAt: string;
  optimisticVersion: number;
};

export type MyPendingRequest = {
  requestId: string;
  defensorUserId: string;
  defensorName: string;
  status: "pendente";
  createdAt: string;
  reviewedAt: string | null;
};

// ---------- Query keys ----------

export const accessRequestKeys = {
  defenderCandidates: (termo: string) =>
    ["access-requests", "defender-candidates", termo] as const,
  pendingForDefender: ["access-requests", "pending-for-defender"] as const,
  minePending: ["access-requests", "mine-pending"] as const,
};

// ---------- Hooks ----------

export function useDefenderCandidates(termo: string, enabled = true) {
  return useQuery<DefenderCandidate[]>({
    queryKey: accessRequestKeys.defenderCandidates(termo),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "buscar_defensores_para_solicitacao" as never,
        { p_termo: termo || null } as never,
      );
      if (error) throw error;
      return (data as { ok: true; items: DefenderCandidate[] }).items;
    },
    staleTime: 15_000,
  });
}

export function usePendingRequestsForDefender(
  options?: Omit<UseQueryOptions<PendingRequestForDefender[]>, "queryKey" | "queryFn">,
) {
  return useQuery<PendingRequestForDefender[]>({
    queryKey: accessRequestKeys.pendingForDefender,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "listar_solicitacoes_defensor_pendentes" as never,
      );
      if (error) throw error;
      return (data as { ok: true; items: PendingRequestForDefender[] }).items;
    },
    staleTime: 15_000,
    ...options,
  });
}

export function useMyPendingRequests() {
  return useQuery<MyPendingRequest[]>({
    queryKey: accessRequestKeys.minePending,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "listar_minhas_solicitacoes_defensor" as never,
      );
      if (error) throw error;
      return (data as { ok: true; items: MyPendingRequest[] }).items;
    },
    staleTime: 15_000,
  });
}

export function useRequestDefenderAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { defensorUserId: string; message?: string | null }) => {
      const { data, error } = await supabase.rpc(
        "solicitar_acesso_defensor" as never,
        {
          p_defensor_user_id: input.defensorUserId,
          p_message: input.message ?? null,
          p_idempotency_key: crypto.randomUUID(),
        } as never,
      );
      if (error) throw error;
      return data as { ok: true; code: string; requestId: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accessRequestKeys.minePending });
      qc.invalidateQueries({ queryKey: ["access-requests", "defender-candidates"] });
      qc.invalidateQueries({ queryKey: defenderBondsKeys.availableDefenders });
    },
  });
}

export function useApproveAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; expectedVersion: number }) => {
      const { data, error } = await supabase.rpc(
        "aprovar_solicitacao_acesso_defensor" as never,
        {
          p_request_id: input.requestId,
          p_expected_version: input.expectedVersion,
          p_idempotency_key: crypto.randomUUID(),
        } as never,
      );
      if (error) throw error;
      return data as { ok: true; requestId: string; bondId: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accessRequestKeys.pendingForDefender });
      qc.invalidateQueries({ queryKey: defenderBondsKeys.availableDefenders });
      qc.invalidateQueries({ queryKey: ["defender-bonds", "team"] });
    },
  });
}

export function useRejectAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      expectedVersion: number;
      reason?: string | null;
    }) => {
      const { data, error } = await supabase.rpc(
        "recusar_solicitacao_acesso_defensor" as never,
        {
          p_request_id: input.requestId,
          p_expected_version: input.expectedVersion,
          p_reason: input.reason ?? null,
          p_idempotency_key: crypto.randomUUID(),
        } as never,
      );
      if (error) throw error;
      return data as { ok: true; requestId: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accessRequestKeys.pendingForDefender });
    },
  });
}
