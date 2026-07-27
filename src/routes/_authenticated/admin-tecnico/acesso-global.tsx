import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
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
import { useAvailableDefenders } from "@/features/team/defender-bonds";

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
  const [defensor, setDefensor] = useState<string>("");
  const [modulo, setModulo] = useState("painel");
  const [finalidade, setFinalidade] = useState("");

  const defensoresQ = useAvailableDefenders();

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("registrar_acesso_defensor_externo", {
        p_defensor_user_id: defensor,
        p_modulo: modulo,
        p_finalidade: finalidade || null,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Acesso técnico registrado em auditoria."),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao registrar."),
  });

  return (
    <TecnicoPage
      title="Seletor global de contexto"
      description="Escolha o Defensor Público sob análise. O seletor é apenas visual — a autorização continua vindo do RLS. O acesso à Área de Trabalho de um Defensor fora do vínculo próprio é registrado em auditoria."
    >
      <div className="surface-panel max-w-2xl p-5">
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Defensor em análise
            </label>
            <Select value={defensor} onValueChange={setDefensor}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar Defensor" />
              </SelectTrigger>
              <SelectContent>
                {(defensoresQ.data?.items ?? []).map((d) => (
                  <SelectItem key={d.defenderUserId} value={d.defenderUserId}>
                    {d.displayName}
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
          <Button onClick={() => mut.mutate()} disabled={!defensor || mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Registrar consulta a Defensor externo
          </Button>
        </div>
      </div>
    </TecnicoPage>
  );
}
