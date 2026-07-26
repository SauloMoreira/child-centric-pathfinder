import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useTeamMembers,
  useTeamInvitations,
  type TeamMember,
  type TeamInvitation,
} from "@/hooks/use-team";
import {
  useEstadoInstitucional,
  isDefensor,
  isAdminTecnico,
  isAtivo,
} from "@/hooks/use-estado-institucional";
import { AddTeamMemberSheet } from "@/components/add-team-member-sheet";
import {
  KanbanColumn,
  MemberCard,
  InvitationCard,
  EmptyState,
} from "@/components/team-kanban";
import { friendlyTeamError } from "@/lib/team-errors";

export const Route = createFileRoute("/_authenticated/minha-equipe")({
  head: () => ({
    meta: [
      { title: "Minha equipe — Reintegra" },
      {
        name: "description",
        content:
          "Gestão da equipe de execução: convites, membros ativos, bloqueios e histórico.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MinhaEquipePage,
});

function MinhaEquipePage() {
  const { data: estado } = useEstadoInstitucional();
  const defensor = isDefensor(estado);
  const tecnico = isAdminTecnico(estado);
  const ativo = isAtivo(estado);
  const [add, setAdd] = useState(false);
  const [busca, setBusca] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");

  const canManage = (defensor || tecnico) && ativo;

  const members = useTeamMembers();
  const invites = useTeamInvitations();

  const filteredMembers = useMemo<TeamMember[]>(() => {
    const list = members.data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        (m.nome_completo ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    );
  }, [members.data, busca]);

  const filteredInvites = useMemo<TeamInvitation[]>(() => {
    const list = invites.data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.nome_completo.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q),
    );
  }, [invites.data, busca]);

  const ativos = filteredMembers.filter((m) => m.status === "ativo" && m.ativo);
  const bloqueados = filteredMembers.filter(
    (m) => m.status === "suspenso" || (!m.ativo && m.status !== "inativo"),
  );
  const encerrados = filteredMembers.filter((m) => m.status === "inativo");
  const pendentes = filteredInvites.filter((i) =>
    ["preparando", "enviado", "falhou"].includes(i.status),
  );

  if (!defensor && !tecnico) {
    return (
      <div className="p-8">
        <EmptyState
          title="Sem acesso"
          description="Esta área é reservada a Defensores e Administradores Técnicos."
        />
      </div>
    );
  }

  const isLoading = members.isLoading || invites.isLoading;
  const err = members.error ?? invites.error;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-surface px-4 py-4 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Gestão de equipe
            </p>
            <h1 className="text-lg font-semibold">Minha equipe</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {estado?.orgao_ativo
                ? `${estado.orgao_ativo.nome}${estado.orgao_ativo.comarca ? " · " + estado.orgao_ativo.comarca : ""}`
                : tecnico
                  ? "Acesso técnico global"
                  : "Vínculo institucional pendente"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
                className="w-64 pl-8 h-9"
              />
            </div>
            <div className="flex rounded-md border border-border">
              <Button
                variant={view === "kanban" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("kanban")}
                aria-pressed={view === "kanban"}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            {canManage && (
              <Button onClick={() => setAdd(true)}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar membro
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
          <MetricPill label="Ativos" value={ativos.length} tone="success" />
          <MetricPill label="Convites pendentes" value={pendentes.length} tone="warning" />
          <MetricPill label="Bloqueados" value={bloqueados.length} tone="destructive" />
          <MetricPill label="Encerrados" value={encerrados.length} />
        </div>
      </div>

      {err && (
        <div className="mx-4 mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive lg:mx-8">
          {friendlyTeamError(err, "Não foi possível carregar a equipe.")}
        </div>
      )}

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto p-4 lg:p-8">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-96 w-[300px] shrink-0" />
          ))}
        </div>
      ) : ativos.length + pendentes.length + bloqueados.length + encerrados.length === 0 ? (
        <EmptyState
          title="Sua equipe ainda não possui membros"
          description="Convide o primeiro membro para atuar neste órgão de execução."
          action={
            canManage && (
              <Button onClick={() => setAdd(true)}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar primeiro membro
              </Button>
            )
          }
        />
      ) : view === "kanban" ? (
        <div className="flex flex-1 gap-3 overflow-x-auto p-4 lg:p-6">
          <KanbanColumn
            title="Convites pendentes"
            count={pendentes.length}
            tone="warning"
            emptyState="Nenhum convite pendente."
          >
            {pendentes.map((i) => (
              <InvitationCard key={i.id} inv={i} />
            ))}
          </KanbanColumn>
          <KanbanColumn
            title="Ativos"
            count={ativos.length}
            tone="success"
            emptyState="Nenhum membro ativo."
          >
            {ativos.map((m) => (
              <MemberCard key={m.user_id} m={m} />
            ))}
          </KanbanColumn>
          <KanbanColumn
            title="Acesso bloqueado"
            count={bloqueados.length}
            tone="destructive"
            emptyState="Nenhum acesso bloqueado."
          >
            {bloqueados.map((m) => (
              <MemberCard key={m.user_id} m={m} />
            ))}
          </KanbanColumn>
          <KanbanColumn
            title="Vínculo encerrado"
            count={encerrados.length}
            emptyState="Nenhum vínculo encerrado."
          >
            {encerrados.map((m) => (
              <MemberCard key={m.user_id} m={m} />
            ))}
          </KanbanColumn>
        </div>
      ) : (
        <div className="grid gap-2 p-4 lg:p-6">
          {pendentes.map((i) => (
            <InvitationCard key={i.id} inv={i} />
          ))}
          {[...ativos, ...bloqueados, ...encerrados].map((m) => (
            <MemberCard key={m.user_id} m={m} />
          ))}
        </div>
      )}

      <AddTeamMemberSheet open={add} onOpenChange={setAdd} />
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "destructive";
}) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "destructive"
          ? "bg-destructive"
          : "bg-muted-foreground/40";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="font-mono uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
