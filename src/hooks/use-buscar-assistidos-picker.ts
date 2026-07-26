import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PickerItem = {
  id: string;
  nome_completo: string;
  data_nascimento: string;
  categoria: "crianca_adolescente" | "adulto" | null;
  cpf_mascarado: string | null;
};

export function useBuscarAssistidosPicker(
  text: string,
  categoria: "crianca_adolescente" | "adulto" | "todos",
  excludeIds: string[],
  enabled = true,
) {
  return useQuery({
    queryKey: ["assistidos-picker", text, categoria, excludeIds.slice().sort().join(",")],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("buscar_assistidos_picker", {
        p_text: text || undefined,
        p_categoria: categoria === "todos" ? undefined : categoria,
        p_exclude: excludeIds.length ? excludeIds : undefined,
        p_limit: 20,
      });
      if (error) throw error;
      return (data as unknown as PickerItem[]) ?? [];
    },
  });
}
