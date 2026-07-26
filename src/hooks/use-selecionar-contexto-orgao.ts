import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Result =
  | {
      ok: true;
      code: "OPERATIONAL_CONTEXT_SELECTED";
      contextoAtual: { orgaoId: string; nome: string };
      version: number;
      correlationId: string;
    }
  | { ok: false; code: string; currentVersion?: number };

const OPERATIONAL_KEYS = [
  "workspace",
  "workspace-column",
  "workspace-search",
  "assistidos-picker",
  "buscar-assistidos",
  "processos",
  "team-members",
  "team-invitations",
  "orgaos-acessiveis",
];

export function useSelecionarContextoOrgao() {
  const qc = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (params: {
      orgaoId: string;
      expectedVersion?: number | null;
    }): Promise<Result> => {
      const idempotencyKey =
        (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Math.random().toString(36).slice(2) as any);
      const { data, error } = await supabase.rpc("selecionar_contexto_orgao", {
        p_orgao_id: params.orgaoId,
        p_expected_version: params.expectedVersion ?? undefined,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data as unknown as Result;
    },
    onSuccess: async (r) => {
      if (!r.ok) {
        const map: Record<string, string> = {
          ORGANIZATION_NOT_ACCESSIBLE:
            "Você não possui vínculo ativo com este órgão.",
          ORGANIZATION_NOT_FOUND: "Órgão não encontrado.",
          PROFILE_INACTIVE: "Sua conta institucional não está ativa.",
          CONCURRENT_CHANGE:
            "O órgão em uso foi alterado em outra janela. Recarregando…",
          UNAUTHENTICATED: "Sessão expirada. Faça login novamente.",
        };
        toast.error(map[r.code] ?? "Não foi possível alterar o órgão em uso.");
        await qc.invalidateQueries({ queryKey: ["estado-institucional"] });
        return;
      }

      // Cancela e remove apenas caches operacionais (preserva estado institucional,
      // catálogos, autenticação e preferências).
      await qc.cancelQueries({
        predicate: (q) =>
          OPERATIONAL_KEYS.includes(String(q.queryKey?.[0] ?? "")),
      });
      qc.removeQueries({
        predicate: (q) =>
          OPERATIONAL_KEYS.includes(String(q.queryKey?.[0] ?? "")),
      });

      await qc.invalidateQueries({ queryKey: ["estado-institucional"] });
      await router.invalidate();

      toast.success(
        `Órgão de trabalho alterado para "${r.contextoAtual.nome}".`,
      );
    },
    onError: () => {
      toast.error("Não foi possível alterar o órgão em uso.");
    },
  });
}
