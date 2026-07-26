import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEstadoInstitucional, isAdmin } from "@/hooks/use-estado-institucional";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Check, X, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/solicitacoes")({
  head: () => ({
    meta: [
      { title: "Solicitações — Reintegra Infância" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SolicitacoesAdmin,
});

type Solicitacao = {
  id: string;
  user_id: string;
  nome_completo: string;
  matricula: string;
  cargo: string;
  telefone: string | null;
  orgao_id: string | null;
  orgao_nome: string | null;
  proposta_novo_orgao_nome: string | null;
  proposta_novo_orgao_sigla: string | null;
  proposta_novo_orgao_comarca: string | null;
  proposta_novo_orgao_cidade: string | null;
  status: "pendente" | "em_analise" | "aprovada" | "rejeitada" | "cancelada";
  version: number;
  correlation_id: string;
  created_at: string;
};

function SolicitacoesAdmin() {
  const { data: estado, isLoading: loadingEstado } = useEstadoInstitucional();

  if (loadingEstado) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }
  if (!isAdmin(estado)) {
    return <AcessoNegado />;
  }
  return <SolicitacoesInner aal2={!!estado?.aal2} />;
}

function AcessoNegado() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <div className="surface-panel p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 text-destructive" aria-hidden />
          <div>
            <h1 className="text-lg font-semibold">Acesso restrito</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta área é exclusiva do Administrador Institucional.
            </p>
          </div>
        </div>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/painel">Voltar ao painel</Link>
        </Button>
      </div>
    </div>
  );
}

function SolicitacoesInner({ aal2 }: { aal2: boolean }) {
  const qc = useQueryClient();
  const solicitacoesQ = useQuery({
    queryKey: ["solicitacoes-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_solicitacoes_acesso", {
        p_status: "pendente",
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as Solicitacao[];
    },
  });

  const orgaosQ = useQuery({
    queryKey: ["orgaos-execucao-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id,nome,sigla")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const [aprovando, setAprovando] = useState<Solicitacao | null>(null);
  const [rejeitando, setRejeitando] = useState<Solicitacao | null>(null);

  return (
    <div className="p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Administração institucional
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Solicitações de acesso</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Revise, aprove ou rejeite pedidos pendentes. A decisão exige MFA
            (AAL2) e é registrada em auditoria institucional.
          </p>
        </div>
        {!aal2 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <p className="font-medium">MFA necessário</p>
            <p className="text-muted-foreground">
              Configure e valide o segundo fator em <Link to="/conta" className="underline">Minha conta</Link>.
            </p>
          </div>
        )}
      </header>

      <div className="mt-6 surface-panel divide-y divide-border">
        {solicitacoesQ.isLoading && (
          <div className="p-6">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="mt-2 h-4 w-96" />
          </div>
        )}
        {solicitacoesQ.data && solicitacoesQ.data.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma solicitação pendente.
          </div>
        )}
        {solicitacoesQ.data?.map((s) => (
          <article key={s.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{s.nome_completo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{s.matricula}</span> · {s.cargo}
                  {s.telefone && <> · {s.telefone}</>}
                </p>
                <p className="mt-2 text-xs">
                  <span className="text-muted-foreground">Órgão: </span>
                  {s.orgao_id ? (
                    <span className="font-medium">{s.orgao_nome}</span>
                  ) : (
                    <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px]">
                      Proposta de novo órgão: {s.proposta_novo_orgao_sigla} —{" "}
                      {s.proposta_novo_orgao_nome}
                    </span>
                  )}
                </p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Enviada em {new Date(s.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRejeitando(s)}
                  disabled={!aal2}
                >
                  <X className="mr-1 h-4 w-4" aria-hidden /> Rejeitar
                </Button>
                <Button
                  size="sm"
                  onClick={() => setAprovando(s)}
                  disabled={!aal2}
                >
                  <Check className="mr-1 h-4 w-4" aria-hidden /> Aprovar
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {aprovando && (
        <DialogAprovar
          solicitacao={aprovando}
          orgaos={orgaosQ.data ?? []}
          onClose={() => setAprovando(null)}
          onDone={() => {
            setAprovando(null);
            qc.invalidateQueries({ queryKey: ["solicitacoes-admin"] });
          }}
        />
      )}
      {rejeitando && (
        <DialogRejeitar
          solicitacao={rejeitando}
          onClose={() => setRejeitando(null)}
          onDone={() => {
            setRejeitando(null);
            qc.invalidateQueries({ queryKey: ["solicitacoes-admin"] });
          }}
        />
      )}
    </div>
  );
}

function DialogAprovar({
  solicitacao,
  orgaos,
  onClose,
  onDone,
}: {
  solicitacao: Solicitacao;
  orgaos: Array<{ id: string; nome: string; sigla: string | null }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const propostaNovo = !solicitacao.orgao_id;
  const [criarNovo, setCriarNovo] = useState(propostaNovo);
  const [orgaoFinal, setOrgaoFinal] = useState<string>(solicitacao.orgao_id ?? "");

  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("aprovar_solicitacao_acesso", {
        p_request_id: solicitacao.id,
        p_version: solicitacao.version,
        p_orgao_final_id: criarNovo ? null : orgaoFinal || null,
        p_criar_novo: criarNovo,
        p_novo_orgao: criarNovo
          ? {
              nome: solicitacao.proposta_novo_orgao_nome,
              sigla: solicitacao.proposta_novo_orgao_sigla,
              comarca: solicitacao.proposta_novo_orgao_comarca,
              cidade: solicitacao.proposta_novo_orgao_cidade,
              uf: "RS",
            }
          : null,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Solicitação aprovada.");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao aprovar."),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar solicitação institucional</DialogTitle>
          <DialogDescription>
            Ao aprovar, o usuário receberá o papel de Defensor Público e vínculo
            com o órgão escolhido. Ação registrada em auditoria e exigindo MFA.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border p-3">
            <p className="font-medium">{solicitacao.nome_completo}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-mono">{solicitacao.matricula}</span> ·{" "}
              {solicitacao.cargo}
            </p>
          </div>
          {propostaNovo ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Solicitante propôs criação de novo órgão:
                <br />
                <span className="font-medium">
                  {solicitacao.proposta_novo_orgao_sigla} —{" "}
                  {solicitacao.proposta_novo_orgao_nome}
                </span>
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="modo"
                  checked={criarNovo}
                  onChange={() => setCriarNovo(true)}
                />
                Criar novo órgão como proposto
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="modo"
                  checked={!criarNovo}
                  onChange={() => setCriarNovo(false)}
                />
                Vincular a um órgão existente
              </label>
            </div>
          ) : null}

          {!criarNovo && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Órgão final</p>
              <Select value={orgaoFinal} onValueChange={setOrgaoFinal}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar órgão" />
                </SelectTrigger>
                <SelectContent>
                  {orgaos.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.sigla ?? "—"} — {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || (!criarNovo && !orgaoFinal)}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Confirmar aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogRejeitar({
  solicitacao,
  onClose,
  onDone,
}: {
  solicitacao: Solicitacao;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("rejeitar_solicitacao_acesso", {
        p_request_id: solicitacao.id,
        p_version: solicitacao.version,
        p_motivo: motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação rejeitada.");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao rejeitar."),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeitar solicitação institucional</DialogTitle>
          <DialogDescription>
            O motivo será registrado em auditoria. A ação exige MFA.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="rounded-md border border-border p-3">
            <span className="font-medium">{solicitacao.nome_completo}</span>{" "}
            <span className="font-mono text-xs text-muted-foreground">
              · {solicitacao.matricula}
            </span>
          </p>
          <Textarea
            placeholder="Motivo institucional da rejeição (mínimo 5 caracteres)."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            minLength={5}
            maxLength={500}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || motivo.trim().length < 5}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Confirmar rejeição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
