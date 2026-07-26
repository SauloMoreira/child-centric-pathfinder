import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEstadoInstitucional } from "@/hooks/use-estado-institucional";
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
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solicitar-acesso")({
  head: () => ({
    meta: [
      { title: "Solicitar acesso — Reintegra Infância" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SolicitarAcesso,
});

const NOVO = "__novo__";
const CARGO_DEFENSOR = "Defensor Público";
const CARGO_MEMBRO = "Membro de equipe";

const formSchema = z
  .object({
    nome_completo: z.string().trim().min(3, "Informe seu nome completo.").max(120),
    cargo: z.enum([CARGO_DEFENSOR, CARGO_MEMBRO], {
      message: "Selecione seu cargo.",
    }),
    matricula: z.string().trim().max(40).optional().or(z.literal("")),
    orgao_id: z.string().uuid().optional(),
    novo_nome: z.string().trim().max(200).optional(),
    novo_comarca: z.string().trim().max(120).optional(),
  })
  .refine(
    (v) =>
      v.cargo !== CARGO_DEFENSOR || (v.matricula && v.matricula.trim().length >= 2),
    { message: "Informe sua matrícula.", path: ["matricula"] },
  );

function SolicitarAcesso() {
  const { data: estado } = useEstadoInstitucional();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const orgaosQ = useQuery({
    queryKey: ["orgaos-execucao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id,nome,comarca")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const [orgaoSel, setOrgaoSel] = useState<string>("");
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
    novo_nome: "",
    novo_comarca: "",
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
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao cancelar."),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const orgaoExistente = orgaoSel && orgaoSel !== NOVO ? orgaoSel : undefined;
    const parsed = formSchema.safeParse({
      ...form,
      orgao_id: orgaoExistente,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (!orgaoSel) {
      toast.error("Selecione seu órgão de execução ou proponha um novo.");
      return;
    }
    if (
      orgaoSel === NOVO &&
      (!form.novo_nome.trim() || !form.novo_comarca.trim())
    ) {
      toast.error("Para propor novo órgão, informe nome e comarca.");
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
      p_orgao_id: orgaoExistente ?? null,
      p_novo_orgao:
        orgaoSel === NOVO
          ? {
              nome: form.novo_nome,
              comarca: form.novo_comarca,
            }
          : null,
      p_aceite_termos: true,
    } as never);
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Falha ao enviar solicitação.");
      return;
    }
    toast.success("Solicitação enviada. Aguarde aprovação institucional.");
    await qc.invalidateQueries({ queryKey: ["estado-institucional"] });
    navigate({ to: "/painel" });
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
            Enquanto aguarda, o acesso às áreas operacionais permanece
            indisponível. Se identificou um erro no envio, você pode cancelar e
            preencher novamente.
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
      <h1 className="mt-2 text-2xl font-semibold">Solicitar acesso ao Reintegra Infância</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Informe seus dados funcionais e o órgão de execução. Um Administrador
        Institucional revisará e aprovará seu acesso operacional.
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

        <section className="surface-panel p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Órgão de execução
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha seu órgão de execução na DPE-RS. Caso não esteja listado,
            proponha a inclusão para revisão do Administrador Institucional.
          </p>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Órgão</Label>
              <Select value={orgaoSel} onValueChange={setOrgaoSel}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    orgaosQ.isLoading ? "Carregando…" : "Selecionar órgão"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {orgaosQ.data?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome} — {o.comarca}
                    </SelectItem>
                  ))}
                  <SelectItem value={NOVO}>
                    Propor novo órgão de execução…
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {orgaoSel === NOVO && (
              <div className="grid gap-4 rounded-md border border-dashed border-border bg-canvas/50 p-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="novo-nome">Nome do órgão proposto</Label>
                  <Input
                    id="novo-nome"
                    value={form.novo_nome}
                    onChange={(e) => setForm((f) => ({ ...f, novo_nome: e.target.value }))}
                    maxLength={200}
                    placeholder="1ª Defensoria Pública da Infância e Juventude"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="novo-comarca">Comarca</Label>
                  <Input
                    id="novo-comarca"
                    value={form.novo_comarca}
                    onChange={(e) => setForm((f) => ({ ...f, novo_comarca: e.target.value }))}
                    maxLength={120}
                    placeholder="Porto Alegre"
                  />
                </div>
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
