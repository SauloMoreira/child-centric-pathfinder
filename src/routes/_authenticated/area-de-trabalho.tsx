import { useMemo, useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  X,
  Trash2,
  Eraser,
  FileText,
  FileSymlink,
  MessageSquare,
  MoreVertical,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FoldVertical,
  UnfoldVertical,
  GripVertical,
  Copy,
  FolderInput,
  FolderOutput,
  User,
  Pencil,
  Check,
  Loader2,
  Search,
  Sparkles,
  Star,
  Filter,
  Info,
  Infinity as InfinityIcon,
  ListPlus,
  Users,
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
  duplicarColunaWorkspace,
  esvaziarColunaWorkspace,
  listarCategoriasBiblioteca,
  copiarColunaParaPainel,
  moverColunaParaPainel,
  criarColunaWorkspace,
  excluirColunaWorkspace,
  isConcurrentChangeError,
  listarBiblioteca,
  alternarFavoritoBiblioteca,
  registrarAcessoBiblioteca,
  gerarRelatoAtendimentoLivre,
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
  type ContentKind,
} from "@/lib/reintegra-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn, copyRichText } from "@/lib/utils";
import { useWorkArea, useSelectedPanel, type PanelSummary } from "@/features/work-area";
import { PanelTabs } from "@/features/work-area/components/PanelTabs";
import { CreatePanelSheet } from "@/features/work-area/components/CreatePanelSheet";
import { RenamePanelSheet } from "@/features/work-area/components/RenamePanelSheet";
import { ArchivePanelDialog } from "@/features/work-area/components/ArchivePanelDialog";
import { PanelAccessBadge } from "@/features/work-area/components/PanelAccessBadge";
import { supabase } from "@/integrations/supabase/client";
import { ColumnIcon, columnIconPalette } from "@/features/work-area/components/column-icon";
import { panelIconComponent } from "@/features/work-area/components/panel-icon";
import { RequestDefenderAccessSheet } from "@/features/team/components/request-defender-access-sheet";
import { CotaFormSheet } from "@/components/cota/cota-form-sheet";
import { CotaDetailSheet } from "@/components/cota/cota-detail-sheet";
import { cotaKeys } from "@/features/cota/hooks";
import { AtendimentoFormSheet } from "@/components/atendimento/atendimento-form-sheet";
import { AtendimentoDetailSheet, mensagemErroResumoIA } from "@/components/atendimento/atendimento-detail-sheet";
import { atendimentoKeys } from "@/features/atendimento/hooks";
import { AtendimentoIaDialog } from "@/components/atendimento/atendimento-ia-dialog";
import { AtendimentoIaSheet, type AtendimentoIaResultado } from "@/components/atendimento/atendimento-ia-sheet";

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
  const activePanel = panels.find((p) => p.id === activePanelId) ?? null;

  return (
    // Ajuste (altura exata da tela / sem rolagem indesejada na página) —
    // h-full some dentro do <main> do AppShell, que agora tem altura FIXA
    // (h-dvh) em vez de só min-height; min-h-0 é necessário para que este
    // flex item não force o pai a crescer com o conteúdo (senão a rolagem
    // volta a ser da página inteira, em vez de só do quadro/colunas — o
    // resto da cadeia flex abaixo, incluindo o board e as colunas, já
    // usa h-full/flex-1/min-h-0 corretamente).
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* Cabeçalho institucional */}
      <header className="border-b border-border bg-surface px-4 py-4 lg:px-8 lg:py-5">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            Área de Trabalho
          </h1>
          {/* Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — no lugar do nome do
              usuário, um botão discreto resume o papel do usuário em
              relação ao Painel selecionado (privado / gestor / colaborador
              / visitante), abrindo o panorama do Painel ao ser clicado. */}
          {activePanel ? (
            <PanelAccessBadge
              panelId={activePanel.id}
              isPublic={activePanel.isPublic}
              role={activePanel.role}
              defenderUserId={defensorId}
            />
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate max-w-[18rem] sm:max-w-none">{contextoNome}</span>
            </p>
          )}
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

  // Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — "as alterações feitas pelo
  // Defensor Público no painel por ele criado ensejará a atualização
  // também, em tempo real, para todos os visitantes que tenham importado o
  // painel". Assina mudanças em colunas/cards/metadados do Painel aberto e
  // revalida a leitura local ao vivo, para qualquer papel (gestor,
  // colaborador ou visitante) — não só quem fez a alteração.
  useEffect(() => {
    const channel = supabase
      .channel(`workspace-${panelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "defensor_workspace_columns", filter: `workspace_id=eq.${panelId}` },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "defensor_workspace_cards", filter: `workspace_id=eq.${panelId}` },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "defensor_workspaces", filter: `id=eq.${panelId}` },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId]);

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

  // Busca de cards no Painel aberto (apenas pelo título).
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Ajuste doc — ao clicar fora do motor de busca, ele fecha sozinho.
  // Ajuste doc (AJUSTE 23) — usa "click" em vez de "pointerdown": o
  // pointerdown dispara ANTES do clique ser concluído, então limpar a
  // busca nesse momento fazia a lista de cards mudar/realinhar no meio
  // do clique, fazendo o clique "errar" o card e ele não abrir. Com
  // "click", a ordem de bolha garante que o onClick do próprio card já
  // foi processado antes deste listener rodar.
  useEffect(() => {
    if (!searchOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [searchOpen]);

  // Compactar/expandir colunas (Ajuste doc) — estado só de exibição, local
  // à sessão do navegador (não é salvo no Painel), já que o pedido é sobre
  // ganhar espaço horizontal na tela, não sobre uma preferência persistente.
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());

  // Ajuste doc — botão de ajuste vertical: por padrão as colunas são
  // limitadas à altura da tela (rolagem interna por coluna, comportamento
  // já existente). Ao clicar, alternam para altura natural (crescem com o
  // conteúdo e a rolagem vertical passa a ser da tela/board como um todo).
  const [colunasAlturaNatural, setColunasAlturaNatural] = useState(true);
  // Ajuste doc — AJUSTE 26: permite ajustar a altura de uma coluna
  // individualmente, independente do modo global acima. Colunas neste
  // conjunto ficam sempre em "altura da tela" (h-full), mesmo que o board
  // esteja em modo altura natural.
  const [colunasAlturaTelaIndividual, setColunasAlturaTelaIndividual] = useState<Set<string>>(
    new Set(),
  );
  const toggleColunaAlturaTelaIndividual = useCallback((columnId: string) => {
    setColunasAlturaTelaIndividual((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }, []);
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
        // Ajuste doc — a busca deve considerar apenas o título do card, não
        // o texto/corpo da cota ou atendimento.
        if (!card.title.toLowerCase().includes(normalizedQuery)) continue;
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
      icone: string | null;
    }) =>
      atualizarColunaWorkspace({
        columnId: v.columnId,
        expectedWorkspaceVersion: workspace.optimisticVersion,
        nome: v.nome,
        descricao: v.descricao ?? undefined,
        corToken: v.corToken,
        corCustom: null,
        icone: v.icone,
      }),
    onSuccess: () => {
      toast.success("Coluna atualizada");
      announce("Coluna atualizada");
      onRefetch();
    },
    onError: handleMutationError,
  });

  // Ajuste doc (AJUSTE 13) — duplicar/copiar/mover coluna.
  const duplicarCol = useMutation({
    mutationFn: (columnId: string) =>
      duplicarColunaWorkspace({ columnId, expectedWorkspaceVersion: workspace.optimisticVersion }),
    onSuccess: () => {
      toast.success("Coluna duplicada");
      onRefetch();
    },
    onError: handleMutationError,
  });
  // Ajuste doc (AJUSTE 2) — "Esvaziar coluna".
  const esvaziarCol = useMutation({
    mutationFn: (columnId: string) =>
      esvaziarColunaWorkspace({ columnId, expectedWorkspaceVersion: workspace.optimisticVersion }),
    onSuccess: () => {
      toast.success("Coluna esvaziada");
      onRefetch();
    },
    onError: handleMutationError,
  });
  const copiarColParaPainel = useMutation({
    mutationFn: (v: { columnId: string; targetWorkspaceId: string }) =>
      copiarColunaParaPainel(v),
    onSuccess: () => {
      toast.success("Coluna copiada para o painel selecionado");
      qc.invalidateQueries();
    },
    onError: handleMutationError,
  });
  const moverColParaPainel = useMutation({
    mutationFn: (v: { columnId: string; targetWorkspaceId: string }) =>
      moverColunaParaPainel({
        columnId: v.columnId,
        targetWorkspaceId: v.targetWorkspaceId,
        expectedSourceWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: () => {
      toast.success("Coluna movida para o painel selecionado");
      qc.invalidateQueries();
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
  // Ajuste doc (AJUSTE 13) — "Copiar para…"/"Mover para…" de coluna.
  const [columnPanelPicker, setColumnPanelPicker] = useState<
    { columnId: string; columnName: string; mode: "copy" | "move" } | null
  >(null);

  // Cota: criar/editar (side sheet) e detalhe expandido (side sheet)
  const [cotaFormTarget, setCotaFormTarget] = useState<
    | { mode: "create" }
    | { mode: "edit"; itemId: string; detalhe: CotaDetalhe }
    | { mode: "inspire"; detalhe: CotaDetalhe }
    | null
  >(null);
  const [cotaFormOpen, setCotaFormOpen] = useState(false);
  const [cotaDetailId, setCotaDetailId] = useState<string | null>(null);

  const openEditCota = useCallback((detalhe: CotaDetalhe) => {
    setCotaFormTarget({ mode: "edit", itemId: detalhe.id, detalhe });
    setCotaFormOpen(true);
  }, []);

  // Ajuste doc (AJUSTE 10) — "Inspirar nova cota".
  const openInspireCota = useCallback((detalhe: CotaDetalhe) => {
    setCotaFormTarget({ mode: "inspire", detalhe });
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

  const handleInspireCota = useCallback(
    async (card: WorkspaceCardDto) => {
      try {
        const detalhe = await qc.fetchQuery({
          queryKey: cotaKeys.detalhe(card.itemId),
          queryFn: () => obterCotaDetalhe(card.itemId),
        });
        openInspireCota(detalhe);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar a cota de referência");
      }
    },
    [qc, openInspireCota],
  );

  // Atendimento: criar/editar (side sheet) e detalhe expandido (side sheet)
  const [atendimentoFormTarget, setAtendimentoFormTarget] = useState<
    | { mode: "create" }
    | { mode: "edit"; itemId: string; detalhe: AtendimentoDetalhe }
    | { mode: "inspire"; detalhe: AtendimentoDetalhe }
    | null
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

  // Ajuste doc (AJUSTE 9) — "Inspirar novo atendimento".
  const openInspireAtendimento = useCallback((detalhe: AtendimentoDetalhe) => {
    setAtendimentoFormTarget({ mode: "inspire", detalhe });
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

  // Atendimento IA — caixa de entrada (nome/contexto/upload) e caixa de
  // execução ephemeral (nada disso é persistido em nenhuma tabela).
  const [atendimentoIaDialogOpen, setAtendimentoIaDialogOpen] = useState(false);
  // Ajuste doc — reformulação das modalidades: "Atendimento IA" abre um
  // seletor entre Livre, Guiado e Dinâmico (o antigo "Atendimento IA").
  const [modalidadePickerOpen, setModalidadePickerOpen] = useState(false);
  const [atendimentoLivreOpen, setAtendimentoLivreOpen] = useState(false);
  const [atendimentoGuiadoOpen, setAtendimentoGuiadoOpen] = useState(false);
  const [atendimentoIaResultado, setAtendimentoIaResultado] = useState<AtendimentoIaResultado | null>(null);
  const [atendimentoIaSheetOpen, setAtendimentoIaSheetOpen] = useState(false);

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

  // Ajuste doc (AJUSTE 9) — "Inspirar novo atendimento" a partir do card.
  const handleInspireAtendimento = useCallback(
    async (card: WorkspaceCardDto) => {
      try {
        const detalhe = await qc.fetchQuery({
          queryKey: atendimentoKeys.detalhe(card.itemId),
          queryFn: () => obterAtendimentoDetalhe(card.itemId),
        });
        openInspireAtendimento(detalhe);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar o atendimento de referência");
      }
    },
    [qc, openInspireAtendimento],
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
              <div ref={searchBoxRef} className="relative w-full max-w-xs">
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

          {/* Ajuste doc — "Atendimento IA" é o gênero das 3 modalidades
              (Livre/Guiado/Dinâmico); disponível para todos os usuários,
              não só Defensores Públicos, e sempre antes de "Criar
              atendimento" e "Criar cota". */}
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 gap-1.5"
            onClick={() => setModalidadePickerOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Atendimento IA
          </Button>
          {access.accessMode === "owner" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 shrink-0 p-0"
                  aria-label="Criar atendimento ou cota"
                  title="Criar atendimento ou cota"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => {
                    setAtendimentoFormTarget({ mode: "create" });
                    setAtendimentoFormOpen(true);
                  }}
                >
                  <MessageSquare className="mr-2 h-3.5 w-3.5" aria-hidden /> Criar atendimento
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setCotaFormTarget({ mode: "create" });
                    setCotaFormOpen(true);
                  }}
                >
                  <FileText className="mr-2 h-3.5 w-3.5" aria-hidden /> Criar cota
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Ajuste doc (AJUSTE 12) — a barra lateral com os botões de
            gestão de colunas deixou de usar position:sticky (que o
            usuário via como um "menu flutuante"). Agora ela é um irmão
            de verdade, FORA do contêiner de rolagem horizontal — a
            rolagem passa a abranger só as colunas, começando depois
            dela. */}
        <div className="flex min-h-0 flex-1">
          {(access.canManageColumns || orderedColumns.length > 0) && (
            <div className="z-10 flex shrink-0 flex-col items-center justify-start gap-1 bg-background pb-4 pl-2 pr-2 pt-1 lg:pl-3">
              {access.canManageColumns && (
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                  aria-label="Criar coluna"
                  title="Criar coluna"
                  onClick={() => {
                    setCreatorOpen(true);
                    // rola para o fim para o input ficar visível
                    requestAnimationFrame(() => {
                      const el = boardScrollRef.current;
                      if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
                    });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              )}
              {orderedColumns.length > 0 && (
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                  aria-label="Compactar todas as colunas"
                  title="Compactar todas as colunas"
                  onClick={collapseAllColumns}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
              )}
              {orderedColumns.length > 0 && (
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                  aria-label="Expandir todas as colunas"
                  title="Expandir todas as colunas"
                  onClick={expandAllColumns}
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              )}
              {orderedColumns.length > 0 && (
                <button
                  type="button"
                  className={cn(
                    "rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground",
                    !colunasAlturaNatural && "bg-institutional/[0.08] text-institutional",
                  )}
                  aria-label={
                    colunasAlturaNatural
                      ? "Ajustar colunas à altura da tela"
                      : "Reajustar colunas à altura orgânica"
                  }
                  title={
                    colunasAlturaNatural
                      ? "Ajustar colunas à altura da tela"
                      : "Reajustar colunas à altura orgânica"
                  }
                  onClick={() => setColunasAlturaNatural((v) => !v)}
                >
                  {colunasAlturaNatural ? (
                    <FoldVertical className="h-3.5 w-3.5" />
                  ) : (
                    <UnfoldVertical className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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

        {/* Board — altura calculada para permitir rolagem vertical dentro das colunas.
            Ajuste doc (AJUSTE 26) — o botão "Ajustar à altura da tela" de uma
            coluna individual só tem efeito visível se a linha que contém as
            colunas também ganhar uma altura própria (h-full): com a linha em
            h-auto (modo global natural), um h-full aplicado a uma única
            coluna não tem "o quê" preencher — a linha cresce com o conteúdo,
            então a coluna "de altura de tela" acaba esticando junto com as
            demais, como se o botão não tivesse feito nada. Sempre que houver
            ao menos uma coluna com o ajuste individual ativo, a linha passa a
            se comportar como no modo global de altura de tela (h-full), mas
            mantendo overflow-y-auto (em vez de hidden) para que as colunas
            que seguem no modo natural continuem podendo crescer além da
            altura do quadro, reveladas por rolagem da própria linha. */}
        <div
          ref={boardScrollRef}
          onScroll={handleBoardScroll}
          className={cn(
            "kanban-scroll flex-1 overflow-x-auto pl-2 pr-4 py-4 lg:pl-3 lg:pr-8",
            !colunasAlturaNatural ? "overflow-y-hidden" : "overflow-y-auto",
          )}
          style={{
            minHeight: 0,
          }}
        >
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            <div
              ref={boardContentRef}
              className={cn(
                "flex min-w-max items-stretch gap-4",
                colunasAlturaNatural && colunasAlturaTelaIndividual.size === 0
                  ? "h-auto items-start"
                  : "h-full",
              )}
            >
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
                  onDuplicateCol={() => duplicarCol.mutate(c.id)}
                  onEmptyCol={() => esvaziarCol.mutate(c.id)}
                  onCopyColToPanel={() => setColumnPanelPicker({ columnId: c.id, columnName: c.nome, mode: "copy" })}
                  onMoveColToPanel={() => setColumnPanelPicker({ columnId: c.id, columnName: c.nome, mode: "move" })}
                  onDeleteCol={(destinationColumnId) =>
                    excluirCol.mutate({ columnId: c.id, destinationColumnId })
                  }
                  onRemoveCard={(cardId) => removerCard.mutate(cardId)}
                  onMoveCard={(cardId, targetColumnId, newPosition) =>
                    moverCard.mutate({ cardId, targetColumnId, newPosition })
                  }
                  onCopyToPanel={(card) => setCopyTarget(card)}
                  onOpenCota={(card) => {
                    // Ajuste doc (AJUSTE 34) — estatística de acessos deve
                    // contar cliques de abertura também a partir da Área de
                    // Trabalho, não só da Biblioteca.
                    registrarAcessoBiblioteca(card.itemId).catch(() => {});
                    setCotaDetailId(card.itemId);
                  }}
                  onEditCota={handleEditCota}
                  onInspireCota={handleInspireCota}
                  onOpenAtendimento={(card) => {
                    registrarAcessoBiblioteca(card.itemId).catch(() => {});
                    setAtendimentoDetailId(card.itemId);
                  }}
                  onEditAtendimento={handleEditAtendimento}
                  onInspireAtendimento={handleInspireAtendimento}
                  onAdded={onRefetch}
                  isSearching={isSearching}
                  collapsed={collapsedColumns.has(c.id)}
                  onToggleCollapsed={() => toggleColumnCollapsed(c.id)}
                  alturaNatural={colunasAlturaNatural && !colunasAlturaTelaIndividual.has(c.id)}
                  alturaTelaIndividual={colunasAlturaTelaIndividual.has(c.id)}
                  onToggleAlturaTelaIndividual={() => toggleColunaAlturaTelaIndividual(c.id)}
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
          </div>
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

      <ColumnPanelPickerDialog
        open={!!columnPanelPicker}
        onOpenChange={(v) => !v && setColumnPanelPicker(null)}
        target={columnPanelPicker}
        currentPanelId={workspace.id}
        allPanels={allPanels}
        pending={copiarColParaPainel.isPending || moverColParaPainel.isPending}
        onConfirm={(targetWorkspaceId) => {
          if (!columnPanelPicker) return;
          if (columnPanelPicker.mode === "copy") {
            copiarColParaPainel.mutate(
              { columnId: columnPanelPicker.columnId, targetWorkspaceId },
              { onSuccess: () => setColumnPanelPicker(null) },
            );
          } else {
            moverColParaPainel.mutate(
              { columnId: columnPanelPicker.columnId, targetWorkspaceId },
              { onSuccess: () => setColumnPanelPicker(null) },
            );
          }
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
        onInspire={() => {
          const detalhe = qc.getQueryData<CotaDetalhe>(cotaKeys.detalhe(cotaDetailId ?? ""));
          if (detalhe) {
            setCotaDetailId(null);
            openInspireCota(detalhe);
          }
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
        onInspire={() => {
          const detalhe = qc.getQueryData<AtendimentoDetalhe>(
            atendimentoKeys.detalhe(atendimentoDetailId ?? ""),
          );
          if (detalhe) {
            setAtendimentoDetailId(null);
            openInspireAtendimento(detalhe);
          }
        }}
      />

      <AtendimentoModalidadePicker
        open={modalidadePickerOpen}
        onOpenChange={setModalidadePickerOpen}
        onEscolher={(modo) => {
          setModalidadePickerOpen(false);
          if (modo === "livre") setAtendimentoLivreOpen(true);
          else if (modo === "guiado") setAtendimentoGuiadoOpen(true);
          else setAtendimentoIaDialogOpen(true);
        }}
      />

      <AtendimentoGuiadoDialog
        open={atendimentoGuiadoOpen}
        onOpenChange={setAtendimentoGuiadoOpen}
        panelItemIds={cards.filter((c) => c.kind === "atendimento").map((c) => c.itemId)}
        onEscolher={(itemId) => {
          setAtendimentoGuiadoOpen(false);
          setAtendimentoDetailId(itemId);
        }}
      />

      <AtendimentoLivreDialog open={atendimentoLivreOpen} onOpenChange={setAtendimentoLivreOpen} />

      <AtendimentoIaDialog
        open={atendimentoIaDialogOpen}
        onOpenChange={setAtendimentoIaDialogOpen}
        onGenerated={(resultado) => {
          setAtendimentoIaResultado(resultado);
          setAtendimentoIaSheetOpen(true);
        }}
      />
      <AtendimentoIaSheet
        open={atendimentoIaSheetOpen}
        data={atendimentoIaResultado}
        onOpenChange={(v) => {
          setAtendimentoIaSheetOpen(v);
          if (!v) setAtendimentoIaResultado(null);
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
  onEditCol: (v: {
    nome: string;
    descricao: string | null;
    corToken: WorkspaceColor;
    icone: string | null;
  }) => void;
  onDuplicateCol: () => void;
  onEmptyCol: () => void;
  onCopyColToPanel: () => void;
  onMoveColToPanel: () => void;
  onDeleteCol: (destinationColumnId: string | null) => void;
  onRemoveCard: (cardId: string) => void;
  onMoveCard: (cardId: string, targetColumnId: string, newPosition: number) => void;
  onCopyToPanel: (card: WorkspaceCardDto) => void;
  onOpenCota: (card: WorkspaceCardDto) => void;
  onEditCota: (card: WorkspaceCardDto) => void;
  onInspireCota: (card: WorkspaceCardDto) => void;
  onOpenAtendimento: (card: WorkspaceCardDto) => void;
  onEditAtendimento: (card: WorkspaceCardDto) => void;
  onInspireAtendimento: (card: WorkspaceCardDto) => void;
  onAdded: () => void;
  isSearching?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  alturaNatural?: boolean;
  alturaTelaIndividual?: boolean;
  onToggleAlturaTelaIndividual?: () => void;
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
    onDuplicateCol,
    onEmptyCol,
    onCopyColToPanel,
    onMoveColToPanel,
    onDeleteCol,
    onRemoveCard,
    onMoveCard,
    onCopyToPanel,
    onOpenCota,
    onEditCota,
    onInspireCota,
    onOpenAtendimento,
    onEditAtendimento,
    onInspireAtendimento,
    onAdded,
    isSearching,
    collapsed,
    onToggleCollapsed,
    alturaNatural = false,
    alturaTelaIndividual = false,
    onToggleAlturaTelaIndividual,
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
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // Ajuste doc — permite abrir 'Inserir cota ou atendimento' clicando
  // diretamente na área vazia da coluna.
  const [addCardOpen, setAddCardOpen] = useState(false);
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
        // Ajuste doc — a classe utilitária "kanban-column" define width/
        // min-width/max-width fixos (320/280/360px) para a coluna expandida;
        // como min-width sempre vence sobre width quando este é menor, ela
        // impedia a coluna compactada de encolher de verdade (ficava presa
        // em 280px). Aqui reaplicamos só o visual (borda/fundo/raio) sem essa
        // classe, para que a largura mínima seja mesmo a do título rotacionado.
        // Ajuste doc — um pouco mais de largura/altura e respiro para além do
        // texto, tornando a coluna compactada visualmente mais agradável.
        className={cn(
          "relative flex w-9 shrink-0 flex-col items-center overflow-hidden rounded-[var(--kanban-col-radius)] border border-border bg-surface",
          // Ajuste doc — a coluna compactada é sempre do mesmo tamanho do
          // quadro "Criar coluna" (16rem fixo, ao contrário da coluna
          // expandida, que hoje hugga o conteúdo natural): o título não
          // pode mais determinar o tamanho, mas continua truncando
          // (ellipsis) quando não cabe, em vez de esticar a coluna além
          // do padrão. Vale só no modo de altura natural; no modo "altura
          // da tela" a coluna compactada continua h-full, como as demais
          // (inalterado).
          alturaNatural ? "h-[16rem]" : "h-full min-h-0",
        )}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: column.corCustom ?? "var(--col-accent)" }}
        />
        <button
          type="button"
          className="flex w-full shrink-0 items-center justify-center py-2 text-muted-foreground hover:text-foreground"
          style={{ backgroundColor: "var(--col-accent-soft)" }}
          aria-label={`Expandir coluna ${column.nome}`}
          title="Expandir coluna"
          onClick={onToggleCollapsed}
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
        <div
          className="flex min-h-0 flex-col items-center gap-1.5 overflow-hidden py-2.5"
          title={column.nome}
        >
          {column.icone && (
            <ColumnIcon
              name={column.icone}
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: "var(--col-accent-strong)" }}
            />
          )}
          {/* Ajuste doc — min-h-0 permite ENCOLHER a partir do tamanho
              natural do conteúdo quando o espaço disponível é menor
              (ex.: título longo dentro do teto de max-h-[16rem] do
              contêiner pai), ativando o text-overflow: ellipsis do
              truncate. Importante: nada de flex-1 aqui — o pai é
              h-auto (sem altura fixa), então flex-1 (que parte de
              base zero e cresce só se houver espaço livre "de sobra")
              colapsava o título inteiro a zero de altura, já que um
              contêiner h-auto não tem espaço livre a distribuir. Sem
              flex-1, o span usa o comportamento padrão do flexbox
              (flex-shrink, a partir do tamanho do conteúdo) — exatamente
              o que precisamos aqui. */}
          <span
            className="min-h-0 truncate text-xs font-semibold"
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
      className={cn(
        "kanban-column relative flex flex-col overflow-hidden",
        // Ajuste doc — no modo de altura natural, a coluna deixa de ter
        // piso mínimo de 16rem (o mesmo padrão do quadro "Criar coluna"):
        // uma coluna com poucos cards fica só do tamanho do seu conteúdo
        // natural, sem ser esticada para bater com o "Criar coluna" ao
        // lado. Confirmado com o Saulo: vale só nesse modo — no modo
        // "altura da tela" a coluna continua h-full, preenchendo a altura
        // do quadro igual às demais (inalterado, mesma decisão já tomada
        // para a coluna compactada).
        alturaNatural ? "h-auto" : "h-full min-h-0",
      )}
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
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          <ColumnIcon
            name={column.icone}
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--col-accent-strong)" }}
          />
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
              <DropdownMenuItem onClick={() => setAddCardOpen(true)}>
                <ListPlus className="mr-2 h-4 w-4" /> Inserir cota ou atendimento
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDuplicateCol}>
                <Copy className="mr-2 h-4 w-4" /> Duplicar coluna
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopyColToPanel}>
                <FolderInput className="mr-2 h-4 w-4" /> Copiar para…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onMoveColToPanel}>
                <FolderOutput className="mr-2 h-4 w-4" /> Mover para…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmEmpty(true)}>
                <Eraser className="mr-2 h-4 w-4" /> Esvaziar coluna
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
              {onToggleAlturaTelaIndividual && (
                <DropdownMenuItem onClick={onToggleAlturaTelaIndividual}>
                  {alturaTelaIndividual ? (
                    <UnfoldVertical className="mr-2 h-4 w-4" />
                  ) : (
                    <FoldVertical className="mr-2 h-4 w-4" />
                  )}
                  {alturaTelaIndividual ? "Reajustar à altura orgânica" : "Ajustar à altura da tela"}
                </DropdownMenuItem>
              )}
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

      {/* corpo — rolagem interna por padrão; altura natural quando o
          ajuste vertical está ativo (a rolagem passa a ser do board). */}
      <div
        ref={setDropRef}
        className={cn(
          "kanban-scroll space-y-2 pl-4 pr-2 py-2.5 transition",
          alturaNatural ? "" : "flex-1 min-h-0 overflow-y-auto",
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
              onInspireCota={() => onInspireCota(card)}
              onOpenAtendimento={() => onOpenAtendimento(card)}
              onEditAtendimento={() => onEditAtendimento(card)}
              onInspireAtendimento={() => onInspireAtendimento(card)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div
            role={!isSearching && access.canAddItems ? "button" : undefined}
            tabIndex={!isSearching && access.canAddItems ? 0 : undefined}
            onClick={() => {
              if (!isSearching && access.canAddItems) setAddCardOpen(true);
            }}
            className={cn(
              "flex h-32 items-center justify-center rounded-md border border-dashed border-border/70 text-center text-[11px] text-muted-foreground",
              !isSearching && access.canAddItems && "cursor-pointer hover:border-institutional/40 hover:text-foreground",
            )}
          >
            {isSearching ? "Nenhum resultado encontrado" : "Arraste ou insira"}
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
            externalOpen={addCardOpen}
            onExternalOpenChange={setAddCardOpen}
          />
        </footer>
      )}

      {confirmDelete && (
        <DeleteColumnDialog
          column={column}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            // Ajuste doc — excluir a coluna não remaneja mais os cards para
            // outra coluna: eles são descartados junto com ela.
            onDeleteCol(null);
            setConfirmDelete(false);
          }}
        />
      )}

      <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esvaziar coluna?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os cards desta coluna serão removidos. O conteúdo vinculado (Atendimentos e
              Cotas em si) não é excluído — apenas os cards de visualização aqui aglutinados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onEmptyCol();
                setConfirmEmpty(false);
              }}
            >
              Esvaziar coluna
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  onSubmit: (v: {
    nome: string;
    descricao: string | null;
    corToken: WorkspaceColor;
    icone: string | null;
  }) => void;
}) {
  const { open, onOpenChange, column, onSubmit } = props;
  const initialToken: WorkspaceColor = VALID_COL_COLORS.has(column.corToken)
    ? column.corToken
    : "neutral";
  const [nome, setNome] = useState(column.nome);
  const [descricao, setDescricao] = useState(column.descricao ?? "");
  const [corToken, setCorToken] = useState<WorkspaceColor>(initialToken);
  const [icone, setIcone] = useState<string | null>(column.icone ?? null);
  const [erro, setErro] = useState<string | null>(null);

  // Ajuste doc — a paleta de ícones da coluna sempre mostra todas as
  // opções disponíveis (o crescimento artificial atrelado à quantidade
  // de categorias da Biblioteca foi removido a pedido do Saulo).
  const paletaIcones = columnIconPalette();

  useEffect(() => {
    if (open) {
      setNome(column.nome);
      setDescricao(column.descricao ?? "");
      setCorToken(initialToken);
      setIcone(column.icone ?? null);
      setErro(null);
    }
  }, [open, column.id, column.nome, column.descricao, column.icone, initialToken]);

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
      icone,
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

          <div className="kanban-scroll mt-6 flex-1 space-y-5 overflow-y-auto pr-1">
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
              <Label>Ícone (opcional)</Label>
              <div className="grid grid-cols-8 gap-1.5">
                <button
                  type="button"
                  onClick={() => setIcone(null)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border text-[10px] text-muted-foreground transition",
                    icone === null
                      ? "border-institutional bg-institutional/10 text-institutional"
                      : "border-border hover:bg-muted",
                  )}
                  aria-pressed={icone === null}
                  aria-label="Sem ícone"
                  title="Sem ícone"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                {paletaIcones.map((name) => {
                  const active = icone === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setIcone(name)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition",
                        active
                          ? "border-institutional bg-institutional/10 text-institutional"
                          : "border-border hover:bg-muted",
                      )}
                      aria-pressed={active}
                      aria-label={`Ícone ${name}`}
                    >
                      <ColumnIcon name={name} className="h-4 w-4" />
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
                  className="flex items-start gap-1.5 border-b border-border pl-4 pr-2 py-2.5"
                  style={{ backgroundColor: "var(--col-accent-soft)" }}
                >
                  <ColumnIcon
                    name={icone}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{ color: "var(--col-accent-strong)" }}
                  />
                  <div className="min-w-0 flex-1">
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
  // Ajuste doc (AJUSTE 36) — ícone de Cota passa a ser igual ao de
  // Atendimento (o mesmo exibido ao arrastar um card de Atendimento).
  const Icon = FileText;
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
// Ajuste doc — deve ser permitido excluir a coluna mesmo que tenha cards, sem
// a necessidade de movê-los para outra coluna antes. Por isso, virou uma
// simples caixa de confirmação (texto fixo definido no doc), sem seletor de
// coluna de destino: ao confirmar, a coluna e os cards nela são excluídos
// juntos, sem remanejamento.
function DeleteColumnDialog({
  column,
  onClose,
  onConfirm,
}: {
  column: WorkspaceColumn;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza que deseja excluir a coluna?</AlertDialogTitle>
          <AlertDialogDescription>
            Ao excluir a coluna, os cards adicionados não serão remanejados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Excluir coluna
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  onInspireCota: () => void;
  onOpenAtendimento: () => void;
  onEditAtendimento: () => void;
  onInspireAtendimento: () => void;
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
    onInspireCota,
    onOpenAtendimento,
    onEditAtendimento,
    onInspireAtendimento,
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
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" aria-hidden />
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
                {access.accessMode === "owner" && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspireCota();
                    }}
                  >
                    <FileSymlink className="mr-2 h-4 w-4" /> Criar nova a partir desta
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                >
                  <X className="mr-2 h-4 w-4" /> Remover da coluna
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
              {access.accessMode === "owner" && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspireAtendimento();
                  }}
                >
                  <FileSymlink className="mr-2 h-4 w-4" /> Criar novo a partir deste
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                <X className="mr-2 h-4 w-4" /> Remover da coluna
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
  externalOpen,
  onExternalOpenChange,
}: {
  columnId: string;
  workspace: WorkspaceMeta;
  existingItemIds: string[];
  onAdded: () => void;
  /** Ajuste doc — permite abrir a caixa a partir de fora (ex.: clique na
   *  área vazia da coluna), além do botão "Inserir cota ou atendimento". */
  externalOpen?: boolean;
  onExternalOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = onExternalOpenChange ?? setInternalOpen;
  const [query, setQuery] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const qc = useQueryClient();

  // Ajuste doc (AJUSTE 18 / CAIXA "INSERIR A PARTIR DA MINHA COLEÇÃO") —
  // mesmos filtros do motor de busca da Biblioteca, mas simplificados:
  // sem ranking (Recentes/Mais favoritados/Mais utilizados — a ordem é
  // sempre pela mais recente), autoria e favoritos combinados num único
  // menu suspenso, categoria com busca interna. Padrão: só os meus itens
  // mais recentes.
  const [tipo, setTipo] = useState<ContentKind | "todos">("todos");
  const [tipoFiltroOpen, setTipoFiltroOpen] = useState(false);
  const [categoriaId, setCategoriaId] = useState<string>("todas");
  const [categoriaFiltroOpen, setCategoriaFiltroOpen] = useState(false);
  const [buscaCategoria, setBuscaCategoria] = useState("");
  const [autoria, setAutoria] = useState<"todos" | "meus">("meus");
  const [somenteFavoritos, setSomenteFavoritos] = useState(false);
  const [autoriaFiltroOpen, setAutoriaFiltroOpen] = useState(false);
  // Ajuste doc — "Criar cota"/"Criar atendimento" a partir desta caixa,
  // inserindo automaticamente na coluna ao concluir.
  const [criarTipo, setCriarTipo] = useState<"atendimento" | "cota" | null>(null);

  const categoriasQuery = useQuery({
    queryKey: ["biblioteca-categorias"],
    queryFn: () => listarCategoriasBiblioteca(),
    enabled: open,
  });
  const categoriasPicker = categoriasQuery.data ?? [];
  const categoriaSelecionada = categoriasPicker.find((c) => c.id === categoriaId);

  const bibQuery = useQuery({
    queryKey: ["biblioteca-picker", query, tipo, categoriaId, autoria, somenteFavoritos],
    queryFn: () =>
      listarBiblioteca({
        query: query.trim() || undefined,
        kind: tipo === "todos" ? undefined : tipo,
        categoria_ids: categoriaId === "todas" ? undefined : [categoriaId],
        apenas_meus: autoria === "meus",
        favoritos_apenas: somenteFavoritos,
        // Ajuste doc — ordem sempre pela mais recente (criação/edição ou
        // favoritação); o seletor de ranking foi removido.
        order_by: "recentes",
        limit: 20,
      }),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: (itemId: string) =>
      adicionarCardWorkspace({
        columnId,
        itemId,
        expectedWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: () => {
      toast.success("Card inserido");
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
      toast.error("Falha ao inserir card");
    },
  });

  const itens = bibQuery.data ?? [];
  const existing = new Set(existingItemIds);

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          // Ajuste doc — hover em cor neutra, igual ao das abas de Painel
          // (hover:bg-muted), em vez do tom esverdeado padrão do ghost.
          className="w-full justify-start gap-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ListPlus className="h-4 w-4" /> Inserir cota ou atendimento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          {/* Ajuste doc — "Inserir atendimento ou cota" renomeado para
              "Inserir a partir da minha coleção". */}
          <DialogTitle>Inserir a partir da minha coleção</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex items-center gap-1.5">
            {/* Ajuste doc — motor de busca no mesmo padrão da Biblioteca:
                botão interno "Tudo" (infinito), "Atendimentos" (ícone do
                card de Atendimento) e "Cotas". */}
            <Popover open={tipoFiltroOpen} onOpenChange={setTipoFiltroOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Filtrar por tipo"
                  title={
                    tipo === "todos"
                      ? "Tipo: tudo"
                      : tipo === "atendimento"
                        ? "Tipo: atendimentos"
                        : "Tipo: cotas"
                  }
                >
                  {tipo === "todos" ? (
                    <InfinityIcon className="h-4 w-4" aria-hidden />
                  ) : tipo === "atendimento" ? (
                    <MessageSquare className="h-4 w-4" fill="currentColor" aria-hidden />
                  ) : (
                    <FileText className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-44 p-1">
                {(
                  [
                    { value: "todos", label: "Tudo", Icon: InfinityIcon, fill: false },
                    { value: "atendimento", label: "Atendimentos", Icon: MessageSquare, fill: true },
                    { value: "cota", label: "Cotas", Icon: FileText, fill: false },
                  ] as const
                ).map(({ value, label, Icon, fill }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setTipo(value);
                      setTipoFiltroOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
                      tipo === value && "bg-muted font-medium",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" fill={fill ? "currentColor" : "none"} aria-hidden />{" "}
                    {label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar na Biblioteca…"
              autoFocus
              className="flex-1"
            />
          </div>
          {/* Ajuste doc — filtro "Criados por mim/Favoritos" (num único
              menu suspenso, padrão "Criados por mim") posicionado à
              esquerda do filtro de Categoria(s); removidos o ranking
              (Recentes/Mais favoritados/Mais utilizados). */}
          <div className="flex flex-wrap items-center gap-1.5">
            <DropdownMenu open={autoriaFiltroOpen} onOpenChange={setAutoriaFiltroOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px] font-normal">
                  {autoria === "meus" ? (
                    <User className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Users className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {autoria === "meus" ? "Criados por mim" : "Criados por todos"}
                  {somenteFavoritos && (
                    <Star className="h-3 w-3 fill-current text-warning" aria-hidden />
                  )}
                  <ChevronDown className="h-3 w-3 opacity-50" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onSelect={() => setAutoria("meus")}>
                  <User className="mr-2 h-3.5 w-3.5" aria-hidden /> Criados por mim
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAutoria("todos")}>
                  <Users className="mr-2 h-3.5 w-3.5" aria-hidden /> Criados por todos
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={somenteFavoritos}
                  onCheckedChange={(v) => setSomenteFavoritos(!!v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  Somente favoritos
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Ajuste doc — "Todas as categorias" fixa no topo do menu +
                motor de busca interno. */}
            <DropdownMenu
              open={categoriaFiltroOpen}
              onOpenChange={(v) => {
                setCategoriaFiltroOpen(v);
                if (!v) setBuscaCategoria("");
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px] font-normal">
                  {categoriaId === "todas" ? "Todas as categorias" : (categoriaSelecionada?.nome ?? "Categoria")}
                  <ChevronDown className="h-3 w-3 opacity-50" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="kanban-scroll max-h-72 w-56 overflow-y-auto">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setCategoriaId("todas");
                    setCategoriaFiltroOpen(false);
                  }}
                >
                  Todas as categorias
                </DropdownMenuItem>
                {categoriasPicker.length > 5 && (
                  <div className="p-1.5">
                    <Input
                      autoFocus
                      value={buscaCategoria}
                      onChange={(e) => setBuscaCategoria(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Buscar categoria…"
                      className="h-7 bg-background text-xs"
                    />
                  </div>
                )}
                {categoriasPicker
                  .filter((c) => c.nome.toLowerCase().includes(buscaCategoria.trim().toLowerCase()))
                  .map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onSelect={() => {
                        setCategoriaId(c.id);
                        setCategoriaFiltroOpen(false);
                      }}
                    >
                      {c.nome}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="kanban-scroll max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1">
            {itens.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum conteúdo encontrado.
              </p>
            ) : (
              itens.map((i) => {
                // Ajuste doc — ícone do item na lista igual ao do card
                // correspondente na Área de Trabalho (balão para
                // Atendimento, documento para Cota).
                const isAtd = i.kind === "atendimento";
                const Icon = isAtd ? MessageSquare : FileText;
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
                    <Icon
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        isAtd ? "text-[var(--accent-green)]" : "text-institutional",
                      )}
                      fill={isAtd ? "currentColor" : "none"}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.titulo}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {i.categorias.length > 0
                          ? i.categorias.map((c) => c.nome).join(", ")
                          : "Sem categoria"}{" "}
                        · {i.owner_nome}
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
        <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-between">
          {/* Ajuste doc — "Criar atendimento"/"Criar cota" num único menu
              suspenso a partir de um botão "+", no mesmo padrão do botão
              equivalente da barra superior da Área de Trabalho, alinhado
              ao canto inferior esquerdo. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                aria-label="Criar atendimento ou cota"
                title="Criar atendimento ou cota"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setCriarTipo("atendimento")}>
                <MessageSquare className="mr-2 h-3.5 w-3.5" aria-hidden /> Criar atendimento
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCriarTipo("cota")}>
                <FileText className="mr-2 h-3.5 w-3.5" aria-hidden /> Criar cota
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!selecionado || add.isPending}
              onClick={() => selecionado && add.mutate(selecionado)}
            >
              Inserir
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AtendimentoFormSheet
      open={criarTipo === "atendimento"}
      onOpenChange={(v) => !v && setCriarTipo(null)}
      target={{ mode: "create" }}
      onCreated={(itemId) => {
        setCriarTipo(null);
        add.mutate(itemId);
      }}
    />
    <CotaFormSheet
      open={criarTipo === "cota"}
      onOpenChange={(v) => !v && setCriarTipo(null)}
      target={{ mode: "create" }}
      onCreated={(itemId) => {
        setCriarTipo(null);
        add.mutate(itemId);
      }}
    />
    </>
  );
}

// -----------------------------------------------------------------------------
// MoveToPanelDialog — Adicionar card a outro Painel do mesmo Defensor
// -----------------------------------------------------------------------------
/** Item mínimo aceito por MoveToPanelDialog — WorkspaceCardDto satisfaz
 *  esta forma estruturalmente, mas o diálogo também é reaproveitado pela
 *  Biblioteca ("Adicionar em painel"), que só tem um BibliotecaItem à mão
 *  (sem cardId/columnId, que não fazem sentido fora de um Painel aberto). */
export type MoveToPanelTarget = { itemId: string; title: string };

export function MoveToPanelDialog({
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
  card: MoveToPanelTarget | null;
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
                <div className="kanban-scroll max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-1">
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

// -----------------------------------------------------------------------------
// ColumnPanelPickerDialog — Ajuste doc (AJUSTE 13): "Copiar para…"/"Mover
// para…" de uma coluna inteira, escolhendo o painel de destino.
// -----------------------------------------------------------------------------
function ColumnPanelPickerDialog({
  open,
  onOpenChange,
  target,
  currentPanelId,
  allPanels,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: { columnId: string; columnName: string; mode: "copy" | "move" } | null;
  currentPanelId: string;
  allPanels: PanelSummary[];
  pending: boolean;
  onConfirm: (targetWorkspaceId: string) => void;
}) {
  const [targetPanelId, setTargetPanelId] = useState<string | null>(null);

  const availablePanels = useMemo(
    () => allPanels.filter((p) => p.id !== currentPanelId && !p.archivedAt),
    [allPanels, currentPanelId],
  );

  useEffect(() => {
    if (open) setTargetPanelId(availablePanels[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const verbo = target?.mode === "move" ? "Mover" : "Copiar";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{verbo} coluna para outro painel</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="grid gap-4">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Coluna</p>
              <p className="text-sm font-medium">{target.columnName}</p>
            </div>

            {availablePanels.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Você não possui outros Painéis ativos.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Painel de destino</Label>
                <Select value={targetPanelId ?? undefined} onValueChange={setTargetPanelId}>
                  <SelectTrigger className="bg-surface text-sm">
                    <SelectValue placeholder="Selecione um painel" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePanels.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  A coluna será {target.mode === "move" ? "movida" : "copiada"} como a primeira
                  coluna (à esquerda) do painel selecionado.
                </p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            disabled={!targetPanelId || pending}
            onClick={() => targetPanelId && onConfirm(targetPanelId)}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {verbo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Ícones das modalidades de Atendimento — Ajuste doc (reformulação das
// modalidades). Livre = balão sem preenchimento; Guiado = balão
// preenchido. Dinâmico (AJUSTE 30, doc novo) — volta a ser um ícone
// composto: o mesmo balão preenchido do Guiado com a estrela do
// Atendimento IA sobreposta, para deixar clara a relação com as outras
// duas modalidades (em vez do glifo de robô, sem vínculo visual algum
// com "balão de atendimento").
// -----------------------------------------------------------------------------
function AtendimentoLivreIcon({ className }: { className?: string }) {
  return <MessageSquare className={className} aria-hidden />;
}

function AtendimentoGuiadoIcon({ className }: { className?: string }) {
  return <MessageSquare className={className} fill="currentColor" aria-hidden />;
}

// Ajuste doc — as estrelinhas do ícone do Atendimento Dinâmico usavam
// text-institutional (verde escuro), a mesma cor do fundo do badge onde o
// ícone é exibido (bg-sidebar-accent) — ficavam praticamente invisíveis
// fora do contorno do balão. Trocado para a cor de primeiro-plano do
// próprio badge (sidebar-accent-foreground, quase branca), que já é a cor
// usada pelo balão em si (via currentColor) — mantém a estrela sempre
// legível sobre o fundo verde escuro, sem alterar a cor do fundo.
function AtendimentoDinamicoIcon({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
      <MessageSquare className="h-full w-full" fill="currentColor" aria-hidden />
      <Sparkles
        className="absolute -right-1 -top-1 h-2.5 w-2.5 text-sidebar-accent-foreground"
        aria-hidden
      />
    </span>
  );
}

// -----------------------------------------------------------------------------
// AtendimentoModalidadePicker — Ajuste doc: ao clicar em "Atendimento
// IA" na área de trabalho, escolher entre as 3 modalidades.
// -----------------------------------------------------------------------------
function AtendimentoModalidadePicker({
  open,
  onOpenChange,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEscolher: (modo: "livre" | "guiado" | "dinamico") => void;
}) {
  const opcoes: {
    modo: "livre" | "guiado" | "dinamico";
    titulo: string;
    descricao: string;
    Icon: (props: { className?: string }) => JSX.Element;
  }[] = [
    {
      modo: "livre",
      titulo: "Atendimento Livre",
      descricao: "Narre livremente o teor do atendimento enquanto dialoga com a pessoa assistida.",
      Icon: AtendimentoLivreIcon,
    },
    {
      modo: "guiado",
      titulo: "Atendimento Guiado",
      descricao: "Selecione um modelo de atendimento para preenchimento.",
      Icon: AtendimentoGuiadoIcon,
    },
    {
      modo: "dinamico",
      titulo: "Atendimento Dinâmico",
      descricao: "Indique contexto e documentos para elaboração dinâmica do atendimento.",
      Icon: AtendimentoDinamicoIcon,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-institutional" aria-hidden />
            Atendimento IA
          </DialogTitle>
          <DialogDescription>Escolha a modalidade de atendimento.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {opcoes.map(({ modo, titulo, descricao, Icon }) => (
            <button
              key={modo}
              type="button"
              onClick={() => onEscolher(modo)}
              className="flex items-start gap-3 rounded-md border border-border p-3 text-left transition hover:border-institutional hover:bg-institutional/[0.04]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{titulo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// AtendimentoGuiadoDialog — Ajuste doc: escolher um Atendimento (modelo
// criado por Defensor Público) para conduzir o atendimento guiado. Busca
// com filtros de categoria, favoritos e "só neste painel". Reaproveita o
// sistema de favoritos da Biblioteca como "acesso rápido" (favoritar um
// atendimento aqui é o mecanismo de fixá-lo para uso futuro rápido).
// -----------------------------------------------------------------------------
function AtendimentoGuiadoDialog({
  open,
  onOpenChange,
  panelItemIds,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Ajuste doc — "atendimentos que constam em cards de painéis
   *  específicos da sua área de trabalho": simplificado para o painel
   *  ATUALMENTE aberto (evita precisar buscar cards de todos os painéis
   *  do usuário de uma vez). */
  panelItemIds: string[];
  onEscolher: (itemId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [categoriaId, setCategoriaId] = useState("todas");
  const [somenteFavoritos, setSomenteFavoritos] = useState(false);
  const [somenteNestePainel, setSomenteNestePainel] = useState(false);
  const qc = useQueryClient();

  const categoriasQuery = useQuery({
    queryKey: ["biblioteca-categorias"],
    queryFn: () => listarCategoriasBiblioteca(),
    enabled: open,
  });

  const bibQuery = useQuery({
    queryKey: ["atendimento-guiado-picker", query, categoriaId, somenteFavoritos],
    queryFn: () =>
      listarBiblioteca({
        kind: "atendimento",
        query: query.trim() || undefined,
        categoria_ids: categoriaId === "todas" ? undefined : [categoriaId],
        favoritos_apenas: somenteFavoritos,
        order_by: "recentes",
        limit: 30,
      }),
    enabled: open,
  });

  const favoritosQuery = useQuery({
    queryKey: ["atendimento-guiado-favoritos"],
    queryFn: () => listarBiblioteca({ kind: "atendimento", favoritos_apenas: true, limit: 8 }),
    enabled: open && !query.trim() && !somenteFavoritos,
  });

  const toggleFavorito = useMutation({
    mutationFn: (itemId: string) => alternarFavoritoBiblioteca(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atendimento-guiado-picker"] });
      qc.invalidateQueries({ queryKey: ["atendimento-guiado-favoritos"] });
    },
  });

  const panelSet = new Set(panelItemIds);
  const itens = (bibQuery.data ?? []).filter((i) => !somenteNestePainel || panelSet.has(i.id));
  const acessoRapido = favoritosQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atendimento Guiado</DialogTitle>
          <DialogDescription>Escolha um formulário de atendimento já criado.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {acessoRapido.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Acesso rápido (favoritos)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {acessoRapido.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => onEscolher(i.id)}
                    className="flex items-center gap-1.5 rounded-full border border-institutional/30 bg-institutional/[0.06] px-2.5 py-1 text-[11px] text-institutional hover:bg-institutional/[0.12]"
                  >
                    <Star className="h-3 w-3 fill-current" aria-hidden />
                    {i.titulo}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar atendimento…" autoFocus />
          <div className="flex flex-wrap items-center gap-1.5">
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger className="h-7 w-[150px] text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas categorias</SelectItem>
                {(categoriasQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={somenteFavoritos ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => setSomenteFavoritos((v) => !v)}
            >
              <Star className={somenteFavoritos ? "h-3 w-3 fill-current" : "h-3 w-3"} aria-hidden />
              Favoritos
            </Button>
            <Button
              type="button"
              variant={somenteNestePainel ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => setSomenteNestePainel((v) => !v)}
            >
              <Filter className="h-3 w-3" aria-hidden />
              Neste painel
            </Button>
          </div>
          <div className="kanban-scroll max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1">
            {itens.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum atendimento encontrado.
              </p>
            ) : (
              itens.map((i) => (
                <div
                  key={i.id}
                  className="flex items-start gap-2 rounded p-2 text-left text-xs hover:bg-muted"
                >
                  <button type="button" className="flex min-w-0 flex-1 items-start gap-2" onClick={() => onEscolher(i.id)}>
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.titulo}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {i.categorias.length > 0 ? i.categorias.map((c) => c.nome).join(", ") : "Sem categoria"} ·{" "}
                        {i.owner_nome}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-institutional"
                    aria-label={i.is_favorited ? "Remover dos favoritos" : "Favoritar (acesso rápido)"}
                    title={i.is_favorited ? "Remover dos favoritos" : "Favoritar (acesso rápido)"}
                    onClick={() => toggleFavorito.mutate(i.id)}
                  >
                    <Star className={i.is_favorited ? "h-3.5 w-3.5 fill-current text-institutional" : "h-3.5 w-3.5"} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// AtendimentoLivreDialog — Ajuste doc: narrativa livre → relato por IA
// (com possível Orientação de esclarecimento acima do relato).
// PENDENTE: esta é uma versão inicial/placeholder; a geração do relato
// por IA (edge function dedicada) ainda será implementada numa próxima
// etapa, dado o tamanho já grande deste bloco.
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// AtendimentoLivreDialog — Ajuste doc: narrativa livre → relato por IA
// (com possível Orientação de esclarecimento acima do relato). Nunca
// persistido — some ao fechar, mesma regra de privacidade do resto do
// Atendimento IA.
// -----------------------------------------------------------------------------
function AtendimentoLivreDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [narrativa, setNarrativa] = useState("");
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<{ relato: string; orientacao: string | null } | null>(null);
  // Ajuste doc (AJUSTE 30) — guarda o texto no momento do último relato
  // gerado, para saber se o usuário alterou a narrativa depois (e então
  // trocar "Gerar relato" por "Atualizar relato").
  const [narrativaGerada, setNarrativaGerada] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (open) {
      setNarrativa("");
      setResultado(null);
      setNarrativaGerada(null);
      setGerando(false);
    }
  }, [open]);

  const alterouAposGerar = !!resultado && narrativa.trim() !== narrativaGerada;

  const handleGerar = async () => {
    if (!narrativa.trim()) {
      toast.error("Narre o atendimento antes de concluir.");
      return;
    }
    setGerando(true);
    try {
      const r = await gerarRelatoAtendimentoLivre({ narrativa: narrativa.trim() });
      setResultado(r);
      setNarrativaGerada(narrativa.trim());
    } catch (e) {
      toast.error(mensagemErroResumoIA(e));
    } finally {
      setGerando(false);
    }
  };

  const handleCopiar = async () => {
    if (!resultado) return;
    try {
      await navigator.clipboard.writeText(resultado.relato);
      toast.success("Relato copiado");
    } catch {
      toast.error("Não foi possível copiar o relato");
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v && (narrativa.trim() || resultado)) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(v);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AtendimentoLivreIcon className="h-4 w-4 text-institutional" />
            Atendimento Livre
          </DialogTitle>
          <DialogDescription>
            Narre livremente o teor do atendimento enquanto dialoga com a pessoa assistida.
          </DialogDescription>
        </DialogHeader>

        <div className="kanban-scroll min-h-0 flex-1 space-y-3 overflow-y-auto">
          <Textarea
            value={narrativa}
            onChange={(e) => setNarrativa(e.target.value)}
            rows={10}
            className="resize-none bg-surface text-sm"
            disabled={gerando}
          />

          {resultado?.orientacao && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/[0.1] p-3">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-warning">
                  Pontos que podem ser esclarecidos ou complementados
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{resultado.orientacao}</p>
              </div>
            </div>
          )}

          {resultado && (
            <div className="rounded-md border border-institutional/30 bg-institutional/[0.06] p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-institutional">
                  Relato do atendimento
                </p>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Copiar relato do atendimento"
                  onClick={handleCopiar}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-xs text-foreground">{resultado.relato}</p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          {!resultado && (
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
          )}
          <Button
            type="button"
            disabled={gerando || !narrativa.trim() || (!!resultado && !alterouAposGerar)}
            onClick={handleGerar}
          >
            {gerando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {resultado ? "Atualizar relato" : "Gerar relato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza que deseja fechar?</AlertDialogTitle>
          <AlertDialogDescription>
            Ao fechar, o atendimento livre narrado (e o relato gerado, se houver) será perdido.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setConfirmClose(false);
              onOpenChange(false);
            }}
          >
            Fechar sem salvar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
