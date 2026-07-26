import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TecnicoPage } from "@/components/tecnico-guard";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-tecnico/acesso-global")({
  head: () => ({
    meta: [
      { title: "Acesso global — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcessoGlobal,
});

function AcessoGlobal() {
  const [orgao, setOrgao] = useState<string>("");
  const [modulo, setModulo] = useState("painel");
  const [finalidade, setFinalidade] = useState("");

  const orgaosQ = useQuery({
    queryKey: ["admin-tecnico", "orgaos-global"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id,nome,comarca")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });


  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("registrar_acesso_orgao_externo" as never, {
        p_orgao_id: orgao,
        p_modulo: modulo,
        p_finalidade: finalidade || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Acesso técnico registrado em auditoria."),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao registrar."),
  });

  return (
    <TecnicoPage
      title="Seletor global de contexto"
      description="Escolha o órgão sob análise. O seletor é apenas visual — a autorização continua vindo do RLS. O acesso a órgão fora do vínculo próprio é registrado em auditoria."
    >
      <div className="surface-panel max-w-2xl p-5">
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Órgão em análise
            </label>
            <Select value={orgao} onValueChange={setOrgao}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os órgãos" />
              </SelectTrigger>
              <SelectContent>
                {(orgaosQ.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome} — {o.comarca}
                  </SelectItem>
                ))}
              </SelectContent>

            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Módulo consultado
              </label>
              <Input value={modulo} onChange={(e) => setModulo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Finalidade
              </label>
              <Input
                value={finalidade}
                onChange={(e) => setFinalidade(e.target.value)}
                placeholder="Ex.: apuração de incidente #123"
              />
            </div>
          </div>
          <Button
            onClick={() => mut.mutate()}
            disabled={!orgao || mut.isPending}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Registrar consulta a órgão externo
          </Button>
        </div>
      </div>
    </TecnicoPage>
  );
}
