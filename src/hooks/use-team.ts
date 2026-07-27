import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ativação de convite de equipe.
 *
 * O modelo antigo de equipe por órgão de execução (listar_equipe,
 * listar_convites_equipe, criar_convite_equipe e afins) foi removido: o eixo do
 * sistema passou a ser o Defensor Público. A gestão de equipe vive em
 * `@/features/team/defender-bonds` (vínculos Membro↔Defensor) e em
 * `@/features/team/defender-access-requests` (solicitações de acesso).
 *
 * Os dois hooks abaixo permanecem apenas para concluir convites já emitidos
 * antes dessa mudança.
 */

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
