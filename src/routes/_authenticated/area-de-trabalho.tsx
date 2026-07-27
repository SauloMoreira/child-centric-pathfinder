import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  X,
  BookOpen,
  Trash2,
  FileText,
  Scale,
  Layers,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Lock,
} from "lucide-react";
import { useEstadoInstitucional, isDefensor } from "@/hooks/use-estado-institucional";
import {
  adicionarCardWorkspace,
  criarColunaWorkspace,
  ensureDefensorWorkspace,
  excluirColunaWorkspace,
  isConcurrentChangeError,
  listarBiblioteca,
  listarWorkspaceCompleto,
  moverCardWorkspace,
  moverColunaWorkspace,
  removerCardWorkspace,
  workspaceKeys,
  type WorkspaceAccess,
  type WorkspaceCardDto,
  type WorkspaceColumn,
  type WorkspaceCompleto,
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

export const Route = createFileRoute("/_authenticated/area-de-trabalho")({
  head: () => ({
    meta: [
      { title: "Área de trabalho — Reintegra Infância" },
      {
        name: "description",
        content:
          "Área de trabalho pessoal do Defensor Público — organize atendimentos e cotas em colunas manuais.",
      },
    ],
  }),
  component: AreaDeTrabalhoPage,
});

function AreaDeTrabalhoPage() {
  const { data: estado } = useEstadoInstitucional();
  const defensorId = isDefensor(estado) ? estado?.user_id ?? null : null;
  // Nesta fase, apenas o próprio Defensor acessa sua Área de Trabalho.
  // Membros/Admin Técnico usarão um seletor dedicado em turnos futuros.
  const contextDefensorId = defensorId;

  if (!estado) {
    return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>;
  }

  if (!contextDefensorId) {
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

  return (
    <WorkspaceBoard
      defensorId={contextDefensorId}
      isOwner={defensorId === contextDefensorId}
    />
  );
}

function WorkspaceBoard({
  defensorId,
  isOwner,
}: {
  defensorId: string;
  isOwner: boolean;
}) {
  const qc = useQueryClient();

  // Ensure workspace only for owner (defensor de si próprio)
  const ensureQuery = useQuery({
    queryKey: ["ws-ensure", defensorId],
    queryFn: () => ensureDefensorWorkspace(defensorId),
    enabled: isOwner,
    staleTime: Infinity,
  });

  const workspaceQuery = useQuery({
    queryKey: workspaceKeys.byDefender(defensorId),
    queryFn: () => listarWorkspaceCompleto(defensorId),
    enabled: !isOwner || !!ensureQuery.data,
  });

  const data = workspaceQuery.data;

  return (
    <div className="flex h-full min-h-[calc(100vh-2rem)] flex-col px-6 py-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Reintegra · Área de trabalho
          </p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Layers className="h-6 w-6 text-institutional" />
            {data?.workspace?.nome ?? "Minha Área de Trabalho"}
          </h1>
          {data?.access.accessMode === "team_readonly" && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Somente leitura · Membro de equipe
            </p>
          )}
          {data?.access.accessMode === "technical_readonly" && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-warning-foreground">
              Modo técnico · Somente leitura
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/biblioteca">
            <BookOpen className="h-4 w-4" /> Biblioteca
          </Link>
        </Button>
      </header>

      <div className="mt-2 flex-1 min-h-0">
        {workspaceQuery.isLoading ? (
          <div className="surface-panel flex h-full items-center justify-center p-12 text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : !data?.workspace ? (
          <div className="surface-panel flex h-full items-center justify-center p-12 text-sm text-muted-foreground">
            Nenhuma Área de Trabalho disponível para este Defensor.
          </div>
        ) : (
          <ColumnsBoard
            defensorId={defensorId}
            workspace={data.workspace}
            access={data.access}
            columns={data.columns}
            cards={data.cards}
            onRefetch={() =>
              qc.invalidateQueries({ queryKey: workspaceKeys.byDefender(defensorId) })
            }
          />
        )}
      </div>
    </div>
  );
}

function ColumnsBoard({
  defensorId,
  workspace,
  access,
  columns,
  cards,
  onRefetch,
}: {
  defensorId: string;
  workspace: WorkspaceMeta;
  access: WorkspaceAccess;
  columns: WorkspaceColumn[];
  cards: WorkspaceCardDto[];
  onRefetch: () => void;
}) {
  const qc = useQueryClient();
  const key = workspaceKeys.byDefender(defensorId);

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

  const handleMutationError = (e: unknown) => {
    if (isConcurrentChangeError(e)) {
      toast.error(
        "A Área de Trabalho foi alterada em outra sessão. Atualizamos o quadro para exibir a versão mais recente.",
      );
      qc.invalidateQueries({ queryKey: key });
      return;
    }
    toast.error(e instanceof Error ? e.message : "Falha ao processar operação");
  };

  const criarCol = useMutation({
    mutationFn: (nome: string) =>
      criarColunaWorkspace({
        workspaceId: workspace.id,
        expectedWorkspaceVersion: workspace.optimisticVersion,
        nome,
      }),
    onSuccess: onRefetch,
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

  const excluirCol = useMutation({
    mutationFn: (v: { columnId: string; destinationColumnId: string | null }) =>
      excluirColunaWorkspace({
        columnId: v.columnId,
        destinationColumnId: v.destinationColumnId,
        expectedWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: onRefetch,
    onError: handleMutationError,
  });

  const removerCard = useMutation({
    mutationFn: (cardId: string) =>
      removerCardWorkspace({
        cardId,
        expectedWorkspaceVersion: workspace.optimisticVersion,
      }),
    onSuccess: onRefetch,
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

  const [novaCol, setNovaCol] = useState("");

  return (
    <div className="h-full overflow-x-auto pb-4">
      <div className="flex h-full min-w-max items-start gap-4">
        {columns.map((c, idx) => (
          <ColumnCard
            key={c.id}
            column={c}
            index={idx}
            totalColumns={columns.length}
            allColumns={columns}
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
            onAdded={onRefetch}
          />
        ))}

        {access.canManageColumns && (
          <div className="w-72 shrink-0">
            <form
              className="surface-panel flex items-center gap-2 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = novaCol.trim();
                if (!n) return;
                criarCol.mutate(n);
                setNovaCol("");
              }}
            >
              <Input
                value={novaCol}
                onChange={(e) => setNovaCol(e.target.value)}
                placeholder="Nova coluna"
                className="h-8"
              />
              <Button size="sm" type="submit" disabled={criarCol.isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

const COLOR_INDICATOR: Record<string, string> = {
  neutral: "bg-muted-foreground/40",
  green: "bg-institutional",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  burgundy: "bg-red-700",
  purple: "bg-purple-500",
  slate: "bg-slate-500",
  rose: "bg-rose-500",
};

function ColumnCard({
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
  onAdded,
}: {
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
  onAdded: () => void;
}) {
  const indicator = COLOR_INDICATOR[column.corToken] ?? COLOR_INDICATOR.neutral;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const otherColumns = allColumns.filter((c) => c.id !== column.id);

  return (
    <div className="w-72 shrink-0">
      <div className="surface-panel flex h-full max-h-[calc(100vh-13rem)] flex-col p-3">
        <header className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", indicator)}
                style={
                  column.corCustom
                    ? { backgroundColor: column.corCustom }
                    : undefined
                }
                aria-hidden
              />
              <h3 className="truncate text-sm font-semibold">{column.nome}</h3>
              <span className="font-mono text-[10px] text-muted-foreground">
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
                  className="p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Ações da coluna"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={index === 0}
                  onClick={() => onMoveCol("left")}
                >
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

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {cards.map((card, ci) => (
            <WorkspaceCard
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
            />
          ))}
          {cards.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhum atendimento ou cota nesta coluna.
            </p>
          )}
        </div>

        {access.canAddItems && (
          <div className="mt-2">
            <AddCardDialog
              columnId={column.id}
              workspace={workspace}
              onAdded={onAdded}
            />
          </div>
        )}
      </div>

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
            A coluna está vazia e será removida da Área de Trabalho.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Existem {cards.length} card(s) nesta coluna. Escolha o destino para
              onde os cards serão movidos antes da exclusão.
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

function WorkspaceCard({
  card,
  access,
  index,
  columnCount,
  otherColumns,
  onRemove,
  onMoveUp,
  onMoveDown,
  onMoveToColumn,
}: {
  card: WorkspaceCardDto;
  access: WorkspaceAccess;
  index: number;
  columnCount: number;
  otherColumns: WorkspaceColumn[];
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToColumn: (targetId: string) => void;
}) {
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
      className={cn(
        "group relative rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-institutional",
        !card.canOpen && "opacity-70",
      )}
    >
      <div className="flex items-start gap-2">
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
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => onMoveToColumn(c.id)}
                    >
                      {c.nome}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onRemove}>
                <X className="mr-2 h-4 w-4" /> Remover da Área de Trabalho
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </article>
  );
}

function AddCardDialog({
  columnId,
  workspace,
  onAdded,
}: {
  columnId: string;
  workspace: WorkspaceMeta;
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
          "A Área de Trabalho foi alterada em outra sessão. Atualizamos o quadro para exibir a versão mais recente.",
        );
        qc.invalidateQueries({ queryKey: workspaceKeys.byDefender(workspace.defensorUserId) });
        setOpen(false);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/ITEM_ALREADY_IN_WORKSPACE/i.test(msg)) {
        toast.error("Este conteúdo já está no quadro.");
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
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setSelecionado(i.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded p-2 text-left text-xs transition hover:bg-muted",
                      selected && "bg-muted",
                    )}
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.titulo}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {i.categoria_nome ?? "Sem categoria"} · {i.status}
                      </p>
                    </div>
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
