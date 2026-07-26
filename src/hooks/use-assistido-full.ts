import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AssistidoRecord = {
  id: string;
  prenome: string | null;
  sobrenome: string | null;
  nome_completo: string;
  nome_social: string | null;
  data_nascimento: string;
  sexo_registral: string;
  genero: string | null;
  cpf: string | null;
  nome_mae: string | null;
  nome_pai: string | null;
  orgao_execucao_id: string;
  categoria: string | null;
  observacoes: string | null;
  foto_url: string | null;
  foto_path: string | null;
};

export type VinculoRow = {
  id: string;
  tipo: "pai" | "mae" | "familia_extensa" | "irmao";
  origem_id: string;
  destino_id: string;
  outro_id: string;
  outro_nome: string;
  outro_categoria: string | null;
};

export function useAssistidoFull(assistidoId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["assistido-full", assistidoId],
    enabled: !!assistidoId && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      if (!assistidoId) return null;
      const [{ data: rec, error: e1 }, { data: vinc, error: e2 }] = await Promise.all([
        supabase
          .from("assistidos")
          .select(
            "id, prenome, sobrenome, nome_completo, nome_social, data_nascimento, sexo_registral, genero, cpf, nome_mae, nome_pai, orgao_execucao_id, categoria, observacoes, foto_url, foto_path",
          )
          .eq("id", assistidoId)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("assistido_vinculos")
          .select("id, tipo, origem_id, destino_id")
          .or(`origem_id.eq.${assistidoId},destino_id.eq.${assistidoId}`)
          .is("deleted_at", null),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const rawVinc = (vinc ?? []) as Array<{ id: string; tipo: string; origem_id: string; destino_id: string }>;
      const otherIds = Array.from(
        new Set(rawVinc.map((r) => (r.origem_id === assistidoId ? r.destino_id : r.origem_id))),
      );
      let byId = new Map<string, { nome_completo: string; categoria: string | null }>();
      if (otherIds.length > 0) {
        const { data: outros, error: e3 } = await supabase
          .from("assistidos")
          .select("id, nome_completo, categoria")
          .in("id", otherIds)
          .is("deleted_at", null);
        if (e3) throw e3;
        byId = new Map(
          (outros ?? []).map((o) => [o.id, { nome_completo: o.nome_completo, categoria: o.categoria }]),
        );
      }
      const vinculos: VinculoRow[] = rawVinc.map((r) => {
        const otherId = r.origem_id === assistidoId ? r.destino_id : r.origem_id;
        const info = byId.get(otherId);
        return {
          id: r.id,
          tipo: r.tipo as VinculoRow["tipo"],
          origem_id: r.origem_id,
          destino_id: r.destino_id,
          outro_id: otherId,
          outro_nome: info?.nome_completo ?? "—",
          outro_categoria: info?.categoria ?? null,
        };
      });
      return { record: rec as AssistidoRecord | null, vinculos };
    },
  });
}
