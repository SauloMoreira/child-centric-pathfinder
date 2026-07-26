import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProcessoResult =
  | { ok: true; code: "PROCESS_CREATED"; id: string; correlationId: string }
  | { ok: false; code: "PROCESS_ALREADY_EXISTS"; existingProcessoId: string };

export function useCadastrarProcesso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown): Promise<ProcessoResult> => {
      const { data, error } = await supabase.rpc("cadastrar_processo", { p_payload: payload as never });
      if (error) throw error;
      return data as unknown as ProcessoResult;
    },
    onSuccess: (r) => {
      if (r.ok) {
        qc.invalidateQueries({ queryKey: ["processos"] });
        qc.invalidateQueries({ queryKey: ["workspace"] });
      }
    },
  });
}
