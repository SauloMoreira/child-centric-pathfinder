import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  UserPlus,
  ShieldAlert,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { KanbanColumn, MemberCard, InvitationCard, EmptyState } from "@/components/team-kanban";
import { friendlyTeamError } from "@/lib/team-errors";
import {
  useCurrentDefenderContext,
  useDefenderTeam,
  useEndBond,
  type DefenderBond,
} from "@/features/team/defender-bonds";
import { LinkMemberSheet } from "@/features/team/components/link-member-sheet";
import { PendingAccessRequestsSection } from "@/features/team/components/pending-access-requests-section";

export const Route = createFileRoute("/_authenticated/minha-equipe")({
  head: () => ({
    meta: [
      { title: "Minha equipe — Ágora" },
      {
        name: "description",
        content: "Gestão da equipe de execução: convites, membros ativos, bloqueios e histórico.",
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
  const [linkOpen, setLinkOpen] = useState(false);
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
      (m) => (m.nome_completo ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members.data, busca]);

  const filteredInvites = useMemo<TeamInvitation[]>(() => {
    const list = invites.data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) => i.nome_completo.toLowerCase().includes(q) || i.email.toLowerCase().includes(q),
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
            {defensor && ativo && (
              <Button variant="outline" onClick={() => setLinkOpen(true)}>
                <UserPlus className="mr-1 h-4 w-4" /> Vincular membro
              </Button>
            )}
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

      {err ? (
        <div className="mx-4 mt-4 flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive lg:mx-8">
          <p>{friendlyTeamError(err, "Não foi possível carregar a equipe.")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void members.refetch();
              void invites.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : isLoading ? (
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

      <PendingAccessRequestsSection enabled={defensor && ativo} />

      <DefenderBondsSection
        estado={estado}
        defensor={defensor}
        tecnico={tecnico}
        onOpenLink={() => setLinkOpen(true)}
      />

      <AddTeamMemberSheet open={add} onOpenChange={setAdd} />
      {defensor && estado?.user_id && (
        <LinkMemberSheet
          open={linkOpen}
          onOpenChange={setLinkOpen}
          defenderUserId={estado.user_id}
        />
      )}
    </div>
  );
}

// -------- Vínculos Membro ↔ Defensor --------

function DefenderBondsSection({
  estado,
  defensor,
  tecnico,
  onOpenLink,
}: {
  estado: ReturnType<typeof useEstadoInstitucional>["data"];
  defensor: boolean;
  tecnico: boolean;
  onOpenLink: () => void;
}) {
  const ctx = useCurrentDefenderContext();
  const targetDefenderId = defensor
    ? (estado?.user_id ?? null)
    : (ctx.current?.defenderUserId ?? null);

  const team = useDefenderTeam(targetDefenderId);
  const endBond = useEndBond(targetDefenderId);
  const [bondToEnd, setBondToEnd] = useState<DefenderBond | null>(null);

  if (!defensor && !tecnico) return null;

  const canLink = team.data?.canLinkMembers ?? false;
  const canEnd = team.data?.canEndBonds ?? false;
  const members = team.data?.members ?? [];
  const ativos = members.filter((m) => m.status === "ativo");
  const encerrados = members.filter((m) => m.status === "encerrado");

  async function confirmEnd() {
    if (!bondToEnd) return;
    try {
      await endBond.mutateAsync({
        bondId: bondToEnd.bondId,
        expectedVersion: bondToEnd.optimisticVersion,
      });
      toast.success(`Vínculo de ${bondToEnd.displayName} encerrado.`);
      setBondToEnd(null);
    } catch (err) {
      toast.error(friendlyTeamError(err, "Não foi possível encerrar o vínculo."));
    }
  }

  return (
    <section className="border-t border-border bg-surface/40 px-4 py-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Vínculos com Defensor
          </p>
          <h2 className="text-base font-semibold">
            {defensor ? "Membros vinculados a você" : "Equipe do Defensor selecionado"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {defensor
              ? "Membros com acesso somente leitura à sua Área de Trabalho."
              : tecnico && ctx.current
                ? `Visualizando equipe de ${ctx.current.displayName} em modo técnico (somente leitura).`
                : "Selecione um Defensor no seletor lateral para visualizar sua equipe."}
          </p>
        </div>
        {canLink && (
          <Button variant="outline" size="sm" onClick={onOpenLink}>
            <UserPlus className="mr-1 h-4 w-4" /> Vincular membro
          </Button>
        )}
      </div>

      {tecnico && !defensor && (
        <Badge
          variant="outline"
          className="mb-3 gap-1.5 border-institutional/50 bg-institutional/10 font-mono text-[10px] uppercase tracking-[0.16em] text-institutional"
        >
          <ShieldAlert className="h-3 w-3" aria-hidden /> Modo técnico · somente leitura
        </Badge>
      )}

      {!targetDefenderId ? (
        <EmptyState
          title="Nenhum Defensor selecionado"
          description="Use o seletor lateral 'Contexto técnico' para escolher um Defensor."
        />
      ) : team.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : team.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {friendlyTeamError(team.error, "Não foi possível carregar os vínculos.")}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          title="Sem vínculos"
          description={
            defensor
              ? "Vincule um membro para conceder acesso somente leitura à sua Área de Trabalho."
              : "Este Defensor ainda não vinculou membros à equipe."
          }
        />
      ) : (
        <div className="grid gap-2">
          {ativos.map((b) => (
            <BondRow
              key={b.bondId}
              bond={b}
              canEnd={canEnd}
              disabled={endBond.isPending}
              onEnd={() => setBondToEnd(b)}
            />
          ))}
          {encerrados.length > 0 && (
            <>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Histórico encerrado
              </p>
              {encerrados.map((b) => (
                <BondRow key={b.bondId} bond={b} canEnd={false} disabled />
              ))}
            </>
          )}
        </div>
      )}

      <AlertDialog open={!!bondToEnd} onOpenChange={(o) => !o && setBondToEnd(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar vínculo</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso de <strong>{bondToEnd?.displayName}</strong> à sua Área de Trabalho será
              revogado imediatamente. O histórico é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endBond.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEnd}
              disabled={endBond.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {endBond.isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              Encerrar vínculo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function BondRow({
  bond,
  canEnd,
  disabled,
  onEnd,
}: {
  bond: DefenderBond;
  canEnd: boolean;
  disabled: boolean;
  onEnd?: () => void;
}) {
  const encerrado = bond.status === "encerrado";
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{bond.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{bond.email}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={
            encerrado
              ? "border-muted-foreground/40 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"
              : "border-success/40 bg-success/10 text-[10px] font-mono uppercase tracking-[0.14em] text-success"
          }
        >
          {encerrado ? "Encerrado" : "Ativo"}
        </Badge>
        {canEnd && !encerrado && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEnd}
            disabled={disabled}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Encerrar vínculo de ${bond.displayName}`}
          >
            <XCircle className="mr-1 h-3.5 w-3.5" /> Encerrar
          </Button>
        )}
      </div>
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
      <span className="font-mono uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
