import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CadastroResult =
  | { ok: true; code: "ASSISTIDO_CREATED" | "ASSISTIDO_UPDATED"; id: string; categoria: "crianca_adolescente" | "adulto"; correlationId: string }
  | { ok: false; code: "POSSIBLE_DUPLICATE_ASSISTIDO"; candidates: Array<{ id: string; nome: string; data_nascimento: string; categoria: string }> }
  | { ok: false; code: "CPF_ALREADY_EXISTS"; existingAssistidoId: string };

async function callCreate(fn: "cadastrar_assistido_crianca" | "cadastrar_assistido_adulto", payload: unknown): Promise<CadastroResult> {
  const { data, error } = await supabase.rpc(fn, { p_payload: payload as never });
  if (error) throw error;
  return data as unknown as CadastroResult;
}

async function callUpdate(fn: "atualizar_assistido_crianca" | "atualizar_assistido_adulto", assistidoId: string, payload: unknown): Promise<CadastroResult> {
  const { data, error } = await supabase.rpc(fn, {
    p_assistido_id: assistidoId,
    p_payload: payload as never,
  });
  if (error) throw error;
  return data as unknown as CadastroResult;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["workspace"] });
  qc.invalidateQueries({ queryKey: ["buscar-assistidos"] });
  qc.invalidateQueries({ queryKey: ["workspace-column"] });
  qc.invalidateQueries({ queryKey: ["assistido-detalhe"] });
  qc.invalidateQueries({ queryKey: ["assistido-full"] });
  qc.invalidateQueries({ queryKey: ["assistido-vinculos"] });
}

export function useCadastrarCrianca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) => callCreate("cadastrar_assistido_crianca", payload),
    onSuccess: (r) => { if (r.ok) invalidateAll(qc); },
  });
}

export function useCadastrarAdulto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) => callCreate("cadastrar_assistido_adulto", payload),
    onSuccess: (r) => { if (r.ok) invalidateAll(qc); },
  });
}

export function useAtualizarCrianca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { assistidoId: string; payload: unknown }) =>
      callUpdate("atualizar_assistido_crianca", args.assistidoId, args.payload),
    onSuccess: (r) => { if (r.ok) invalidateAll(qc); },
  });
}

export function useAtualizarAdulto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { assistidoId: string; payload: unknown }) =>
      callUpdate("atualizar_assistido_adulto", args.assistidoId, args.payload),
    onSuccess: (r) => { if (r.ok) invalidateAll(qc); },
  });
}

export function useAtualizarAnotacoes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { assistidoId: string; observacoes: string }) => {
      const { data, error } = await supabase.rpc("atualizar_anotacoes_assistido", {
        p_assistido_id: args.assistidoId,
        p_observacoes: args.observacoes,
      });
      if (error) throw error;
      return data as { ok: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assistido-full"] });
    },
  });
}
