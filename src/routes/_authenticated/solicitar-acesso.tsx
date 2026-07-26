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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
const formSchema = z.object({
  nome_completo: z.string().trim().min(3, "Informe seu nome completo.").max(120),
  matricula: z.string().trim().min(2, "Informe sua matrícula.").max(40),
  cargo: z.string().trim().min(2, "Informe seu cargo.").max(80),
  telefone: z.string().trim().max(40).optional().or(z.literal("")),
  orgao_id: z.string().uuid().optional(),
  novo_nome: z.string().trim().max(160).optional(),
  novo_sigla: z.string().trim().max(30).optional(),
  novo_comarca: z.string().trim().max(120).optional(),
  novo_cidade: z.string().trim().max(120).optional(),
  aceite_termos: z.literal(true, {
    errorMap: () => ({ message: "É necessário aceitar os termos institucionais." }),
  }),
});

function SolicitarAcesso() {
  const { data: estado } = useEstadoInstitucional();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const orgaosQ = useQuery({
    queryKey: ["orgaos-execucao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id,nome,sigla,comarca,cidade")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const [orgaoSel, setOrgaoSel] = useState<string>("");
  const [form, setForm] = useState({
    nome_completo: estado?.profile?.nome_completo ?? "",
    matricula: estado?.profile?.matricula ?? "",
    cargo: estado?.profile?.cargo ?? "",
    telefone: estado?.profile?.telefone ?? "",
    novo_nome: "",
    novo_sigla: "",
    novo_comarca: "",
    novo_cidade: "",
    aceite: false,
  });
  const [submitting, setSubmitting] = useState(false);

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
      aceite_termos: form.aceite,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (!orgaoSel) {
      toast.error("Selecione seu órgão de execução ou proponha um novo.");
      return;
    }
    if (orgaoSel === NOVO && (!form.novo_nome.trim() || !form.novo_sigla.trim())) {
      toast.error("Para propor novo órgão, informe nome e sigla.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.rpc("submeter_solicitacao_acesso", {
      p_nome_completo: form.nome_completo,
      p_matricula: form.matricula,
      p_cargo: form.cargo,
      p_telefone: form.telefone || null,
      p_orgao_id: orgaoExistente ?? null,
      p_novo_orgao:
        orgaoSel === NOVO
          ? {
              nome: form.novo_nome,
              sigla: form.novo_sigla,
              comarca: form.novo_comarca,
              cidade: form.novo_cidade,
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
        Institucional revisará e aprovará seu acesso operacional. Enquanto isso,
        você permanece sem papel operacional.
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
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label htmlFor="cargo">Cargo</Label>
              <Input
                id="cargo"
                value={form.cargo}
                onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
                required
                maxLength={80}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tel">Telefone institucional (opcional)</Label>
              <Input
                id="tel"
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                maxLength={40}
              />
            </div>
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
                      {o.sigla} — {o.nome}
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
                    maxLength={160}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="novo-sigla">Sigla</Label>
                  <Input
                    id="novo-sigla"
                    className="font-mono uppercase"
                    value={form.novo_sigla}
                    onChange={(e) => setForm((f) => ({ ...f, novo_sigla: e.target.value.toUpperCase() }))}
                    maxLength={30}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="novo-comarca">Comarca</Label>
                  <Input
                    id="novo-comarca"
                    value={form.novo_comarca}
                    onChange={(e) => setForm((f) => ({ ...f, novo_comarca: e.target.value }))}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="novo-cidade">Cidade</Label>
                  <Input
                    id="novo-cidade"
                    value={form.novo_cidade}
                    onChange={(e) => setForm((f) => ({ ...f, novo_cidade: e.target.value }))}
                    maxLength={120}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="surface-panel p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Termo institucional
          </h2>
          <Textarea
            readOnly
            className="mt-4 h-40 resize-none bg-canvas/50 font-mono text-xs"
            value={
`Declaro, sob as penas legais, que sou servidor(a) da Defensoria Pública do Estado do Rio Grande do Sul, que os dados funcionais fornecidos são verdadeiros e que estou ciente das seguintes obrigações institucionais:

1. Utilizar o sistema Reintegra Infância exclusivamente para finalidades institucionais legítimas.
2. Não compartilhar credenciais nem sessões autenticadas.
3. Tratar dados pessoais de crianças, adolescentes, famílias e demais titulares com estrita observância da LGPD e dos deveres funcionais.
4. Registrar apenas informações necessárias, adequadas e proporcionais ao acompanhamento do caso.
5. Comunicar imediatamente à administração qualquer incidente de segurança ou uso indevido.
6. Aceitar que toda ação sensível será registrada em auditoria institucional.`
            }
          />
          <label className="mt-4 flex items-start gap-3 text-sm">
            <Checkbox
              checked={form.aceite}
              onCheckedChange={(v) => setForm((f) => ({ ...f, aceite: v === true }))}
            />
            <span>
              Li e aceito integralmente o termo institucional acima e confirmo
              a veracidade dos dados informados.
            </span>
          </label>
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
