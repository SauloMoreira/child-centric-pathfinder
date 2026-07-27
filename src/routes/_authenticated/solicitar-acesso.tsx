import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useEstadoInstitucional,
  isAtivo,
  isAdminTecnico,
  type EstadoInstitucional,
} from "@/hooks/use-estado-institucional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solicitar-acesso")({
  head: () => ({
    meta: [{ title: "Solicitar acesso — Ágora" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.rpc("meu_estado_institucional");
    if (error) return;
    const estado = data as EstadoInstitucional | null;
    if (!estado) return;
    // Perfil já ativo ou admin técnico: não deve ver o formulário.
    if (isAtivo(estado) || isAdminTecnico(estado)) {
      throw redirect({ to: "/area-de-trabalho", replace: true });
    }
    if (estado.profile?.status === "suspenso" || estado.profile?.status === "inativo") {
      throw redirect({ to: "/conta", replace: true });
    }
  },
  component: SolicitarAcesso,
});

const CARGO_DEFENSOR = "Defensor Público";
const CARGO_MEMBRO = "Membro de equipe";

const formSchema = z
  .object({
    nome_completo: z.string().trim().min(3, "Informe seu nome completo.").max(120),
    cargo: z.enum([CARGO_DEFENSOR, CARGO_MEMBRO], {
      message: "Selecione seu cargo.",
    }),
    matricula: z.string().trim().max(40).optional().or(z.literal("")),
  })
  .refine((v) => v.cargo !== CARGO_DEFENSOR || (v.matricula && v.matricula.trim().length >= 2), {
    message: "Informe sua matrícula.",
    path: ["matricula"],
  });

function SolicitarAcesso() {
  const { data: estado, isLoading: estadoLoading } = useEstadoInstitucional();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const initialCargo =
    estado?.profile?.cargo === CARGO_MEMBRO
      ? CARGO_MEMBRO
      : estado?.profile?.cargo === CARGO_DEFENSOR
        ? CARGO_DEFENSOR
        : "";
  const [form, setForm] = useState({
    nome_completo: estado?.profile?.nome_completo ?? "",
    matricula: estado?.profile?.matricula ?? "",
    cargo: initialCargo as "" | typeof CARGO_DEFENSOR | typeof CARGO_MEMBRO,
  });
  const [submitting, setSubmitting] = useState(false);

  const isDefensor = form.cargo === CARGO_DEFENSOR;
  const solicitacaoAberta = estado?.solicitacao_aberta;

  const cancelar = useMutation({
    mutationFn: async () => {
      if (!solicitacaoAberta) return;
      const { error } = await supabase.rpc("cancelar_solicitacao_acesso", {
        p_request_id: solicitacaoAberta.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação cancelada.");
      qc.invalidateQueries({ queryKey: ["estado-institucional"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao cancelar."),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    // A RPC exige matrícula (mín. 2 caracteres). Para Membro de equipe,
    // enviamos sentinela institucional "N/D" (não se aplica).
    const matriculaSubmit = isDefensor ? form.matricula.trim() : "N/D";

    setSubmitting(true);
    const { error } = await supabase.rpc("submeter_solicitacao_acesso", {
      p_nome_completo: form.nome_completo,
      p_matricula: matriculaSubmit,
      p_cargo: form.cargo,
      p_telefone: null,
      p_aceite_termos: true,
    } as never);
    setSubmitting(false);
    if (error) {
      const code = (error as { code?: string; message?: string }).code;
      const msg = error.message || "";
      if (
        code === "PROFILE_ALREADY_ACTIVE" ||
        /já processado/i.test(msg) ||
        /already.?active/i.test(msg)
      ) {
        toast.info("Seu acesso já está ativo. Redirecionamos você para a Área de Trabalho.");
        await qc.invalidateQueries({ queryKey: ["estado-institucional"] });
        navigate({ to: "/area-de-trabalho", replace: true });
        return;
      }
      toast.error(msg || "Falha ao enviar solicitação.");
      return;
    }
    toast.success("Solicitação enviada. Aguarde aprovação institucional.");
    await qc.invalidateQueries({ queryKey: ["estado-institucional"] });
    navigate({ to: "/area-de-trabalho", replace: true });
  }

  if (estadoLoading) {
    return (
      <div className="mx-auto max-w-2xl p-6 lg:p-8" aria-busy="true">
        <p className="text-sm text-muted-foreground">Verificando seu acesso institucional…</p>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  // Segunda camada: se o estado indicar perfil ativo, sair do formulário.
  if (isAtivo(estado) || isAdminTecnico(estado)) {
    navigate({ to: "/area-de-trabalho", replace: true });
    return null;
  }

  if (solicitacaoAberta) {
    return (
      <div className="mx-auto max-w-2xl p-6 lg:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Solicitação institucional
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Sua solicitação está sob análise</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enviada em{" "}
          <span className="font-mono">
            {new Date(solicitacaoAberta.created_at).toLocaleString("pt-BR")}
          </span>
          . Você será notificado assim que houver decisão.
        </p>
        <div className="mt-6 surface-panel p-6">
          <p className="text-sm">
            Enquanto aguarda, o acesso às áreas operacionais permanece indisponível. Se identificou
            um erro no envio, você pode cancelar e preencher novamente.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => cancelar.mutate()}
            disabled={cancelar.isPending}
          >
            {cancelar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Cancelar solicitação
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
        Cadastro institucional · Fase 1
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Solicitar acesso ao Ágora</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Informe seus dados funcionais. Um Administrador Institucional revisará e aprovará seu acesso
        operacional.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-8">
        <section className="surface-panel p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Dados funcionais
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                value={form.nome_completo}
                onChange={(e) => setForm((f) => ({ ...f, nome_completo: e.target.value }))}
                required
                maxLength={120}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cargo">Cargo</Label>
              <Select
                value={form.cargo}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    cargo: v as typeof CARGO_DEFENSOR | typeof CARGO_MEMBRO,
                    matricula: v === CARGO_DEFENSOR ? f.matricula : "",
                  }))
                }
              >
                <SelectTrigger id="cargo">
                  <SelectValue placeholder="Selecione seu cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CARGO_DEFENSOR}>Defensor Público</SelectItem>
                  <SelectItem value={CARGO_MEMBRO}>Membro de equipe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isDefensor && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="matricula">Matrícula</Label>
                <Input
                  id="matricula"
                  className="font-mono"
                  value={form.matricula}
                  onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))}
                  required
                  maxLength={40}
                />
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Enviar solicitação
          </Button>
        </div>
      </form>
    </div>
  );
}
