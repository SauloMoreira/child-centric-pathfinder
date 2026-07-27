import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  X,
  BookOpen,
  Trash2,
  FileText,
  Scale,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Lock,
  GripVertical,
  Copy,
  RefreshCw,
  User,
  Layers,
  Pencil,
  Check,
} from "lucide-react";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEstadoInstitucional, isDefensor } from "@/hooks/use-estado-institucional";
import {
  adicionarCardWorkspace,
  criarColunaWorkspace,
  excluirColunaWorkspace,
  isConcurrentChangeError,
  listarBiblioteca,
  listarWorkspaceCompleto,
  moverCardWorkspace,
  moverColunaWorkspace,
  removerCardWorkspace,
  reordenarColunasWorkspace,
  workspaceKeys,
  type WorkspaceAccess,
  type WorkspaceCardDto,
  type WorkspaceColumn,
  type WorkspaceMeta,
} from "@/lib/reintegra-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useWorkArea,
  useSelectedPanel,
  type PanelSummary,
} from "@/features/work-area";
import { PanelTabs } from "@/features/work-area/components/PanelTabs";
import { CreatePanelSheet } from "@/features/work-area/components/CreatePanelSheet";
import { RenamePanelSheet } from "@/features/work-area/components/RenamePanelSheet";
import { ArchivePanelDialog } from "@/features/work-area/components/ArchivePanelDialog";
import { panelIconComponent } from "@/features/work-area/components/panel-icon";

export const Route = createFileRoute("/_authenticated/area-de-trabalho")({
  head: () => ({
    meta: [
      { title: "Área de trabalho — Ágora" },
      {
        name: "description",
        content:
          "Área de trabalho pessoal do Defensor Público — organize atendimentos e cotas em Painéis independentes.",
      },
    ],
  }),
  component: AreaDeTrabalhoPage,
});

function AreaDeTrabalhoPage() {
  const { data: estado } = useEstadoInstitucional();
  const defensorId = isDefensor(estado) ? estado?.user_id ?? null : null;

  if (!estado) {
    return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!defensorId) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="surface-panel p-6">
          <h1 className="text-lg font-semibold">Área de trabalho indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione um Defensor vinculado para acessar a Área de Trabalho dele.
          </p>
        </div>
      </div>
    );
  }
  return <WorkArea defensorId={defensorId} contextoNome={estado.profile?.nome_completo ?? "Defensor(a) Público(a)"} />;
}

// -----------------------------------------------------------------------------
// aria-live singleton (scoped per page mount)
// -----------------------------------------------------------------------------
function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((m: string) => {
    // reset first so the same message re-announces
    setMessage("");
    requestAnimationFrame(() => setMessage(m));
  }, []);
  const node = (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
  return { announce, node };
}

// -----------------------------------------------------------------------------
// Root WorkArea
// -----------------------------------------------------------------------------
function WorkArea({ defensorId, contextoNome }: { defensorId: string; contextoNome: string }) {
  const workArea = useWorkArea(defensorId);
  const panels = workArea.data?.panels ?? [];
  const { selectedId, selectedPanel, select } = useSelectedPanel(defensorId, panels);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<PanelSummary | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PanelSummary | null>(null);
  const access = workArea.data?.access;

  if (workArea.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-sm text-muted-foreground">
        Carregando Área de Trabalho…
      </div>
    );
  }
  if (workArea.forbidden) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="surface-panel p-6">
          <h1 className="text-lg font-semibold">Sem acesso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você não possui vínculo ativo para visualizar esta Área de Trabalho.
          </p>
        </div>
      </div>
    );
  }
  if (workArea.isError && !workArea.notInitialized) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="surface-panel p-6">
          <h1 className="text-lg font-semibold">Não foi possível carregar a Área de Trabalho</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Atualize a página ou tente novamente em instantes.
          </p>
          <div className="mt-4">
            <Button size="sm" variant="outline" onClick={() => workArea.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (workArea.notInitialized || panels.length === 0 || !access) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="surface-panel p-6">
          <h1 className="text-lg font-semibold">Área de Trabalho ainda não inicializada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {workArea.isOwner
              ? "Estamos preparando sua Área de Trabalho. Recarregue em instantes."
              : "O Defensor ainda não possui Painéis criados."}
          </p>
        </div>
      </div>
    );
  }

  const activePanelId = selectedId ?? panels[0]?.id ?? null;
  const activePanel = selectedPanel ?? panels[0] ?? null;

  const contextoLabel =
    access.accessMode === "owner"
      ? "Sua área de trabalho pessoal"
      : access.accessMode === "team_readonly"
        ? "Somente leitura · Membro da equipe"
        : access.accessMode === "technical_readonly"
          ? "Modo técnico · Somente leitura"
          : "";

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-canvas"
      style={{ ["--work-area-header-total" as string]: "12.5rem" }}
    >
      {/* Cabeçalho institucional */}
      <header className="border-b border-border bg-surface px-4 py-4 lg:px-8 lg:py-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Ágora · Área de trabalho
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
              Área de Trabalho
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" aria-hidden />
                <span className="truncate max-w-[18rem] sm:max-w-none">{contextoNome}</span>
              </span>
              {contextoLabel && (
                <>
                  <span aria-hidden className="text-muted-foreground/40">·</span>
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-[0.18em]",
                      access.accessMode === "technical_readonly"
                        ? "text-warning-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {contextoLabel}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to="/biblioteca">
                <BookOpen className="h-4 w-4" /> Biblioteca
              </Link>
            </Button>
          </div>
        </div>

        {/* Barra de Painéis */}
        <div className="mt-4">
          <p className="mb-1.5 px-1 font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
            Painéis
          </p>
          <PanelTabs
            defenderUserId={defensorId}
            panels={panels}
            selectedId={activePanelId}
            onSelect={select}
            access={access}
            onCreate={() => setCreateOpen(true)}
            onRename={(p) => setRenameTarget(p)}
            onArchive={(p) => setArchiveTarget(p)}
          />
        </div>
      </header>

      {/* Corpo — Painel selecionado */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activePanelId ? (
          <PanelBoard
            key={activePanelId}
            defensorId={defensorId}
            panelId={activePanelId}
            activePanel={activePanel}
            allPanels={panels}
          />
        ) : (
          <div className="m-4 flex-1 rounded-lg border border-dashed border-border bg-surface/60 p-12 text-center text-sm text-muted-foreground lg:m-8">
            Selecione um Painel na barra acima.
          </div>
        )}
      </div>

      <CreatePanelSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        defenderUserId={defensorId}
        currentCount={panels.length}
        onCreated={(id) => select(id)}
      />
      <RenamePanelSheet
        open={!!renameTarget}
        onOpenChange={(v) => !v && setRenameTarget(null)}
        defenderUserId={defensorId}
        panel={renameTarget}
      />
      <ArchivePanelDialog
        open={!!archiveTarget}
        onOpenChange={(v) => !v && setArchiveTarget(null)}
        defenderUserId={defensorId}
        panel={archiveTarget}
        onArchived={(nextId) => {
          if (nextId) select(nextId);
        }}
      />
    </div>
  );
}

function PanelHeadingIcon({ iconName }: { iconName: string | null }) {
  const Icon = panelIconComponent(iconName);
  return <Icon className="h-5 w-5 text-institutional" aria-hidden />;
}



// -----------------------------------------------------------------------------
// PanelBoard — carrega apenas o Painel selecionado
// -----------------------------------------------------------------------------
function PanelBoard({
  defensorId,
  panelId,
  activePanel,
  allPanels,
}: {
  defensorId: string;
  panelId: string;
  activePanel: PanelSummary | null;
  allPanels: PanelSummary[];
}) {
  const qc = useQueryClient();
  const key = [...workspaceKeys.byDefender(defensorId), panelId] as const;

  const workspaceQuery = useQuery({
    queryKey: key,
    queryFn: () => listarWorkspaceCompleto(defensorId, panelId),
  });

  const data = workspaceQuery.data;

  if (workspaceQuery.isLoading) {
    return (
      <div className="m-4 flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-surface/60 p-12 text-sm text-muted-foreground lg:m-8">
        Carregando Painel…
      </div>
    );
  }
  if (!data?.workspace) {
    return (
      <div className="m-4 flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-surface/60 p-12 text-sm text-muted-foreground lg:m-8">
        Painel indisponível.
      </div>
    );
  }
  // Guard contra respostas tardias após troca de Painel
  if (data.workspace.id !== panelId) {
    return null;
  }

  return (
    <ColumnsBoard
      defensorId={defensorId}
      workspace={data.workspace}
      access={data.access}
      columns={data.columns}
      cards={data.cards}
      activePanel={activePanel}
      allPanels={allPanels}
      isFetching={workspaceQuery.isFetching}
      onRefetch={() => qc.invalidateQueries({ queryKey: key })}
    />
  );
}


// -----------------------------------------------------------------------------
// ColumnsBoard — DnD de colunas + cards
// -----------------------------------------------------------------------------
type DragActive =
  | { type: "column"; id: string }
  | { type: "card"; id: string; card: WorkspaceCardDto }
  | null;

function ColumnsBoard({
  defensorId,
  workspace,
  access,
  columns,
  cards,
  activePanel,
  allPanels,
  isFetching,
  onRefetch,
}: {
  defensorId: string;
  workspace: WorkspaceMeta;
  access: WorkspaceAccess;
  columns: WorkspaceColumn[];
  cards: WorkspaceCardDto[];
  activePanel: PanelSummary | null;
  allPanels: PanelSummary[];
  isFetching: boolean;
  onRefetch: () => void;
}) {
  const qc = useQueryClient();
  const panelKey = [...workspaceKeys.byDefender(defensorId), workspace.id] as const;
  const { announce, node: liveNode } = useAnnouncer();

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, WorkspaceCardDto[]>();
    for (const col of columns) map.set(col.id, []);
    for (const card of cards) {
      const bucket = map.get(card.columnId);
      if (bucket) bucket.push(card);
    }
    for (const list of map.values()) list.sort((a, b) => a.orderPosition - b.orderPosition);
    return map;
  }, [columns, cards]);

  const handleMutationError = useCallback(
    (e: unknown) => {
      if (isConcurrentChangeError(e)) {
        toast.error(
          "O Painel foi alterado em outra sessão. Atualizamos o Kanban para exibir a versão mais recente.",
        );
        qc.invalidateQueries({ queryKey: panelKey });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/LAST_WORKSPACE_COLUMN/i.test(msg)) {
        toast.error("O Painel precisa possuir ao menos uma coluna.");
        return;
      }
      if (/ITEM_ALREADY_IN_WORKSPACE|DUPLICATE_PANEL_ITEM|23505/i.test(msg)) {
        toast.error("Este conteúdo já está adicionado ao Painel selecionado.");
        return;
      }
      toast.error(e instanceof Error ? e.message : "Falha ao processar operação");
    },
    [qc, panelKey],
  );

  const criarCol = useMutation({
    mutationFn: (nome: string) =>
      criarColunaWorkspace({
        workspaceId: workspace.id,
        expectedWorkspaceVersion: workspace.optimisticVersion,
        nome,
      }),
    onSuccess: () => {
      announce("Coluna criada");
      onRefetch();
    },
    onError: handleMutationError,
  });

  const moverCol = useMutation({
    mutationFn: (v: { columnId: string; direction: "left" | "right" }) =>
      moverColunaWorkspace({
        columnId: v.columnId,
        direction: v.direction,
        expectedWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: onRefetch,
    onError: handleMutationError,
  });

  const reorderCols = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reordenarColunasWorkspace({
        workspaceId: workspace.id,
        orderedColumnIds: orderedIds,
        expectedWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: onRefetch,
    onError: handleMutationError,
  });

  const excluirCol = useMutation({
    mutationFn: (v: { columnId: string; destinationColumnId: string | null }) =>
      excluirColunaWorkspace({
        columnId: v.columnId,
        destinationColumnId: v.destinationColumnId,
        expectedWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: () => {
      announce("Coluna excluída");
      onRefetch();
    },
    onError: handleMutationError,
  });

  const removerCard = useMutation({
    mutationFn: (cardId: string) =>
      removerCardWorkspace({
        cardId,
        expectedWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: () => {
      announce("Card removido do Painel");
      onRefetch();
    },
    onError: handleMutationError,
  });

  const moverCard = useMutation({
    mutationFn: (v: { cardId: string; targetColumnId: string; newPosition: number }) =>
      moverCardWorkspace({
        cardId: v.cardId,
        targetColumnId: v.targetColumnId,
        newPosition: v.newPosition,
        expectedWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: onRefetch,
    onError: handleMutationError,
  });

  // ---- DnD ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [dragActive, setDragActive] = useState<DragActive>(null);

  // otimista local para reorder de colunas
  const [columnOrderOverride, setColumnOrderOverride] = useState<string[] | null>(null);
  useEffect(() => setColumnOrderOverride(null), [columns]);
  const orderedColumns = useMemo(() => {
    if (!columnOrderOverride) return columns;
    const byId = new Map(columns.map((c) => [c.id, c] as const));
    const out: WorkspaceColumn[] = [];
    for (const id of columnOrderOverride) {
      const c = byId.get(id);
      if (c) out.push(c);
    }
    return out;
  }, [columns, columnOrderOverride]);

  const columnIds = useMemo(() => orderedColumns.map((c) => `column:${c.id}`), [orderedColumns]);

  const onDragStart = (e: DragStartEvent) => {
    const raw = String(e.active.id);
    if (raw.startsWith("column:")) {
      setDragActive({ type: "column", id: raw.slice("column:".length) });
    } else if (raw.startsWith("card:")) {
      const id = raw.slice("card:".length);
      const card = cards.find((c) => c.cardId === id);
      if (card) setDragActive({ type: "card", id, card });
    }
  };

  const parseTargetColumn = (overId: string | null): string | null => {
    if (!overId) return null;
    if (overId.startsWith("col-drop:")) return overId.slice("col-drop:".length);
    if (overId.startsWith("card:")) {
      const cid = overId.slice("card:".length);
      return cards.find((c) => c.cardId === cid)?.columnId ?? null;
    }
    return null;
  };

  const onDragEnd = (e: DragEndEvent) => {
    const previous = dragActive;
    setDragActive(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || activeId === overId) return;

    // --- reordenar colunas ---
    if (activeId.startsWith("column:") && overId.startsWith("column:")) {
      if (!access.canManageColumns) return;
      const from = orderedColumns.findIndex((c) => `column:${c.id}` === activeId);
      const to = orderedColumns.findIndex((c) => `column:${c.id}` === overId);
      if (from < 0 || to < 0 || from === to) return;
      const nextIds = arrayMove(orderedColumns, from, to).map((c) => c.id);
      setColumnOrderOverride(nextIds);
      const movedName = orderedColumns[from]?.nome ?? "Coluna";
      announce(`Coluna "${movedName}" movida para a posição ${to + 1}.`);
      reorderCols.mutate(nextIds, {
        onError: () => setColumnOrderOverride(null),
      });
      return;
    }

    // --- mover card ---
    if (activeId.startsWith("card:") && previous?.type === "card") {
      if (!access.canMoveCards) return;
      const cardId = previous.id;
      const card = previous.card;

      const targetColumnId = parseTargetColumn(overId);
      if (!targetColumnId) return;

      const targetList = cardsByColumn.get(targetColumnId) ?? [];
      let targetPosition = targetList.length;
      if (overId.startsWith("card:")) {
        const targetCardId = overId.slice("card:".length);
        const idx = targetList.findIndex((c) => c.cardId === targetCardId);
        if (idx >= 0) targetPosition = idx;
      }
      if (card.columnId === targetColumnId && targetPosition === card.orderPosition) return;

      const targetColName =
        orderedColumns.find((c) => c.id === targetColumnId)?.nome ?? "coluna";
      const kindLabel = card.kind === "cota" ? "Cota" : "Atendimento";
      announce(`${kindLabel} movido para a coluna "${targetColName}".`);

      moverCard.mutate({
        cardId,
        targetColumnId,
        newPosition: targetPosition,
      });
    }
  };

  const onDragCancel = () => setDragActive(null);

  const [creatorOpen, setCreatorOpen] = useState(false);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  // "Adicionar a outro Painel"
  const [copyTarget, setCopyTarget] = useState<WorkspaceCardDto | null>(null);

  const totalCards = cards.length;
  const PanelIcon = panelIconComponent(activePanel?.icon ?? null);

  return (
    <>
      {liveNode}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {/* Barra operacional do painel */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface/80 px-4 py-2.5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <PanelIcon className="h-4 w-4 shrink-0 text-institutional" aria-hidden />
            <span className="truncate text-sm font-semibold text-foreground">
              {activePanel?.name ?? "Painel"}
            </span>
          </div>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <Layers className="h-3.5 w-3.5" aria-hidden />
            {orderedColumns.length} {orderedColumns.length === 1 ? "coluna" : "colunas"}
          </span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {totalCards} {totalCards === 1 ? "card" : "cards"}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => onRefetch()}
              disabled={isFetching}
              title="Atualizar Painel"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
                aria-hidden
              />
              Atualizar
            </Button>
            {access.canManageColumns && (
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => {
                  setCreatorOpen(true);
                  // rola para o fim para o input ficar visível
                  requestAnimationFrame(() => {
                    const el = boardScrollRef.current;
                    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
                  });
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Nova coluna
              </Button>
            )}
          </div>
        </div>

        {/* Board — altura calculada para permitir rolagem vertical dentro das colunas */}
        <div
          ref={boardScrollRef}
          className="kanban-scroll flex-1 overflow-x-auto overflow-y-hidden px-4 py-4 lg:px-8"
          style={{
            minHeight: 0,
          }}
        >
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            <div className="flex h-full min-w-max items-stretch gap-4">
              {orderedColumns.map((c, idx) => (
                <SortableColumn
                  key={c.id}
                  column={c}
                  index={idx}
                  totalColumns={orderedColumns.length}
                  allColumns={orderedColumns}
                  cards={cardsByColumn.get(c.id) ?? []}
                  access={access}
                  workspace={workspace}
                  onMoveCol={(dir) => moverCol.mutate({ columnId: c.id, direction: dir })}
                  onDeleteCol={(destinationColumnId) =>
                    excluirCol.mutate({ columnId: c.id, destinationColumnId })
                  }
                  onRemoveCard={(cardId) => removerCard.mutate(cardId)}
                  onMoveCard={(cardId, targetColumnId, newPosition) =>
                    moverCard.mutate({ cardId, targetColumnId, newPosition })
                  }
                  onCopyToPanel={(card) => setCopyTarget(card)}
                  onAdded={onRefetch}
                />
              ))}

              {access.canManageColumns && (
                <AddColumnCard
                  open={creatorOpen}
                  setOpen={setCreatorOpen}
                  onSubmit={(nome) => {
                    criarCol.mutate(nome, {
                      onSuccess: () => setCreatorOpen(false),
                    });
                  }}
                  isPending={criarCol.isPending}
                />
              )}
            </div>
          </SortableContext>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragActive?.type === "column" ? (
            <ColumnDragPreview
              name={orderedColumns.find((c) => c.id === dragActive.id)?.nome ?? ""}
            />
          ) : dragActive?.type === "card" ? (
            <CardDragPreview card={dragActive.card} />
          ) : null}
        </DragOverlay>
      </DndContext>

      <MoveToPanelDialog
        open={!!copyTarget}
        onOpenChange={(v) => !v && setCopyTarget(null)}
        card={copyTarget}
        currentPanelId={workspace.id}
        defensorId={defensorId}
        allPanels={allPanels}
        onDone={(panelName) => {
          if (panelName) announce(`Card adicionado ao Painel "${panelName}".`);
          setCopyTarget(null);
        }}
      />
    </>
  );
}

// -----------------------------------------------------------------------------
// AddColumnCard — placeholder integrado ao Kanban
// -----------------------------------------------------------------------------
function AddColumnCard({
  open,
  setOpen,
  onSubmit,
  isPending,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onSubmit: (nome: string) => void;
  isPending: boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setValue("");
    }
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="kanban-column group flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 border-dashed bg-surface/40 text-sm text-muted-foreground transition-colors hover:border-institutional/60 hover:bg-institutional/[0.04] hover:text-institutional"
      >
        <Plus className="h-5 w-5" aria-hidden />
        Nova coluna
      </button>
    );
  }

  return (
    <form
      className="kanban-column flex h-full min-h-[16rem] flex-col gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const n = value.trim();
        if (!n) return;
        onSubmit(n);
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Nova coluna
        </span>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={() => setOpen(false)}
          aria-label="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Nome da coluna"
        className="h-9"
        maxLength={80}
      />
      <div className="mt-auto flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={isPending || !value.trim()}>
          Criar
        </Button>
      </div>
    </form>
  );
}


// -----------------------------------------------------------------------------
// SortableColumn
// -----------------------------------------------------------------------------
const VALID_COL_COLORS = new Set([
  "neutral",
  "green",
  "blue",
  "amber",
  "burgundy",
  "purple",
  "slate",
  "rose",
]);


function SortableColumn(props: {
  column: WorkspaceColumn;
  index: number;
  totalColumns: number;
  allColumns: WorkspaceColumn[];
  cards: WorkspaceCardDto[];
  access: WorkspaceAccess;
  workspace: WorkspaceMeta;
  onMoveCol: (dir: "left" | "right") => void;
  onDeleteCol: (destinationColumnId: string | null) => void;
  onRemoveCard: (cardId: string) => void;
  onMoveCard: (cardId: string, targetColumnId: string, newPosition: number) => void;
  onCopyToPanel: (card: WorkspaceCardDto) => void;
  onAdded: () => void;
}) {
  const {
    column,
    index,
    totalColumns,
    allColumns,
    cards,
    access,
    workspace,
    onMoveCol,
    onDeleteCol,
    onRemoveCard,
    onMoveCard,
    onCopyToPanel,
    onAdded,
  } = props;

  const sortable = useSortable({
    id: `column:${column.id}`,
    disabled: !access.canManageColumns,
    data: { type: "column", panelId: workspace.id, columnId: column.id },
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };

  const colorToken = VALID_COL_COLORS.has(column.corToken) ? column.corToken : "neutral";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const otherColumns = allColumns.filter((c) => c.id !== column.id);

  const cardIds = useMemo(() => cards.map((c) => `card:${c.cardId}`), [cards]);

  // droppable para coluna vazia / drop-into-column
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `col-drop:${column.id}`,
    data: { type: "column-drop", panelId: workspace.id, columnId: column.id },
  });

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      data-col-color={colorToken}
      className="kanban-column relative flex h-full min-h-0 flex-col overflow-hidden"
    >
      {/* faixa lateral colorida */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          backgroundColor: column.corCustom ?? "var(--col-accent)",
        }}
      />

      {/* cabeçalho colorido */}
      <header
        className="flex shrink-0 items-start justify-between gap-2 border-b border-border pl-4 pr-2 py-2.5"
        style={{ backgroundColor: "var(--col-accent-soft)" }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {access.canManageColumns && (
              <button
                type="button"
                className="cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
                aria-label={`Arrastar coluna ${column.nome}`}
                {...sortable.attributes}
                {...sortable.listeners}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            )}
            <h3
              className="truncate text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--col-accent-strong)" }}
            >
              {column.nome}
            </h3>
            <span
              className="ml-auto inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold text-surface"
              style={{ backgroundColor: "var(--col-accent)" }}
              aria-label={`${cards.length} cards`}
            >
              {cards.length}
            </span>
          </div>
          {column.descricao && (
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
              {column.descricao}
            </p>
          )}
        </div>
        {access.canManageColumns && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-surface/60 hover:text-foreground"
                aria-label="Ações da coluna"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={index === 0} onClick={() => onMoveCol("left")}>
                <ChevronLeft className="mr-2 h-4 w-4" /> Mover para a esquerda
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === totalColumns - 1}
                onClick={() => onMoveCol("right")}
              >
                <ChevronRight className="mr-2 h-4 w-4" /> Mover para a direita
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                disabled={totalColumns <= 1}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir coluna
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* corpo com rolagem interna */}
      <div
        ref={setDropRef}
        className={cn(
          "kanban-scroll flex-1 min-h-0 space-y-2 overflow-y-auto pl-4 pr-2 py-2.5 transition",
          isOver && "bg-institutional/[0.04] ring-1 ring-inset ring-institutional/30",
        )}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card, ci) => (
            <SortableCard
              key={card.cardId}
              card={card}
              access={access}
              index={ci}
              columnCount={cards.length}
              otherColumns={otherColumns}
              onRemove={() => onRemoveCard(card.cardId)}
              onMoveUp={() =>
                onMoveCard(card.cardId, column.id, Math.max(0, ci - 1))
              }
              onMoveDown={() =>
                onMoveCard(card.cardId, column.id, Math.min(cards.length - 1, ci + 1))
              }
              onMoveToColumn={(targetId) =>
                onMoveCard(card.cardId, targetId, Number.MAX_SAFE_INTEGER)
              }
              onCopyToPanel={() => onCopyToPanel(card)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border/70 text-center text-[11px] text-muted-foreground">
            Arraste ou adicione um card
          </div>
        )}
      </div>

      {/* rodapé pegajoso — adicionar card */}
      {access.canAddItems && (
        <footer className="shrink-0 border-t border-border bg-surface/70 pl-4 pr-2 py-2">
          <AddCardDialog
            columnId={column.id}
            workspace={workspace}
            existingItemIds={cards.map((c) => c.itemId)}
            onAdded={onAdded}
          />
        </footer>
      )}

      {confirmDelete && (
        <DeleteColumnDialog
          column={column}
          cards={cards}
          otherColumns={otherColumns}
          onClose={() => setConfirmDelete(false)}
          onConfirm={(destId) => {
            onDeleteCol(destId);
            setConfirmDelete(false);
          }}
        />
      )}
    </div>
  );
}


function ColumnDragPreview({ name }: { name: string }) {
  return (
    <div className="w-72 rounded-md border-2 border-institutional bg-card p-3 shadow-lg opacity-90 pointer-events-none">
      <div className="flex items-center gap-2">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="truncate text-sm font-semibold">{name}</h3>
      </div>
    </div>
  );
}

function CardDragPreview({ card }: { card: WorkspaceCardDto }) {
  const isCota = card.kind === "cota";
  const Icon = isCota ? Scale : FileText;
  return (
    <div className="w-72 rounded-md border-2 border-institutional bg-card p-3 shadow-lg opacity-90 pointer-events-none">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
        <p className="text-sm font-medium leading-tight">{card.title}</p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// DeleteColumnDialog
// -----------------------------------------------------------------------------
function DeleteColumnDialog({
  column,
  cards,
  otherColumns,
  onClose,
  onConfirm,
}: {
  column: WorkspaceColumn;
  cards: WorkspaceCardDto[];
  otherColumns: WorkspaceColumn[];
  onClose: () => void;
  onConfirm: (destinationId: string | null) => void;
}) {
  const [destId, setDestId] = useState<string>(otherColumns[0]?.id ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir coluna “{column.nome}”</DialogTitle>
        </DialogHeader>
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            A coluna está vazia e será removida do Painel.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Esta coluna possui {cards.length} card(s). Selecione outra coluna do mesmo Painel
              para recebê-los antes da exclusão.
            </p>
            <Label htmlFor="dest">Coluna de destino</Label>
            <select
              id="dest"
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {otherColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={cards.length > 0 && !destId}
            onClick={() => onConfirm(cards.length === 0 ? null : destId)}
          >
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// SortableCard
// -----------------------------------------------------------------------------
function SortableCard(props: {
  card: WorkspaceCardDto;
  access: WorkspaceAccess;
  index: number;
  columnCount: number;
  otherColumns: WorkspaceColumn[];
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToColumn: (targetId: string) => void;
  onCopyToPanel: () => void;
}) {
  const {
    card,
    access,
    index,
    columnCount,
    otherColumns,
    onRemove,
    onMoveUp,
    onMoveDown,
    onMoveToColumn,
    onCopyToPanel,
  } = props;

  const sortable = useSortable({
    id: `card:${card.cardId}`,
    disabled: !access.canMoveCards,
    data: { type: "card", cardId: card.cardId, columnId: card.columnId },
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };

  const isCota = card.kind === "cota";
  const Icon = isCota ? Scale : FileText;
  const badgeLabel = isCota ? "Cota" : "Atendimento";
  const badgeClass = isCota
    ? "bg-amber-100 text-amber-900 border-amber-200"
    : "bg-blue-100 text-blue-900 border-blue-200";
  const statusLabel: Record<string, string> = {
    rascunho: "Rascunho",
    publicado: "Publicado",
    arquivado: "Arquivado pelo autor",
  };
  const primaryAction = card.canOpen
    ? isCota
      ? "Abrir cota"
      : card.canEdit && card.status === "rascunho"
        ? "Editar atendimento"
        : "Utilizar atendimento"
    : "Disponível após publicação";

  return (
    <article
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-institutional",
        !card.canOpen && "opacity-70",
      )}
    >
      <div className="flex items-start gap-2">
        {access.canMoveCards && (
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
            aria-label="Arrastar card"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline" className={cn("text-[10px]", badgeClass)}>
              {badgeLabel}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {statusLabel[card.status] ?? card.status}
            </Badge>
            {card.placement === "imported" && (
              <Badge variant="outline" className="text-[10px]">
                Importado
              </Badge>
            )}
            {card.placement === "owned" && (
              <Badge variant="outline" className="text-[10px]">
                Meu
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm font-medium leading-tight">{card.title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {card.categoryNames.join(" · ") || "—"} · {card.ownerDisplayName}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-1">
        {card.canOpen ? (
          <Link
            to="/biblioteca/$itemId"
            params={{ itemId: card.itemId }}
            className="text-[11px] font-medium text-institutional hover:underline"
          >
            {primaryAction}
          </Link>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> {primaryAction}
          </span>
        )}

        {access.canMoveCards && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1 text-muted-foreground hover:text-foreground"
                aria-label="Ações do card"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={index === 0} onClick={onMoveUp}>
                <ArrowUp className="mr-2 h-4 w-4" /> Mover para cima
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === columnCount - 1}
                onClick={onMoveDown}
              >
                <ArrowDown className="mr-2 h-4 w-4" /> Mover para baixo
              </DropdownMenuItem>
              {otherColumns.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Mover para outra coluna
                  </DropdownMenuLabel>
                  {otherColumns.map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => onMoveToColumn(c.id)}>
                      {c.nome}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onCopyToPanel}>
                <Copy className="mr-2 h-4 w-4" /> Adicionar a outro Painel
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={onRemove}>
                <X className="mr-2 h-4 w-4" /> Remover deste Painel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------
// AddCardDialog
// -----------------------------------------------------------------------------
function AddCardDialog({
  columnId,
  workspace,
  existingItemIds,
  onAdded,
}: {
  columnId: string;
  workspace: WorkspaceMeta;
  existingItemIds: string[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const qc = useQueryClient();

  const bibQuery = useQuery({
    queryKey: ["biblioteca-picker", query],
    queryFn: () => listarBiblioteca({ query: query.trim() || undefined, limit: 20 }),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: () =>
      adicionarCardWorkspace({
        columnId,
        itemId: selecionado!,
        expectedWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: () => {
      toast.success("Card adicionado");
      onAdded();
      setOpen(false);
      setSelecionado(null);
      setQuery("");
    },
    onError: (e: unknown) => {
      if (isConcurrentChangeError(e)) {
        toast.error(
          "O Painel foi alterado em outra sessão. Atualizamos o Kanban para exibir a versão mais recente.",
        );
        qc.invalidateQueries({
          queryKey: workspaceKeys.byDefender(workspace.defensorUserId),
        });
        setOpen(false);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/ITEM_ALREADY_IN_WORKSPACE|DUPLICATE_PANEL_ITEM|23505/i.test(msg)) {
        toast.error("Este conteúdo já está adicionado ao Painel selecionado.");
        return;
      }
      if (/ITEM_NOT_PUBLISHED/i.test(msg)) {
        toast.error("Somente conteúdos publicados podem ser importados.");
        return;
      }
      if (/ITEM_NOT_VISIBLE/i.test(msg)) {
        toast.error("Este conteúdo não é compartilhável.");
        return;
      }
      toast.error("Falha ao adicionar card");
    },
  });

  const itens = bibQuery.data ?? [];
  const existing = new Set(existingItemIds);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <Plus className="h-4 w-4" /> Adicionar conteúdo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar atendimento ou cota</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar na Biblioteca…"
            autoFocus
          />
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1">
            {itens.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum conteúdo encontrado.
              </p>
            ) : (
              itens.map((i) => {
                const Icon = i.kind === "cota" ? Scale : FileText;
                const selected = selecionado === i.id;
                const alreadyIn = existing.has(i.id);
                return (
                  <button
                    key={i.id}
                    type="button"
                    disabled={alreadyIn}
                    onClick={() => !alreadyIn && setSelecionado(i.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded p-2 text-left text-xs transition",
                      alreadyIn
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-muted",
                      selected && "bg-muted",
                    )}
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.titulo}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {i.categoria_nome ?? "Sem categoria"} · {i.status}
                      </p>
                    </div>
                    {alreadyIn && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Já adicionado
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!selecionado || add.isPending}
            onClick={() => add.mutate()}
          >
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// MoveToPanelDialog — Adicionar card a outro Painel do mesmo Defensor
// -----------------------------------------------------------------------------
function MoveToPanelDialog({
  open,
  onOpenChange,
  card,
  currentPanelId,
  defensorId,
  allPanels,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: WorkspaceCardDto | null;
  currentPanelId: string;
  defensorId: string;
  allPanels: PanelSummary[];
  onDone: (panelName: string | null) => void;
}) {
  const qc = useQueryClient();
  const [targetPanelId, setTargetPanelId] = useState<string | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);

  const availablePanels = useMemo(
    () => allPanels.filter((p) => p.id !== currentPanelId && !p.archivedAt),
    [allPanels, currentPanelId],
  );

  useEffect(() => {
    if (open) {
      setTargetPanelId(null);
      setTargetColumnId(null);
    }
  }, [open]);

  const targetQuery = useQuery({
    queryKey: [...workspaceKeys.byDefender(defensorId), targetPanelId, "picker"],
    queryFn: () => listarWorkspaceCompleto(defensorId, targetPanelId!),
    enabled: !!targetPanelId,
  });

  const targetData = targetQuery.data;
  const targetWorkspace = targetData?.workspace ?? null;
  const targetColumns = targetData?.columns ?? [];

  useEffect(() => {
    if (targetColumns.length > 0 && !targetColumnId) {
      setTargetColumnId(targetColumns[0].id);
    }
  }, [targetColumns, targetColumnId]);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!card || !targetColumnId || !targetWorkspace) {
        throw new Error("Seleção incompleta");
      }
      return adicionarCardWorkspace({
        columnId: targetColumnId,
        itemId: card.itemId,
        expectedWorkspaceVersion: targetWorkspace.optimisticVersion,
      });
    },
    onSuccess: () => {
      const panelName =
        availablePanels.find((p) => p.id === targetPanelId)?.name ?? null;
      toast.success("Card adicionado ao outro Painel");
      qc.invalidateQueries({
        queryKey: [...workspaceKeys.byDefender(defensorId), targetPanelId],
      });
      onDone(panelName);
    },
    onError: (e: unknown) => {
      if (isConcurrentChangeError(e)) {
        toast.error(
          "O Painel de destino foi alterado. Atualizamos os dados; tente novamente.",
        );
        qc.invalidateQueries({
          queryKey: [...workspaceKeys.byDefender(defensorId), targetPanelId, "picker"],
        });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/ITEM_ALREADY_IN_WORKSPACE|DUPLICATE_PANEL_ITEM|23505/i.test(msg)) {
        toast.error("Este conteúdo já está adicionado ao Painel selecionado.");
        return;
      }
      if (/ITEM_NOT_PUBLISHED/i.test(msg)) {
        toast.error("Somente conteúdos publicados podem ser importados.");
        return;
      }
      toast.error("Falha ao adicionar ao outro Painel");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar a outro Painel</DialogTitle>
        </DialogHeader>
        {!card ? null : (
          <div className="grid gap-4">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Card selecionado
              </p>
              <p className="mt-1 text-sm font-medium">{card.title}</p>
            </div>

            <div className="grid gap-2">
              <Label>Painel de destino</Label>
              {availablePanels.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Você não possui outros Painéis ativos.
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-1">
                  {availablePanels.map((p) => {
                    const selected = p.id === targetPanelId;
                    const Icon = panelIconComponent(p.icon);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setTargetPanelId(p.id);
                          setTargetColumnId(null);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded p-2 text-left text-xs transition hover:bg-muted",
                          selected && "bg-muted",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 text-institutional" />
                        <span className="flex-1 truncate">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {targetPanelId && (
              <div className="grid gap-2">
                <Label htmlFor="target-col">Coluna de destino</Label>
                {targetQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando colunas…</p>
                ) : targetColumns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    O Painel selecionado não possui colunas.
                  </p>
                ) : (
                  <select
                    id="target-col"
                    value={targetColumnId ?? ""}
                    onChange={(e) => setTargetColumnId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {targetColumns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={
              !card ||
              !targetPanelId ||
              !targetColumnId ||
              !targetWorkspace ||
              addMutation.isPending
            }
            onClick={() => addMutation.mutate()}
          >
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
