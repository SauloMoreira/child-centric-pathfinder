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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Siren } from "lucide-react";
import { useAvailableDefenders } from "@/features/team/defender-bonds";

export const Route = createFileRoute("/_authenticated/admin-tecnico/acesso-emergencial")({
  head: () => ({
    meta: [
      { title: "Acesso emergencial — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcessoEmergencial,
});

function AcessoEmergencial() {
  const [defensor, setDefensor] = useState<string>("");
  const [chamado, setChamado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [prazo, setPrazo] = useState(30);
  const [confirma, setConfirma] = useState(false);

  const defensoresQ = useAvailableDefenders();

  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("registrar_break_glass", {
        p_defensor_user_id: defensor,
        p_justificativa: motivo,
        p_chamado: chamado,
        p_prazo_minutos: prazo,
      });
      if (error) throw error;
      return data as { correlation_id: string; expira_em: string };
    },
    onSuccess: (d) => {
      toast.success(
        `Acesso emergencial aberto. Expira em ${new Date(d.expira_em).toLocaleTimeString("pt-BR")}.`,
      );
      setConfirma(false);
      setChamado("");
      setMotivo("");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao abrir acesso emergencial."),
  });

  return (
    <TecnicoPage
      title="Acesso emergencial (break-glass)"
      description="Reservado para incidentes institucionais. Exige MFA, justificativa mínima, referência de chamado e prazo. Alerta e trilha imediatos."
      requireAal2
    >
      <div className="surface-panel max-w-2xl border-institutional/50 p-5">
        <div className="flex items-start gap-2">
          <Siren className="mt-0.5 h-4 w-4 text-institutional" aria-hidden />
          <p className="text-xs text-muted-foreground">
            O acesso emergencial <strong>não</strong> utiliza service_role no frontend. Ele apenas
            registra em auditoria a justificativa e o prazo declarados pelo Administrador Técnico e
            emite alerta no painel administrativo.
          </p>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Defensor afetado (opcional)
            </label>
            <Select value={defensor} onValueChange={setDefensor}>
              <SelectTrigger>
                <SelectValue placeholder="Sem Defensor específico" />
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
                Referência de chamado
              </label>
              <Input value={chamado} onChange={(e) => setChamado(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Prazo (min, 5–240)
              </label>
              <Input
                type="number"
                min={5}
                max={240}
                value={prazo}
                onChange={(e) => setPrazo(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Justificativa (mínimo 20 caracteres)
            </label>
            <Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirma}
              onChange={(e) => setConfirma(e.target.checked)}
            />
            Confirmo explicitamente a abertura do acesso emergencial.
          </label>
        </div>
        <div className="mt-4">
          <Button
            onClick={() => mut.mutate()}
            disabled={
              !confirma ||
              motivo.trim().length < 20 ||
              chamado.trim().length < 3 ||
              prazo < 5 ||
              prazo > 240 ||
              mut.isPending
            }
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Abrir acesso emergencial
          </Button>
        </div>
      </div>
    </TecnicoPage>
  );
}
