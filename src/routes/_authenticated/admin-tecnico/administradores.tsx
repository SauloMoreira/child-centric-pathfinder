import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TecnicoPage } from "@/components/tecnico-guard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-tecnico/administradores")({
  head: () => ({
    meta: [
      { title: "Administradores — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminsTecnico,
});

function AdminsTecnico() {
  const [alvo, setAlvo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirma, setConfirma] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "promover_admin_tecnico" as never,
        {
          p_target_user_id: alvo,
          p_justificativa: motivo,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Administrador Técnico promovido. Evento auditado.");
      setAlvo("");
      setMotivo("");
      setConfirma(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha na promoção."),
  });

  return (
    <TecnicoPage
      title="Administradores"
      description="Somente outro Administrador Técnico com MFA pode promover novos Administradores Técnicos. A operação é irrevogável pela interface e sempre auditada."
      requireAal2
    >
      <div className="surface-panel max-w-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-institutional">
          Promover Administrador Técnico
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Informe o identificador (user_id) do usuário alvo e a justificativa institucional.
          Auto-promoção é bloqueada no banco.
        </p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              User ID alvo
            </label>
            <Input
              value={alvo}
              onChange={(e) => setAlvo(e.target.value.trim())}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Justificativa institucional
            </label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="Mínimo 20 caracteres. Referencie chamado/ato institucional."
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirma}
              onChange={(e) => setConfirma(e.target.checked)}
            />
            Confirmo, sob responsabilidade funcional, que esta promoção é legítima e será registrada
            em auditoria.
          </label>
        </div>
        <div className="mt-4">
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !confirma || alvo.length < 32 || motivo.trim().length < 20}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Confirmar promoção
          </Button>
        </div>
      </div>
    </TecnicoPage>
  );
}
