import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, UserPlus, ShieldAlert, XCircle, Loader2 } from "lucide-react";
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
  useEstadoInstitucional,
  isDefensor,
  isAdminTecnico,
  isAtivo,
} from "@/hooks/use-estado-institucional";
import { EmptyState } from "@/components/team-kanban";
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
        content:
          "Gestão da equipe: membros vinculados ao Defensor, solicitações de acesso e histórico de vínculos.",
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

  const [linkOpen, setLinkOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [bondToEnd, setBondToEnd] = useState<DefenderBond | null>(null);

  const ctx = useCurrentDefenderContext();
  const targetDefenderId = defensor
    ? (estado?.user_id ?? null)
    : (ctx.current?.defenderUserId ?? null);

  const team = useDefenderTeam(targetDefenderId);
  const endBond = useEndBond(targetDefenderId);

  const members = useMemo(() => team.data?.members ?? [], [team.data]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.displayName ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q),
    );
  }, [members, busca]);

  const ativos = filtered.filter((m) => m.status === "ativo");
  const encerrados = filtered.filter((m) => m.status === "encerrado");

  const canLink = team.data?.canLinkMembers ?? false;
  const canEnd = team.data?.canEndBonds ?? false;

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
              {defensor
                ? "Membros com acesso somente leitura à sua Área de Trabalho."
                : ctx.current
                  ? `Equipe de ${ctx.current.displayName} · modo técnico`
                  : "Selecione um Defensor no seletor lateral."}
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
                className="h-9 w-64 pl-8"
              />
            </div>
            {canLink && ativo && (
              <Button onClick={() => setLinkOpen(true)}>
                <UserPlus className="mr-1 h-4 w-4" /> Vincular membro
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
          <MetricPill label="Ativos" value={ativos.length} tone="success" />
          <MetricPill label="Encerrados" value={encerrados.length} />
        </div>
      </div>

      {tecnico && !defensor && (
        <div className="px-4 pt-4 lg:px-8">
          <Badge
            variant="outline"
            className="gap-1.5 border-institutional/50 bg-institutional/10 font-mono text-[10px] uppercase tracking-[0.16em] text-institutional"
          >
            <ShieldAlert className="h-3 w-3" aria-hidden /> Modo técnico · somente leitura
          </Badge>
        </div>
      )}

      <div className="flex-1 p-4 lg:p-8">
        {!targetDefenderId ? (
          <EmptyState
            title="Nenhum Defensor selecionado"
            description="Use o seletor lateral para escolher um Defensor e visualizar a equipe dele."
          />
        ) : team.isLoading ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : team.error ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p>{friendlyTeamError(team.error, "Não foi possível carregar os vínculos.")}</p>
            <Button variant="outline" size="sm" onClick={() => void team.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : members.length === 0 ? (
          <EmptyState
            title="Sua equipe ainda não possui membros"
            description={
              defensor
                ? "Vincule um membro existente ou aprove uma solicitação de acesso para conceder acesso à sua Área de Trabalho."
                : "Este Defensor ainda não vinculou membros à equipe."
            }
            action={
              canLink && ativo ? (
                <Button onClick={() => setLinkOpen(true)}>
                  <UserPlus className="mr-1 h-4 w-4" /> Vincular primeiro membro
                </Button>
              ) : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nenhum resultado"
            description="Nenhum membro corresponde à busca informada."
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
      </div>

      <PendingAccessRequestsSection enabled={defensor && ativo} />

      {defensor && estado?.user_id && (
        <LinkMemberSheet
          open={linkOpen}
          onOpenChange={setLinkOpen}
          defenderUserId={estado.user_id}
        />
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
    </div>
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
              ? "border-muted-foreground/40 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              : "border-success/40 bg-success/10 font-mono text-[10px] uppercase tracking-[0.14em] text-success"
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
