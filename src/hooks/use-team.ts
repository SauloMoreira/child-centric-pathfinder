import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TeamMember = {
  user_id: string;
  nome_completo: string | null;
  email: string;
  matricula: string | null;
  funcao_interna: string | null;
  outra_funcao: string | null;
  telefone: string | null;
  status: "aguardando_dados" | "aguardando_aprovacao" | "ativo" | "suspenso" | "inativo";
  ativo: boolean;
  membership_id: string;
  vinculado_em: string;
  ultimo_acesso: string | null;
  orgao_id: string;
};

export type TeamInvitation = {
  id: string;
  orgao_execucao_id: string;
  email: string;
  nome_completo: string;
  matricula: string | null;
  funcao_interna: string;
  outra_funcao: string | null;
  telefone: string | null;
  status: "preparando" | "enviado" | "aceito" | "expirado" | "cancelado" | "falhou";
  invited_by: string;
  sent_at: string | null;
  expires_at: string;
  resend_count: number;
  created_at: string;
};

export function useTeamMembers(orgaoId?: string | null) {
  return useQuery({
    queryKey: ["team-members", orgaoId ?? "own"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_equipe", {
        p_orgao_id: orgaoId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
    staleTime: 15_000,
  });
}

export function useTeamInvitations(orgaoId?: string | null) {
  return useQuery({
    queryKey: ["team-invitations", orgaoId ?? "own"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_convites_equipe", {
        p_orgao_id: orgaoId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as TeamInvitation[];
    },
    staleTime: 15_000,
  });
}

export function useInviteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nomeCompleto: string;
      email: string;
      matricula?: string;
      funcaoInterna: string;
      outraFuncao?: string;
      telefone?: string;
      orgaoId?: string | null;
      justificativa?: string | null;
    }) => {
      const idempotencyKey = crypto.randomUUID();
      const redirectTo = `${window.location.origin}/ativar-convite`;
      const { data, error } = await supabase.functions.invoke(
        "invite-team-member",
        {
          body: {
            ...input,
            idempotencyKey,
            redirectTo,
          },
        },
      );
      if (error) {
        // supabase.functions.invoke embrulha erros HTTP; extrair corpo
        let bodyMsg = "";
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            const parsed = await ctx.json();
            bodyMsg = parsed?.error ?? parsed?.message ?? "";
          }
        } catch {
          // ignore
        }
        throw new Error(bodyMsg || error.message || "INTERNAL_ERROR");
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-invitations"] });
      qc.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase.rpc("reenviar_convite_equipe", {
        p_invitation_id: invitationId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-invitations"] }),
  });
}

export function useCancelInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; motivo: string }) => {
      const { data, error } = await supabase.rpc("cancelar_convite_equipe", {
        p_invitation_id: input.id,
        p_motivo: input.motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-invitations"] }),
  });
}

export function useBlockMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; motivo: string }) => {
      const { data, error } = await supabase.rpc("bloquear_membro_equipe", {
        p_user_id: input.userId,
        p_motivo: input.motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

export function useReactivateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; motivo?: string }) => {
      const { data, error } = await supabase.rpc("reativar_membro_equipe", {
        p_user_id: input.userId,
        p_motivo: input.motivo ?? "reativacao_administrativa",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

export function useEndMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; motivo: string }) => {
      const { data, error } = await supabase.rpc("encerrar_vinculo_membro", {
        p_user_id: input.userId,
        p_motivo: input.motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      nomeCompleto: string;
      matricula?: string;
      telefone?: string;
      funcaoInterna: string;
      outraFuncao?: string;
    }) => {
      const { data, error } = await supabase.rpc("atualizar_membro_equipe", {
        p_user_id: input.userId,
        p_nome_completo: input.nomeCompleto,
        p_matricula: input.matricula ?? null,
        p_telefone: input.telefone ?? null,
        p_funcao_interna: input.funcaoInterna,
        p_outra_funcao: input.outraFuncao ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

export function useChangeDefenderOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      newOrgaoId: string;
      expectedCurrentMembershipId: string;
    }) => {
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await supabase.rpc(
        "defensor_alterar_orgao_ativo",
        {
          p_new_orgao_id: input.newOrgaoId,
          p_expected_current_membership_id: input.expectedCurrentMembershipId,
          p_idempotency_key: idempotencyKey,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estado-institucional"] });
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["team-invitations"] });
    },
  });
}

export function useMyPendingInvitation() {
  return useQuery({
    queryKey: ["my-pending-invitation"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("meu_convite_pendente");
      if (error) throw error;
      return data as {
        id: string;
        nome_completo: string;
        funcao_interna: string;
        email: string;
        expires_at: string;
        expirado: boolean;
        orgao: { id: string; nome: string; comarca: string | null };
      } | null;
    },
    staleTime: 5_000,
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { aceiteTermos: boolean }) => {
      const { data, error } = await supabase.rpc("completar_onboarding_equipe", {
        p_aceite_termos: input.aceiteTermos,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estado-institucional"] });
      qc.invalidateQueries({ queryKey: ["my-pending-invitation"] });
    },
  });
}
