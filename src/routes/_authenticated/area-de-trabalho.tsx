import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Plus,
  RefreshCcw,
  RotateCcw,
  Search as SearchIcon,
  MoreVertical,
  ArrowLeft,
  ArrowRight,
  Copy,
  Trash2,
  Pencil,
  Loader2,
  Baby,
  UserRound,
  Scale,
  Star,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  useBuscaAssistidos,
  useColumnAssistidos,
  useWorkspace,
  useWorkspaceBoardMutations,
  useWorkspaceMutations,
  useWorkspacesList,
  type WorkspaceColumn,
  type WorkspaceSummary,
} from "@/hooks/use-workspace";
import {
  useEstadoInstitucional,
  isAdminTecnico,
  isAtivo,
} from "@/hooks/use-estado-institucional";
import { WorkspaceCard, WorkspaceCardSkeleton } from "@/components/workspace/workspace-card";
import { WorkspaceCardDrawer } from "@/components/workspace/workspace-card-drawer";
import { WorkspaceColumnForm } from "@/components/workspace/workspace-column-form";
import { getColorClasses } from "@/lib/workspace/colors";
import { describeActive } from "@/lib/workspace/filters";
import type { AssistidoCard } from "@/hooks/use-workspace";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CadastrarCriancaSheet } from "@/components/assistidos/cadastrar-crianca-sheet";
import { CadastrarAdultoSheet } from "@/components/assistidos/cadastrar-adulto-sheet";
import { CadastrarProcessoSheet } from "@/components/processos/cadastrar-processo-sheet";

export const Route = createFileRoute("/_authenticated/area-de-trabalho")({
  head: () => ({
    meta: [
      { title: "Área de trabalho — Reintegra Infância" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AreaDeTrabalhoPage,
});

function AreaDeTrabalhoPage() {
  const { data: estado, isLoading: estadoLoading } = useEstadoInstitucional();
  const tecnico = isAdminTecnico(estado);
  const ativo = isAtivo(estado);
  const [context] = useState<"orgao" | "todos_orgaos">("orgao");
  const orgaoId = estado?.orgao_ativo?.id ?? null;

  // Lista de quadros do órgão + persistência da aba ativa
  const { data: boards, isLoading: boardsLoading } = useWorkspacesList(orgaoId);
  const storageKey = orgaoId ? `reintegra.ws.active.${orgaoId}` : null;
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!orgaoId || !boards) return;
    const list = boards.workspaces ?? [];
    if (list.length === 0) {
      setSelectedWorkspaceId(null);
      return;
    }
    const persisted = storageKey ? localStorage.getItem(storageKey) : null;
    const existing = list.find((w) => w.id === selectedWorkspaceId);
    const fromStorage = persisted ? list.find((w) => w.id === persisted) : null;
    const fallback = list.find((w) => w.is_default) ?? list[0];
    const next = existing ?? fromStorage ?? fallback;
    if (next && next.id !== selectedWorkspaceId) setSelectedWorkspaceId(next.id);
  }, [orgaoId, boards, storageKey, selectedWorkspaceId]);

  useEffect(() => {
    if (storageKey && selectedWorkspaceId) {
      localStorage.setItem(storageKey, selectedWorkspaceId);
    }
  }, [storageKey, selectedWorkspaceId]);

  const {
    data: workspace,
    isLoading: wsLoading,
    refetch,
    isFetching,
  } = useWorkspace(context, orgaoId, selectedWorkspaceId);
  const mutations = useWorkspaceMutations(context, orgaoId);
  const boardMutations = useWorkspaceBoardMutations(orgaoId);

  // Estado local
  const [searchText, setSearchText] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [drawerCard, setDrawerCard] = useState<AssistidoCard | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingColumn, setEditingColumn] = useState<WorkspaceColumn | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WorkspaceColumn | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [criancaOpen, setCriancaOpen] = useState(false);
  const [adultoOpen, setAdultoOpen] = useState(false);
  const [processoOpen, setProcessoOpen] = useState(false);
  const [boardDialog, setBoardDialog] = useState<
    | { mode: "create" }
    | { mode: "rename"; board: WorkspaceSummary }
    | { mode: "duplicate"; board: WorkspaceSummary }
    | null
  >(null);
  const [boardNameInput, setBoardNameInput] = useState("");
  const [confirmDeleteBoard, setConfirmDeleteBoard] = useState<WorkspaceSummary | null>(null);

  const busca = useBuscaAssistidos(
    searchText.trim(),
    null,
    tecnico ? null : orgaoId,
    searchActive && searchText.trim().length >= 2,
  );

  if (estadoLoading || (boardsLoading && !boards)) {
    return <WorkspaceSkeleton />;
  }

  if (!ativo && !tecnico) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Área de trabalho</h1>
        <div className="mt-6 rounded-md border border-border bg-surface p-4 text-sm">
          <p className="font-medium">Complete seu cadastro institucional.</p>
          <p className="mt-1 text-muted-foreground">
            Sua área de trabalho será liberada após a aprovação do vínculo pelo
            Administrador Institucional.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/solicitar-acesso">Preencher dados</Link>
          </Button>
        </div>
      </div>
    );
  }

  const columns = workspace?.columns ?? [];
  const workspaceId = workspace?.workspace_id ?? null;

  function openCreate() {
    setEditingColumn(null);
    setFormMode("create");
    setFormOpen(true);
  }

  function openEdit(col: WorkspaceColumn) {
    setEditingColumn(col);
    setFormMode("edit");
    setFormOpen(true);
  }

  const handleSubmitForm: React.ComponentProps<typeof WorkspaceColumnForm>["onSubmit"] =
    async (payload) => {
      try {
        if (formMode === "create") {
          if (!workspaceId) throw new Error("Workspace não encontrado");
          await mutations.create.mutateAsync({
            workspace_id: workspaceId,
            title: payload.title,
            description: payload.description,
            color_token: payload.color_token,
            custom_color: payload.custom_color,
            filter: payload.filter,
          });
          toast.success("Coluna criada.");
        } else if (editingColumn) {
          await mutations.update.mutateAsync({
            column_id: editingColumn.id,
            version: editingColumn.version,
            title: payload.title,
            description: payload.description,
            color_token: payload.color_token,
            custom_color: payload.custom_color,
            filter: payload.filter,
          });
          toast.success("Coluna atualizada.");
        }
      } catch (e) {
        toast.error((e as Error).message || "Não foi possível salvar a coluna.");
        throw e;
      }
    };

  async function moveColumn(col: WorkspaceColumn, direction: -1 | 1) {
    if (!workspaceId) return;
    const idx = columns.findIndex((c) => c.id === col.id);
    const target = idx + direction;
    if (target < 0 || target >= columns.length) return;
    const ids = columns.map((c) => c.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    try {
      await mutations.reorder.mutateAsync({
        workspace_id: workspaceId,
        ordered_ids: ids,
      });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível reordenar.");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await mutations.remove.mutateAsync(confirmDelete.id);
      toast.success("Coluna removida.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível remover.");
    } finally {
      setConfirmDelete(null);
    }
  }

  async function handleReset() {
    if (!workspaceId) return;
    try {
      await mutations.reset.mutateAsync(workspaceId);
      toast.success("Quadro restaurado para o padrão.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível restaurar.");
    } finally {
      setConfirmReset(false);
    }
  }

  async function handleDuplicate(col: WorkspaceColumn) {
    try {
      await mutations.duplicate.mutateAsync(col.id);
      toast.success("Coluna duplicada.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível duplicar.");
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-surface px-4 py-5 lg:px-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Centro de trabalho institucional
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Área de trabalho</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {" "}
        </p>

        {/* Busca superior */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearchActive(true);
          }}
          className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <label htmlFor="ws-search" className="sr-only">
            Buscar crianças e adolescentes
          </label>
          <div className="relative flex-1">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="ws-search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Nome, familiar, processo ou entidade..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            {searchActive && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchActive(false);
                  setSearchText("");
                }}
              >
                Limpar
              </Button>
            )}
            <Button type="submit" disabled={searchText.trim().length < 2}>
              Buscar
            </Button>
            <TooltipProvider delayDuration={200}>
              <div className="ml-1 flex items-center gap-1 border-l border-border pl-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setCriancaOpen(true)}
                      aria-label="Cadastrar criança ou adolescente"
                    >
                      <Baby className="h-4 w-4" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cadastrar criança ou adolescente</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setAdultoOpen(true)}
                      aria-label="Cadastrar adulto assistido"
                    >
                      <UserRound className="h-4 w-4" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cadastrar adulto assistido</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setProcessoOpen(true)}
                      aria-label="Cadastrar processo judicial"
                    >
                      <Scale className="h-4 w-4" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cadastrar processo judicial</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </form>
      </div>

      <CadastrarCriancaSheet open={criancaOpen} onOpenChange={setCriancaOpen} orgaoId={orgaoId} />
      <CadastrarAdultoSheet open={adultoOpen} onOpenChange={setAdultoOpen} orgaoId={orgaoId} />
      <CadastrarProcessoSheet open={processoOpen} onOpenChange={setProcessoOpen} orgaoId={orgaoId} />


      {/* Resultados da busca */}
      {searchActive && (
        <SearchResults
          loading={busca.isFetching}
          total={busca.data?.total ?? 0}
          items={busca.data?.items ?? []}
          onOpen={(c) => setDrawerCard(c)}
        />
      )}

      {/* Abas de quadros */}
      <WorkspaceTabs
        boards={boards?.workspaces ?? []}
        activeId={selectedWorkspaceId}
        canEdit={boards?.can_edit ?? false}
        onSelect={(id) => setSelectedWorkspaceId(id)}
        onCreate={() => {
          setBoardNameInput("");
          setBoardDialog({ mode: "create" });
        }}
        onRename={(b) => {
          setBoardNameInput(b.nome);
          setBoardDialog({ mode: "rename", board: b });
        }}
        onDuplicate={(b) => {
          setBoardNameInput(`${b.nome} (cópia)`);
          setBoardDialog({ mode: "duplicate", board: b });
        }}
        onSetDefault={(b) => {
          boardMutations.definirPadrao.mutate(b.id, {
            onSuccess: () => toast.success("Quadro padrão atualizado"),
            onError: (err) =>
              toast.error("Não foi possível atualizar", {
                description: err instanceof Error ? err.message : String(err),
              }),
          });
        }}
        onDelete={(b) => setConfirmDeleteBoard(b)}
      />

      {/* Toolbar do quadro */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 lg:px-8">
        <div>
          <h2 className="text-sm font-semibold">
            {workspace?.nome ?? "Meu quadro"}
            {workspace?.is_default && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Star className="h-3 w-3" aria-hidden /> Padrão
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            {wsLoading ? "Carregando..." : `${columns.length} coluna(s)`} ·{" "}
            {tecnico
              ? "Administrador Técnico (acesso global disponível)"
              : estado?.orgao_ativo?.nome ?? "Sem vínculo ativo"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="ml-1.5">Atualizar</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmReset(true)}
            disabled={mutations.reset.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            <span className="ml-1.5">Restaurar padrão</span>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span className="ml-1.5">Nova coluna</span>
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto bg-canvas p-4 lg:p-6">
        <div className="grid grid-flow-col auto-cols-[320px] gap-4">
          {columns.map((col, idx) => (
            <BoardColumn
              key={col.id}
              column={col}
              index={idx}
              total={columns.length}
              onOpenCard={(c) => setDrawerCard(c)}
              onEdit={() => openEdit(col)}
              onDelete={() => setConfirmDelete(col)}
              onDuplicate={() => handleDuplicate(col)}
              onMove={(d) => moveColumn(col, d)}
            />
          ))}
        </div>
      </div>

      <WorkspaceColumnForm
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        workspaceId={workspaceId}
        column={editingColumn}
        onSubmit={handleSubmitForm}
      />
      <WorkspaceCardDrawer
        card={drawerCard}
        open={!!drawerCard}
        onOpenChange={(v) => !v && setDrawerCard(null)}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coluna?</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir esta coluna removerá apenas esta visualização. Nenhum
              cadastro será excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar quadro?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as colunas personalizadas serão removidas e a coluna base
              voltará ao padrão. Nenhum cadastro será excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Restaurar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog criar/renomear/duplicar quadro */}
      <Dialog
        open={boardDialog !== null}
        onOpenChange={(o) => {
          if (!o) setBoardDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {boardDialog?.mode === "create" && "Novo quadro"}
              {boardDialog?.mode === "rename" && "Renomear quadro"}
              {boardDialog?.mode === "duplicate" && "Duplicar quadro"}
            </DialogTitle>
            <DialogDescription>
              {boardDialog?.mode === "create" &&
                "Crie um novo quadro para este órgão. Ele inicia com a coluna base padrão."}
              {boardDialog?.mode === "rename" && "Escolha um novo nome para o quadro."}
              {boardDialog?.mode === "duplicate" &&
                "As colunas e filtros do quadro original serão copiadas."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="board-name">Nome do quadro</Label>
            <Input
              id="board-name"
              value={boardNameInput}
              maxLength={80}
              onChange={(e) => setBoardNameInput(e.target.value)}
              placeholder="Ex.: Prioridades da semana"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBoardDialog(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                const nome = boardNameInput.trim();
                if (nome.length < 2) {
                  toast.error("Informe um nome com pelo menos 2 caracteres.");
                  return;
                }
                try {
                  if (boardDialog?.mode === "create") {
                    const created = await boardMutations.criar.mutateAsync({ nome });
                    setSelectedWorkspaceId(created.id);
                    toast.success("Quadro criado");
                  } else if (boardDialog?.mode === "rename") {
                    await boardMutations.renomear.mutateAsync({
                      workspace_id: boardDialog.board.id,
                      nome,
                    });
                    toast.success("Quadro renomeado");
                  } else if (boardDialog?.mode === "duplicate") {
                    const created = await boardMutations.duplicar.mutateAsync({
                      workspace_id: boardDialog.board.id,
                      nome,
                    });
                    setSelectedWorkspaceId(created.id);
                    toast.success("Quadro duplicado");
                  }
                  setBoardDialog(null);
                } catch (err) {
                  toast.error("Não foi possível concluir", {
                    description: err instanceof Error ? err.message : String(err),
                  });
                }
              }}
              disabled={
                boardMutations.criar.isPending ||
                boardMutations.renomear.isPending ||
                boardMutations.duplicar.isPending
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDeleteBoard}
        onOpenChange={(v) => !v && setConfirmDeleteBoard(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir quadro?</AlertDialogTitle>
            <AlertDialogDescription>
              O quadro <strong>{confirmDeleteBoard?.nome}</strong> e todas as suas
              colunas serão removidos. Nenhum cadastro de assistido será excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDeleteBoard) return;
                try {
                  await boardMutations.excluir.mutateAsync(confirmDeleteBoard.id);
                  if (selectedWorkspaceId === confirmDeleteBoard.id) {
                    setSelectedWorkspaceId(null);
                  }
                  toast.success("Quadro excluído");
                  setConfirmDeleteBoard(null);
                } catch (err) {
                  toast.error("Não foi possível excluir", {
                    description: err instanceof Error ? err.message : String(err),
                  });
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WorkspaceTabs({
  boards,
  activeId,
  canEdit,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onSetDefault,
  onDelete,
}: {
  boards: WorkspaceSummary[];
  activeId: string | null;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (b: WorkspaceSummary) => void;
  onDuplicate: (b: WorkspaceSummary) => void;
  onSetDefault: (b: WorkspaceSummary) => void;
  onDelete: (b: WorkspaceSummary) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Quadros de trabalho"
      className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface/60 px-4 py-2 lg:px-8"
    >
      {boards.map((b) => {
        const active = b.id === activeId;
        return (
          <div
            key={b.id}
            className={cn(
              "group flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-transparent hover:bg-muted",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(b.id)}
              className="flex items-center gap-1.5 font-medium"
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              <span className="max-w-[180px] truncate">{b.nome}</span>
              {b.is_default && (
                <Star
                  className="h-3 w-3 fill-current text-warning"
                  aria-label="Quadro padrão"
                />
              )}
            </button>
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Ações do quadro ${b.nome}`}
                    className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onRename(b)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onDuplicate(b)}>
                    <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
                  </DropdownMenuItem>
                  {!b.is_default && (
                    <DropdownMenuItem onSelect={() => onSetDefault(b)}>
                      <Star className="mr-2 h-3.5 w-3.5" /> Definir como padrão
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    disabled={b.is_default}
                    onSelect={() => onDelete(b)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          className="ml-1 h-7 gap-1 px-2 text-xs"
          onClick={onCreate}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Novo quadro
        </Button>
      )}
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-96" />
      <div className="mt-8 grid grid-flow-col auto-cols-[320px] gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-md border border-border bg-surface p-4">
            <Skeleton className="h-5 w-32" />
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

function SearchResults({
  loading,
  total,
  items,
  onOpen,
}: {
  loading: boolean;
  total: number;
  items: AssistidoCard[];
  onOpen: (c: AssistidoCard) => void;
}) {
  return (
    <div className="border-b border-border bg-surface/50 px-4 py-4 lg:px-8">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground">
          Resultados da busca {loading ? "· carregando..." : `· ${total} encontrado(s)`}
        </p>
      </div>
      {loading ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <WorkspaceCardSkeleton />
          <WorkspaceCardSkeleton />
          <WorkspaceCardSkeleton />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhum resultado encontrado. Revise o termo pesquisado.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <WorkspaceCard key={c.id} data={c} onClick={() => onOpen(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  column,
  index,
  total,
  onOpenCard,
  onEdit,
  onDelete,
  onDuplicate,
  onMove,
}: {
  column: WorkspaceColumn;
  index: number;
  total: number;
  onOpenCard: (c: AssistidoCard) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const color = getColorClasses(column.color_token);
  const { data, isLoading } = useColumnAssistidos(column.id, 30);
  const chips = useMemo(
    () => describeActive(column.filter_definition?.conditions ?? []),
    [column.filter_definition],
  );

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-l-4 border-border bg-surface",
        color.border,
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-2 rounded-t-md p-3",
          color.headerBg,
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="truncate text-sm font-semibold">{column.title}</h3>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {data?.total ?? 0}
            </span>
          </div>
          {column.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {column.description}
            </p>
          )}
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {chips.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center rounded border border-border bg-canvas px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-canvas"
              aria-label="Opções da coluna"
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden /> Editar
            </DropdownMenuItem>
            {!column.is_base_column && (
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-3.5 w-3.5" aria-hidden /> Duplicar
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onMove(-1)} disabled={index === 0}>
              <ArrowLeft className="mr-2 h-3.5 w-3.5" aria-hidden /> Mover à esquerda
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMove(1)} disabled={index === total - 1}>
              <ArrowRight className="mr-2 h-3.5 w-3.5" aria-hidden /> Mover à direita
            </DropdownMenuItem>
            {!column.is_base_column && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden /> Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="max-h-[calc(100vh-360px)] flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading ? (
          <>
            <WorkspaceCardSkeleton />
            <WorkspaceCardSkeleton />
          </>
        ) : (data?.items ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-canvas p-4 text-center text-xs text-muted-foreground">
            {column.is_base_column
              ? "Nenhum cadastro acessível ainda."
              : "Nenhum cadastro corresponde aos filtros desta coluna."}
            {!column.is_base_column && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onEdit}
                className="mt-2 h-7 w-full text-xs"
              >
                Editar filtros
              </Button>
            )}
          </div>
        ) : (
          (data?.items ?? []).map((c) => (
            <WorkspaceCard key={c.id} data={c} onClick={() => onOpenCard(c)} />
          ))
        )}
      </div>
    </div>
  );
}
