import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, Kanban, Info } from "lucide-react";
import {
  useEstadoInstitucional,
  isAtivo,
  isAdmin,
} from "@/hooks/use-estado-institucional";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — Reintegra Infância" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Painel,
});

const COLUNAS_PREVIA = [
  { chave: "acolhimento", titulo: "Acolhimento", descricao: "Casos recém-recebidos" },
  { chave: "avaliacao", titulo: "Avaliação", descricao: "Estudo técnico em curso" },
  { chave: "articulacao", titulo: "Articulação", descricao: "Rede de proteção acionada" },
  { chave: "reintegracao", titulo: "Reintegração", descricao: "Retorno familiar assistido" },
  { chave: "acompanhamento", titulo: "Acompanhamento", descricao: "Pós-reintegração" },
];

function Painel() {
  const { data: estado, isLoading } = useEstadoInstitucional();

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-96" />
        <div className="mt-8 grid grid-flow-col auto-cols-[288px] gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="kanban-column p-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-2 h-3 w-40" />
              <div className="mt-4 space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Centro de comando · quadro institucional
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Painel do Reintegra Infância
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A visão operacional do quadro será ativada nas próximas fases. A
            estrutura abaixo é uma prévia arquitetural do centro de comando
            child-centric e não contém casos reais.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Kanban className="h-3.5 w-3.5" aria-hidden />
            Prévia estrutural
          </span>
        </div>
      </header>

      {!isAtivo(estado) && <AvisoAprovacao estado={estado} />}

      {isAdmin(estado) && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-institutional/30 bg-institutional/5 p-4 text-sm">
          <ShieldIcon />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              Você tem privilégios de Administrador Institucional.
            </p>
            <p className="mt-1 text-muted-foreground">
              Ações administrativas exigem autenticação de segundo fator (MFA).
              Configure agora em Minha conta se ainda não configurou.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/solicitacoes">Solicitações pendentes</Link>
          </Button>
        </div>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Quadro estrutural — próximas fases
            </h2>
          </div>
          <div className="hidden gap-2 sm:flex">
            <ToolbarButton>Filtrar</ToolbarButton>
            <ToolbarButton>Agrupar</ToolbarButton>
            <ToolbarButton>Visualização</ToolbarButton>
          </div>
        </div>

        <div className="mt-4 -mx-6 overflow-x-auto px-6 pb-6 lg:-mx-8 lg:px-8">
          <div className="grid grid-flow-col auto-cols-[288px] gap-4">
            {COLUNAS_PREVIA.map((col) => (
              <div key={col.chave} className="kanban-column flex flex-col p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    {col.titulo}
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    0
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {col.descricao}
                </p>
                <div className="mt-4 flex flex-1 items-center justify-center rounded-md border border-dashed border-border bg-canvas/60 p-6 text-center text-xs text-muted-foreground">
                  Coluna reservada para próxima fase.
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AvisoAprovacao({
  estado,
}: {
  estado: ReturnType<typeof useEstadoInstitucional>["data"];
}) {
  const status = estado?.profile?.status ?? "aguardando_dados";
  if (status === "aguardando_aprovacao") {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <Info className="mt-0.5 h-5 w-5 text-warning-foreground" aria-hidden />
        <div className="flex-1">
          <p className="font-medium text-foreground">
            Sua solicitação está sob análise institucional.
          </p>
          <p className="mt-1 text-muted-foreground">
            Você será notificado assim que o Administrador Institucional
            concluir a decisão. Enquanto isso, o acesso às áreas operacionais
            permanece indisponível.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
      <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden />
      <div className="flex-1">
        <p className="font-medium text-foreground">
          Complete seu cadastro para solicitar acesso institucional.
        </p>
        <p className="mt-1 text-muted-foreground">
          Informe seus dados funcionais e selecione seu órgão de execução. A
          liberação depende de aprovação do Administrador Institucional.
        </p>
      </div>
      <Button asChild size="sm">
        <Link to="/solicitar-acesso">Preencher dados</Link>
      </Button>
    </div>
  );
}

function ShieldIcon() {
  return (
    <div
      aria-hidden
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-institutional/10 text-institutional"
    >
      ⚑
    </div>
  );
}

function ToolbarButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground opacity-60"
      title="Disponível nas próximas fases"
    >
      {children}
    </button>
  );
}
