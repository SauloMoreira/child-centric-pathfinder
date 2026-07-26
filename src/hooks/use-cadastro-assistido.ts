import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CadastroResult =
  | { ok: true; code: "ASSISTIDO_CREATED"; id: string; categoria: "crianca_adolescente" | "adulto"; correlationId: string }
  | { ok: false; code: "POSSIBLE_DUPLICATE_ASSISTIDO"; candidates: Array<{ id: string; nome: string; data_nascimento: string; categoria: string }> }
  | { ok: false; code: "CPF_ALREADY_EXISTS"; existingAssistidoId: string };

async function callRpc(fn: "cadastrar_assistido_crianca" | "cadastrar_assistido_adulto", payload: unknown): Promise<CadastroResult> {
  const { data, error } = await supabase.rpc(fn, { p_payload: payload as never });
  if (error) throw error;
  return data as unknown as CadastroResult;
}

export function useCadastrarCrianca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) => callRpc("cadastrar_assistido_crianca", payload),
    onSuccess: (r) => {
      if (r.ok) {
        qc.invalidateQueries({ queryKey: ["workspace"] });
        qc.invalidateQueries({ queryKey: ["buscar-assistidos"] });
        qc.invalidateQueries({ queryKey: ["workspace-column"] });
      }
    },
  });
}

export function useCadastrarAdulto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) => callRpc("cadastrar_assistido_adulto", payload),
    onSuccess: (r) => {
      if (r.ok) {
        qc.invalidateQueries({ queryKey: ["workspace"] });
        qc.invalidateQueries({ queryKey: ["buscar-assistidos"] });
        qc.invalidateQueries({ queryKey: ["workspace-column"] });
      }
    },
  });
}
