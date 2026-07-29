import { useMemo, useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  X,
  Trash2,
  FileText,
  StickyNote,
  MessageSquare,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  GripVertical,
  Copy,
  User,
  Pencil,
  Check,
  Search,
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
  type CollisionDetection,
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
import { useCurrentDefenderContext } from "@/features/team/defender-bonds";
import {
  adicionarCardWorkspace,
  atualizarColunaWorkspace,
  criarColunaWorkspace,
  excluirColunaWorkspace,
  isConcurrentChangeError,
  listarBiblioteca,
  listarWorkspaceCompleto,
  obterCotaDetalhe,
  obterAtendimentoDetalhe,
  moverCardWorkspace,
  moverColunaWorkspace,
  removerCardWorkspace,
  reordenarColunasWorkspace,
  workspaceKeys,
  type WorkspaceAccess,
  type WorkspaceCardDto,
  type WorkspaceColor,
  type WorkspaceColumn,
  type WorkspaceMeta,
  type CotaDetalhe,
  type AtendimentoDetalhe,
} from "@/lib/reintegra-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn, copyRichText } from "@/lib/utils";
import { useWorkArea, useSelectedPanel, type PanelSummary } from "@/features/work-area";
import { PanelTabs } from "@/features/work-area/components/PanelTabs";
import { CreatePanelSheet } from "@/features/work-area/components/CreatePanelSheet";
import { RenamePanelSheet } from "@/features/work-area/components/RenamePanelSheet";
import { ArchivePanelDialog } from "@/features/work-area/components/ArchivePanelDialog";
import { panelIconComponent } from "@/features/work-area/components/panel-icon";
import { RequestDefenderAccessSheet } from "@/features/team/components/request-defender-access-sheet";
import { CotaFormSheet } from "@/components/cota/cota-form-sheet";
import { CotaDetailSheet } from "@/components/cota/cota-detail-sheet";
import { cotaKeys } from "@/features/cota/hooks";
import { AtendimentoFormSheet } from "@/components/atendimento/atendimento-form-sheet";
import { AtendimentoDetailSheet } from "@/components/atendimento/atendimento-detail-sheet";
import { atendimentoKeys } from "@/features/atendimento/hooks";

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
  const defenderContext = useCurrentDefenderContext();
  const isOwnerContext = defenderContext.mode === "owner" && isDefensor(estado);
  const defensorId = isOwnerContext
    ? (estado?.user_id ?? null)
    : (defenderContext.current?.defenderUserId ?? null);
  const contextoNome = isOwnerContext
    ? (estado?.profile?.nome_completo ?? "Defensor(a) Público(a)")
    : (defenderContext.current?.displayName ?? "Defensor(a) Público(a)");
  const [requestOpen, setRequestOpen] = useState(false);

  if (!estado) {
    return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!defensorId) {
    const isMemberMode = defenderContext.mode === "member";
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="surface-panel p-6">
          <h1 className="text-lg font-semibold">Área de trabalho indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isMemberMode
              ? "Você ainda não possui vínculo ativo com um Defensor Público. Solicite acesso para começar a acompanhar uma Área de Trabalho em modo somente leitura."
              : "Selecione um Defensor vinculado para acessar a Área de Trabalho dele."}
          </p>
          {isMemberMode && (
            <div className="mt-4">
              <Button onClick={() => setRequestOpen(true)}>Solicitar acesso a um Defensor</Button>
            </div>
          )}
        </div>
        <RequestDefenderAccessSheet open={requestOpen} onOpenChange={setRequestOpen} />
      </div>
    );
  }
  return <WorkArea defensorId={defensorId} contextoNome={contextoNome} />;
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
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
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
  const { selectedId, select } = useSelectedPanel(defensorId, panels);
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

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-canvas"
      style={{ ["--work-area-header-total" as string]: "12.5rem" }}
    >
      {/* Cabeçalho institucional */}
      <header className="border-b border-border bg-surface px-4 py-4 lg:px-8 lg:py-5">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            Área de Trabalho
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate max-w-[18rem] sm:max-w-none">{contextoNome}</span>
          </p>
        </div>

        {/* Barra de Painéis */}
        <div className="mt-4">
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
  allPanels,
}: {
  defensorId: string;
  panelId: string;
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
      allPanels={allPanels}
      onRefetch={() => qc.invalidateQueries({ queryKey: key })}
    />
  );
}

// -----------------------------------------------------------------------------
// ColumnsBoard — DnD de colunas + cards
// -----------------------------------------------------------------------------
type DragActive =
  { type: "column"; id: string } | { type: "card"; id: string; card: WorkspaceCardDto } | null;

/**
 * Colunas e cards compartilham o mesmo DndContext (colunas em um
 * SortableContext horizontal, cards em SortableContexts verticais dentro de
 * cada coluna). Sem esse filtro, `closestCenter` pode escolher um card como
 * alvo mais próximo ao arrastar uma coluna, fazendo o drag parecer que está
 * "entrando" no card em vez de trocar de posição com a coluna. Restringe os
 * candidatos de colisão ao mesmo tipo do item ativo (coluna só colide com
 * coluna; card colide com card ou com a área de soltura da coluna vazia).
 */
const dndCollisionDetection: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type;
  const containers = args.droppableContainers.filter((c) => {
    const t = c.data.current?.type;
    return activeType === "column" ? t === "column" : t !== "column";
  });
  return closestCenter({ ...args, droppableContainers: containers });
};

function ColumnsBoard({
  defensorId,
  workspace,
  access,
  columns,
  cards,
  allPanels,
  onRefetch,
}: {
  defensorId: string;
  workspace: WorkspaceMeta;
  access: WorkspaceAccess;
  columns: WorkspaceColumn[];
  cards: WorkspaceCardDto[];
  allPanels: PanelSummary[];
  onRefetch: () => void;
}) {
  const qc = useQueryClient();
  const panelKey = [...workspaceKeys.byDefender(defensorId), workspace.id] as const;
  const { announce, node: liveNode } = useAnnouncer();

  // Busca de cards no Painel aberto (título + texto da cota).
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  // Compactar/expandir colunas (Ajuste doc) — estado só de exibição, local
  // à sessão do navegador (não é salvo no Painel), já que o pedido é sobre
  // ganhar espaço horizontal na tela, não sobre uma preferência persistente.
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());
  const toggleColumnCollapsed = useCallback((columnId: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }, []);

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, WorkspaceCardDto[]>();
    for (const col of columns) map.set(col.id, []);
    for (const card of cards) {
      if (normalizedQuery) {
        const haystack = `${card.title} ${card.bodyText ?? ""}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) continue;
      }
      const bucket = map.get(card.columnId);
      if (bucket) bucket.push(card);
    }
    for (const list of map.values()) list.sort((a, b) => a.orderPosition - b.orderPosition);
    return map;
  }, [columns, cards, normalizedQuery]);

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
      if (
        /ITEM_ALREADY_IN_COLUMN|ITEM_ALREADY_IN_WORKSPACE|DUPLICATE_PANEL_ITEM|23505/i.test(msg)
      ) {
        toast.error("Este conteúdo já está adicionado a esta coluna.");
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

  const editarCol = useMutation({
    mutationFn: (v: {
      columnId: string;
      nome: string;
      descricao: string | null;
      corToken: WorkspaceColor;
    }) =>
      atualizarColunaWorkspace({
        columnId: v.columnId,
        expectedWorkspaceVersion: workspace.optimisticVersion,
        nome: v.nome,
        descricao: v.descricao ?? undefined,
        corToken: v.corToken,
        corCustom: null,
      }),
    onSuccess: () => {
      toast.success("Coluna atualizada");
      announce("Coluna atualizada");
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

  const collapseAllColumns = useCallback(() => {
    setCollapsedColumns(new Set(orderedColumns.map((c) => c.id)));
  }, [orderedColumns]);
  const expandAllColumns = useCallback(() => {
    setCollapsedColumns(new Set());
  }, []);

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

      const targetColName = orderedColumns.find((c) => c.id === targetColumnId)?.nome ?? "coluna";
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
  const boardContentRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollSyncSource = useRef<"top" | "board" | null>(null);
  const [boardContentWidth, setBoardContentWidth] = useState(0);
  const [boardOverflows, setBoardOverflows] = useState(false);

  // Espelha a largura/rolagem do board numa barra fina acima das colunas —
  // útil quando a barra de baixo sai da área visível da tela.
  useEffect(() => {
    const contentEl = boardContentRef.current;
    const scrollEl = boardScrollRef.current;
    if (!contentEl || !scrollEl) return;
    const update = () => {
      const contentWidth = contentEl.scrollWidth;
      setBoardContentWidth(contentWidth);
      setBoardOverflows(contentWidth > scrollEl.clientWidth + 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(contentEl);
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, []);

  const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollSyncSource.current === "board") {
      scrollSyncSource.current = null;
      return;
    }
    scrollSyncSource.current = "top";
    if (boardScrollRef.current) boardScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  const handleBoardScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollSyncSource.current === "top") {
      scrollSyncSource.current = null;
      return;
    }
    scrollSyncSource.current = "board";
    if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  // "Adicionar a outro Painel"
  const [copyTarget, setCopyTarget] = useState<WorkspaceCardDto | null>(null);

  // Cota: criar/editar (side sheet) e detalhe expandido (side sheet)
  const [cotaFormTarget, setCotaFormTarget] = useState<
    { mode: "create" } | { mode: "edit"; itemId: string; detalhe: CotaDetalhe } | null
  >(null);
  const [cotaFormOpen, setCotaFormOpen] = useState(false);
  const [cotaDetailId, setCotaDetailId] = useState<string | null>(null);

  const openEditCota = useCallback((detalhe: CotaDetalhe) => {
    setCotaFormTarget({ mode: "edit", itemId: detalhe.id, detalhe });
    setCotaFormOpen(true);
  }, []);

  const handleEditCota = useCallback(
    async (card: WorkspaceCardDto) => {
      try {
        const detalhe = await qc.fetchQuery({
          queryKey: cotaKeys.detalhe(card.itemId),
          queryFn: () => obterCotaDetalhe(card.itemId),
        });
        openEditCota(detalhe);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar a cota para edição");
      }
    },
    [qc, openEditCota],
  );

  // Atendimento: criar/editar (side sheet) e detalhe expandido (side sheet)
  const [atendimentoFormTarget, setAtendimentoFormTarget] = useState<
    { mode: "create" } | { mode: "edit"; itemId: string; detalhe: AtendimentoDetalhe } | null
  >(null);
  const [atendimentoFormOpen, setAtendimentoFormOpen] = useState(false);
  const [atendimentoDetailId, setAtendimentoDetailId] = useState<string | null>(null);
  // Ajuste doc — quando a edição é aberta a partir do detalhe (visualização),
  // guarda o id para reabrir o detalhe ao salvar ou cancelar, em vez de só
  // fechar a caixa de edição. Editar direto pelo card (menu da coluna) não
  // passa por aqui, então fica null e o fechamento é o de sempre.
  const [atendimentoReturnToDetailId, setAtendimentoReturnToDetailId] = useState<string | null>(null);

  const openEditAtendimento = useCallback((detalhe: AtendimentoDetalhe) => {
    setAtendimentoFormTarget({ mode: "edit", itemId: detalhe.id, detalhe });
    setAtendimentoFormOpen(true);
  }, []);

  const handleAtendimentoFormOpenChange = useCallback(
    (v: boolean) => {
      setAtendimentoFormOpen(v);
      if (!v && atendimentoReturnToDetailId) {
        setAtendimentoDetailId(atendimentoReturnToDetailId);
        setAtendimentoReturnToDetailId(null);
      }
    },
    [atendimentoReturnToDetailId],
  );

  const handleEditAtendimento = useCallback(
    async (card: WorkspaceCardDto) => {
      try {
        const detalhe = await qc.fetchQuery({
          queryKey: atendimentoKeys.detalhe(card.itemId),
          queryFn: () => obterAtendimentoDetalhe(card.itemId),
        });
        // Edição direta pelo card (não veio do detalhe) — ao fechar, some.
        setAtendimentoReturnToDetailId(null);
        openEditAtendimento(detalhe);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar o atendimento para edição");
      }
    },
    [qc, openEditAtendimento],
  );

  return (
    <>
      {liveNode}
      <DndContext
        sensors={sensors}
        collisionDetection={dndCollisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {/* Barra operacional do painel */}
        <div className="flex items-center gap-2 border-b border-border bg-surface/80 px-4 py-2.5 lg:px-8">
          <div className="flex flex-1 items-center">
            {searchOpen ? (
              <div className="relative w-full max-w-xs">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cota ou atendimento…"
                  className="h-8 pl-8 pr-8 text-xs"
                />
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Fechar busca"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
                Buscar
              </Button>
            )}
          </div>

          {access.accessMode === "owner" && (
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              onClick={() => {
                setAtendimentoFormTarget({ mode: "create" });
                setAtendimentoFormOpen(true);
              }}
            >
              <span className="inline-flex shrink-0 items-center gap-0.5">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                <Plus className="h-3 w-3" strokeWidth={3} aria-hidden />
              </span>
              Criar atendimento
            </Button>
          )}
          {access.accessMode === "owner" && (
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              onClick={() => {
                setCotaFormTarget({ mode: "create" });
                setCotaFormOpen(true);
              }}
            >
              <span className="inline-flex shrink-0 items-center gap-0.5">
                <StickyNote className="h-3.5 w-3.5" aria-hidden />
                <Plus className="h-3 w-3" strokeWidth={3} aria-hidden />
              </span>
              Criar cota
            </Button>
          )}
          {access.canManageColumns && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
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
              Criar coluna
            </Button>
          )}
        </div>

        {/* Espelho da barra de rolagem horizontal, acima das colunas — ajuda
            quando a barra de baixo sai da área visível da tela. */}
        {boardOverflows && (
          <div
            ref={topScrollRef}
            onScroll={handleTopScroll}
            className="kanban-scroll overflow-x-auto overflow-y-hidden pl-2 pr-4 lg:pl-3 lg:pr-8"
            style={{ height: 14 }}
            aria-hidden="true"
          >
            <div style={{ width: boardContentWidth, height: 1 }} />
          </div>
        )}

        {/* Board — altura calculada para permitir rolagem vertical dentro das colunas */}
        <div
          ref={boardScrollRef}
          onScroll={handleBoardScroll}
          className="kanban-scroll flex-1 overflow-x-auto overflow-y-hidden pl-2 pr-4 py-4 lg:pl-3 lg:pr-8"
          style={{
            minHeight: 0,
          }}
        >
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            <div ref={boardContentRef} className="flex h-full min-w-max items-stretch gap-4">
              {orderedColumns.length > 0 && (
                <div className="-mr-2.5 flex shrink-0 flex-col items-center justify-start gap-1 pt-1">
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    aria-label="Compactar todas as colunas"
                    title="Compactar todas as colunas"
                    onClick={collapseAllColumns}
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    aria-label="Expandir todas as colunas"
                    title="Expandir todas as colunas"
                    onClick={expandAllColumns}
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
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
                  onEditCol={(v) => editarCol.mutate({ columnId: c.id, ...v })}
                  onDeleteCol={(destinationColumnId) =>
                    excluirCol.mutate({ columnId: c.id, destinationColumnId })
                  }
                  onRemoveCard={(cardId) => removerCard.mutate(cardId)}
                  onMoveCard={(cardId, targetColumnId, newPosition) =>
                    moverCard.mutate({ cardId, targetColumnId, newPosition })
                  }
                  onCopyToPanel={(card) => setCopyTarget(card)}
                  onOpenCota={(card) => setCotaDetailId(card.itemId)}
                  onEditCota={handleEditCota}
                  onOpenAtendimento={(card) => setAtendimentoDetailId(card.itemId)}
                  onEditAtendimento={handleEditAtendimento}
                  onAdded={onRefetch}
                  isSearching={isSearching}
                  collapsed={collapsedColumns.has(c.id)}
                  onToggleCollapsed={() => toggleColumnCollapsed(c.id)}
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

      <CotaFormSheet
        open={cotaFormOpen}
        onOpenChange={setCotaFormOpen}
        target={cotaFormTarget}
        onSaved={onRefetch}
      />
      <CotaDetailSheet
        itemId={cotaDetailId}
        onOpenChange={(v) => !v && setCotaDetailId(null)}
        onEdit={() => {
          const detalhe = qc.getQueryData<CotaDetalhe>(cotaKeys.detalhe(cotaDetailId ?? ""));
          if (detalhe) {
            setCotaDetailId(null);
            openEditCota(detalhe);
          }
        }}
        onDeleted={() => {
          setCotaDetailId(null);
          onRefetch();
        }}
      />

      <AtendimentoFormSheet
        open={atendimentoFormOpen}
        onOpenChange={handleAtendimentoFormOpenChange}
        target={atendimentoFormTarget}
        onSaved={onRefetch}
      />
      <AtendimentoDetailSheet
        itemId={atendimentoDetailId}
        onOpenChange={(v) => !v && setAtendimentoDetailId(null)}
        onEdit={() => {
          const detalhe = qc.getQueryData<AtendimentoDetalhe>(
            atendimentoKeys.detalhe(atendimentoDetailId ?? ""),
          );
          if (detalhe) {
            // Ajuste doc — veio do detalhe: ao salvar/cancelar a edição,
            // volta para a visualização em vez de só fechar.
            setAtendimentoReturnToDetailId(detalhe.id);
            setAtendimentoDetailId(null);
            openEditAtendimento(detalhe);
          }
        }}
        onDeleted={() => {
          setAtendimentoDetailId(null);
          onRefetch();
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
        Criar coluna
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
          Criar coluna
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
const VALID_COL_COLORS = new Set<WorkspaceColor>([
  "neutral",
  "green",
  "blue",
  "amber",
  "burgundy",
  "purple",
  "slate",
  "rose",
]);

const COLUMN_COLOR_OPTIONS: { token: WorkspaceColor; label: string }[] = [
  { token: "neutral", label: "Neutro" },
  { token: "green", label: "Verde" },
  { token: "blue", label: "Azul" },
  { token: "purple", label: "Lilás" },
  { token: "rose", label: "Rosa" },
  { token: "amber", label: "Âmbar" },
  { token: "burgundy", label: "Bordô" },
  { token: "slate", label: "Marrom" },
];

function SortableColumn(props: {
  column: WorkspaceColumn;
  index: number;
  totalColumns: number;
  allColumns: WorkspaceColumn[];
  cards: WorkspaceCardDto[];
  access: WorkspaceAccess;
  workspace: WorkspaceMeta;
  onMoveCol: (dir: "left" | "right") => void;
  onEditCol: (v: { nome: string; descricao: string | null; corToken: WorkspaceColor }) => void;
  onDeleteCol: (destinationColumnId: string | null) => void;
  onRemoveCard: (cardId: string) => void;
  onMoveCard: (cardId: string, targetColumnId: string, newPosition: number) => void;
  onCopyToPanel: (card: WorkspaceCardDto) => void;
  onOpenCota: (card: WorkspaceCardDto) => void;
  onEditCota: (card: WorkspaceCardDto) => void;
  onOpenAtendimento: (card: WorkspaceCardDto) => void;
  onEditAtendimento: (card: WorkspaceCardDto) => void;
  onAdded: () => void;
  isSearching?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
    onEditCol,
    onDeleteCol,
    onRemoveCard,
    onMoveCard,
    onCopyToPanel,
    onOpenCota,
    onEditCota,
    onOpenAtendimento,
    onEditAtendimento,
    onAdded,
    isSearching,
    collapsed,
    onToggleCollapsed,
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

  const colorToken: WorkspaceColor = VALID_COL_COLORS.has(column.corToken)
    ? column.corToken
    : "neutral";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const otherColumns = allColumns.filter((c) => c.id !== column.id);

  const cardIds = useMemo(() => cards.map((c) => `card:${c.cardId}`), [cards]);

  // droppable para coluna vazia / drop-into-column
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `col-drop:${column.id}`,
    data: { type: "column-drop", panelId: workspace.id, columnId: column.id },
  });

  // Ajuste doc — coluna compactada: faixa estreita identificável pela cor,
  // com botão para expandir de volta. Mantém a posição no arrastamento
  // (o nó continua no mesmo lugar da SortableContext, só muda a largura).
  if (collapsed) {
    return (
      <div
        ref={sortable.setNodeRef}
        style={style}
        data-col-color={colorToken}
        className="kanban-column relative flex h-full min-h-0 w-7 shrink-0 flex-col items-center overflow-hidden"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: column.corCustom ?? "var(--col-accent)" }}
        />
        <button
          type="button"
          className="flex w-full shrink-0 items-center justify-center py-1.5 text-muted-foreground hover:text-foreground"
          style={{ backgroundColor: "var(--col-accent-soft)" }}
          aria-label={`Expandir coluna ${column.nome}`}
          title="Expandir coluna"
          onClick={onToggleCollapsed}
        >
          <ChevronsRight className="h-3 w-3" />
        </button>
        <div
          className="flex flex-1 min-h-0 items-center justify-center overflow-hidden py-1.5"
          title={column.nome}
        >
          <span
            className="truncate text-[11px] font-semibold"
            style={{
              color: "var(--col-accent-strong)",
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
            }}
          >
            {column.nome}
          </span>
        </div>
      </div>
    );
  }

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

      {/* cabeçalho colorido — arrastável por clique/segurar, como os cards
          (sem ícone de grip dedicado: o PointerSensor já exige ~5px de
          movimento antes de iniciar o drag, então um clique simples no
          menu de ações continua funcionando normalmente). */}
      <header
        className={cn(
          "flex shrink-0 items-start justify-between gap-2 border-b border-border pl-4 pr-2 py-2.5",
          access.canManageColumns && "cursor-grab touch-none active:cursor-grabbing",
        )}
        style={{ backgroundColor: "var(--col-accent-soft)" }}
        {...(access.canManageColumns ? { ...sortable.attributes, ...sortable.listeners } : {})}
      >
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-sm font-semibold"
            style={{ color: "var(--col-accent-strong)" }}
          >
            {column.nome}
          </h3>
          {column.descricao && (
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
              {column.descricao}
            </p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-surface/60 hover:text-foreground"
          aria-label="Compactar coluna"
          title="Compactar coluna"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        {access.canManageColumns && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-surface/60 hover:text-foreground"
                aria-label="Ações da coluna"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Editar coluna
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
              columnColor={colorToken}
              otherColumns={otherColumns}
              onRemove={() => onRemoveCard(card.cardId)}
              onMoveUp={() => onMoveCard(card.cardId, column.id, Math.max(0, ci - 1))}
              onMoveDown={() =>
                onMoveCard(card.cardId, column.id, Math.min(cards.length - 1, ci + 1))
              }
              onMoveToColumn={(targetId) =>
                onMoveCard(card.cardId, targetId, Number.MAX_SAFE_INTEGER)
              }
              onCopyToPanel={() => onCopyToPanel(card)}
              onOpenCota={() => onOpenCota(card)}
              onEditCota={() => onEditCota(card)}
              onOpenAtendimento={() => onOpenAtendimento(card)}
              onEditAtendimento={() => onEditAtendimento(card)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border/70 text-center text-[11px] text-muted-foreground">
            {isSearching ? "Nenhum resultado encontrado" : "Arraste ou adicione um card"}
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

      <EditColumnSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        column={column}
        onSubmit={(v) => {
          onEditCol(v);
          setEditOpen(false);
        }}
      />
    </div>
  );
}

function EditColumnSheet(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  column: WorkspaceColumn;
  onSubmit: (v: { nome: string; descricao: string | null; corToken: WorkspaceColor }) => void;
}) {
  const { open, onOpenChange, column, onSubmit } = props;
  const initialToken: WorkspaceColor = VALID_COL_COLORS.has(column.corToken)
    ? column.corToken
    : "neutral";
  const [nome, setNome] = useState(column.nome);
  const [descricao, setDescricao] = useState(column.descricao ?? "");
  const [corToken, setCorToken] = useState<WorkspaceColor>(initialToken);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNome(column.nome);
      setDescricao(column.descricao ?? "");
      setCorToken(initialToken);
      setErro(null);
    }
  }, [open, column.id, column.nome, column.descricao, initialToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nome.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      setErro("O nome deve ter entre 1 e 60 caracteres.");
      return;
    }
    if (descricao.length > 160) {
      setErro("A descrição deve ter no máximo 160 caracteres.");
      return;
    }
    onSubmit({
      nome: trimmed,
      descricao: descricao.trim() ? descricao.trim() : null,
      corToken,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Editar coluna</SheetTitle>
            <SheetDescription>
              Ajuste o nome, a descrição e a cor institucional desta coluna.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 flex-1 space-y-5 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="edit-col-nome">Nome</Label>
              <Input
                id="edit-col-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={60}
                autoFocus
                required
              />
              <p className="text-[11px] text-muted-foreground">{nome.trim().length}/60</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-col-desc">Descrição (opcional)</Label>
              <Textarea
                id="edit-col-desc"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                maxLength={160}
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">{descricao.length}/160</p>
            </div>

            <div className="space-y-2">
              <Label>Cor da coluna</Label>
              <div
                role="radiogroup"
                aria-label="Cor institucional da coluna"
                className="grid grid-cols-4 gap-2"
              >
                {COLUMN_COLOR_OPTIONS.map((opt) => {
                  const selected = opt.token === corToken;
                  return (
                    <button
                      key={opt.token}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCorToken(opt.token)}
                      data-col-color={opt.token}
                      className={cn(
                        "group relative flex flex-col items-center gap-1.5 rounded-md border p-2 text-[11px] font-medium transition",
                        selected
                          ? "border-institutional ring-2 ring-institutional/40"
                          : "border-border hover:border-institutional/40",
                      )}
                    >
                      <span
                        aria-hidden
                        className="flex h-8 w-full items-center justify-center rounded"
                        style={{ backgroundColor: "var(--col-accent-soft)" }}
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: "var(--col-accent)" }}
                        />
                        {selected && (
                          <Check className="ml-1 h-3.5 w-3.5 text-institutional" aria-hidden />
                        )}
                      </span>
                      <span className="text-foreground">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pré-visualização</Label>
              <div
                data-col-color={corToken}
                className="kanban-column relative overflow-hidden rounded-md border border-border"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ backgroundColor: "var(--col-accent)" }}
                />
                <div
                  className="border-b border-border pl-4 pr-2 py-2.5"
                  style={{ backgroundColor: "var(--col-accent-soft)" }}
                >
                  <h4
                    className="truncate text-sm font-semibold"
                    style={{ color: "var(--col-accent-strong)" }}
                  >
                    {nome.trim() || "Nome da coluna"}
                  </h4>
                  {descricao.trim() && (
                    <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                      {descricao}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>

          <SheetFooter className="mt-4 flex-row justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar alterações</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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
  const Icon = isCota ? StickyNote : FileText;
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
              Esta coluna possui {cards.length} card(s). Selecione outra coluna do mesmo Painel para
              recebê-los antes da exclusão.
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
  columnColor: WorkspaceColor;
  otherColumns: WorkspaceColumn[];
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToColumn: (targetId: string) => void;
  onCopyToPanel: () => void;
  onOpenCota: () => void;
  onEditCota: () => void;
  onOpenAtendimento: () => void;
  onEditAtendimento: () => void;
}) {
  const {
    card,
    access,
    index,
    columnCount,
    columnColor,
    otherColumns,
    onRemove,
    onMoveUp,
    onMoveDown,
    onMoveToColumn,
    onCopyToPanel,
    onOpenCota,
    onEditCota,
    onOpenAtendimento,
    onEditAtendimento,
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

  if (isCota) {
    const preview =
      card.bodyText && card.bodyText.trim()
        ? card.bodyText.length > 240
          ? card.bodyText.slice(0, 240).trimEnd() + "…"
          : card.bodyText
        : null;

    const copyButton = (
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label="Copiar texto da cota"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await copyRichText(card.bodyHtml, card.bodyText ?? "");
            toast.success("Texto da cota copiado");
          } catch {
            toast.error("Não foi possível copiar o texto");
          }
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    );

    return (
      <article
        ref={sortable.setNodeRef}
        style={style}
        {...(access.canMoveCards ? { ...sortable.attributes, ...sortable.listeners } : {})}
        onClick={() => onOpenCota()}
        className={cn(
          "group relative flex items-start gap-2 rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-institutional",
          access.canMoveCards && "cursor-grab active:cursor-grabbing",
          !card.canOpen && "opacity-70",
        )}
      >
        <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" aria-hidden />
        <p className="min-w-0 flex-1 text-xs font-medium leading-snug">{card.title}</p>
        <div className="flex shrink-0 items-center gap-0.5">
          {card.bodyText &&
            (preview ? (
              <Tooltip>
                <TooltipTrigger asChild>{copyButton}</TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs whitespace-pre-wrap text-left">
                  {preview}
                </TooltipContent>
              </Tooltip>
            ) : (
              copyButton
            ))}

          {access.canMoveCards && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Ações da cota"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {card.canEdit && (
                  <>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditCota();
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" /> Editar cota
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                >
                  <X className="mr-2 h-4 w-4" /> Excluir da coluna
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </article>
    );
  }

  // Ajuste doc — o card de Atendimento acompanha a cor atribuída à coluna
  // (mesma variável --col-accent que colore a faixa lateral e o cabeçalho
  // da coluna); na coluna neutra, mantém o verde vivo original em vez do
  // cinza neutro. O override só afeta este elemento e seus descendentes,
  // não o resto da coluna.
  const atendimentoStyle =
    columnColor === "neutral"
      ? ({ ...style, "--col-accent": "var(--accent-green)" } as CSSProperties)
      : style;

  return (
    <article
      ref={sortable.setNodeRef}
      style={{ ...atendimentoStyle, borderLeftColor: "var(--col-accent)" }}
      {...(access.canMoveCards ? { ...sortable.attributes, ...sortable.listeners } : {})}
      onClick={() => onOpenAtendimento()}
      className={cn(
        "group relative flex items-start gap-2 rounded-md border border-l-[3px] border-border bg-card p-3 shadow-sm transition hover:border-[var(--col-accent)]",
        access.canMoveCards && "cursor-grab active:cursor-grabbing",
        !card.canOpen && "opacity-70",
      )}
    >
      <MessageSquare
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--col-accent)]"
        fill="currentColor"
        aria-hidden
      />
      <p className="min-w-0 flex-1 text-xs font-medium leading-snug">{card.title}</p>
      <div className="flex shrink-0 items-center gap-0.5">
        {access.canMoveCards && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Ações do atendimento"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {card.canEdit && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditAtendimento();
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Editar atendimento
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                <X className="mr-2 h-4 w-4" /> Excluir da coluna
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
      if (
        /ITEM_ALREADY_IN_COLUMN|ITEM_ALREADY_IN_WORKSPACE|DUPLICATE_PANEL_ITEM|23505/i.test(msg)
      ) {
        toast.error("Este conteúdo já está adicionado a esta coluna.");
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
                const Icon = i.kind === "cota" ? StickyNote : FileText;
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
                      alreadyIn ? "cursor-not-allowed opacity-50" : "hover:bg-muted",
                      selected && "bg-muted",
                    )}
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.titulo}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {i.categorias.length > 0
                          ? i.categorias.map((c) => c.nome).join(", ")
                          : "Sem categoria"}{" "}
                        · {i.status}
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
          <Button disabled={!selecionado || add.isPending} onClick={() => add.mutate()}>
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
      const panelName = availablePanels.find((p) => p.id === targetPanelId)?.name ?? null;
      toast.success("Card adicionado ao outro Painel");
      qc.invalidateQueries({
        queryKey: [...workspaceKeys.byDefender(defensorId), targetPanelId],
      });
      onDone(panelName);
    },
    onError: (e: unknown) => {
      if (isConcurrentChangeError(e)) {
        toast.error("O Painel de destino foi alterado. Atualizamos os dados; tente novamente.");
        qc.invalidateQueries({
          queryKey: [...workspaceKeys.byDefender(defensorId), targetPanelId, "picker"],
        });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (
        /ITEM_ALREADY_IN_COLUMN|ITEM_ALREADY_IN_WORKSPACE|DUPLICATE_PANEL_ITEM|23505/i.test(msg)
      ) {
        toast.error("Este conteúdo já está adicionado a esta coluna.");
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
