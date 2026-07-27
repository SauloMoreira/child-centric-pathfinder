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
} from "lucide-react";
import { useEstadoInstitucional, isDefensor } from "@/hooks/use-estado-institucional";
import {
  adicionarCardWorkspace,
  criarColunaWorkspace,
  criarWorkspaceDefensor,
  excluirColunaWorkspace,
  excluirWorkspaceDefensor,
  listarBiblioteca,
  listarCardsColuna,
  listarColunasWorkspace,
  listarWorkspacesDefensor,
  moverCardWorkspace,
  removerCardWorkspace,
  type CardResumo,
  type ColunaResumo,
  type WorkspaceResumo,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
          "Área de trabalho pessoal do Defensor Público com quadros e cartões referenciando modelos da Biblioteca institucional.",
      },
    ],
  }),
  component: AreaDeTrabalhoPage,
});

function AreaDeTrabalhoPage() {
  const { data: estado } = useEstadoInstitucional();
  const orgaoId = estado?.contextoAtual?.orgaoId ?? null;
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
            A Área de Trabalho pessoal é exclusiva de Defensores Públicos. Membros de
            equipe acessam quadros através de vínculo ativo com um Defensor —
            funcionalidade em preparação.
          </p>
        </div>
      </div>
    );
  }

  if (!orgaoId) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="surface-panel p-6">
          <h1 className="text-lg font-semibold">Selecione um órgão</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione o órgão em uso no menu lateral para acessar seus quadros.
          </p>
        </div>
      </div>
    );
  }

  return <WorkspaceBoard defensorId={defensorId} orgaoId={orgaoId} />;
}

function WorkspaceBoard({ defensorId, orgaoId }: { defensorId: string; orgaoId: string }) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const wsQuery = useQuery({
    queryKey: ["ws-list", defensorId, orgaoId],
    queryFn: () => listarWorkspacesDefensor(defensorId, orgaoId),
  });

  const workspaces = wsQuery.data ?? [];

  useEffect(() => {
    if (!activeId && workspaces.length > 0) setActiveId(workspaces[0].id);
    if (activeId && !workspaces.find((w) => w.id === activeId)) {
      setActiveId(workspaces[0]?.id ?? null);
    }
  }, [workspaces, activeId]);

  const criarWs = useMutation({
    mutationFn: (nome: string) =>
      criarWorkspaceDefensor({ defensor_user_id: defensorId, orgao_id: orgaoId, nome }),
    onSuccess: (id) => {
      toast.success("Quadro criado");
      qc.invalidateQueries({ queryKey: ["ws-list"] });
      setActiveId(id);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha"),
  });

  const excluirWs = useMutation({
    mutationFn: (id: string) => excluirWorkspaceDefensor(id),
    onSuccess: () => {
      toast.success("Quadro excluído");
      qc.invalidateQueries({ queryKey: ["ws-list"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha"),
  });

  return (
    <div className="flex h-full min-h-[calc(100vh-2rem)] flex-col px-6 py-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Reintegra · Área de trabalho
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Layers className="h-6 w-6 text-institutional" />
            Meus quadros
          </h1>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/biblioteca">
            <BookOpen className="h-4 w-4" /> Biblioteca
          </Link>
        </Button>
      </header>

      <WorkspaceTabs
        workspaces={workspaces}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={(nome) => criarWs.mutate(nome)}
        onDelete={(id) => excluirWs.mutate(id)}
      />

      <div className="mt-4 flex-1 min-h-0">
        {activeId ? (
          <ColumnsBoard workspaceId={activeId} />
        ) : (
          <div className="surface-panel flex h-full items-center justify-center p-12 text-sm text-muted-foreground">
            Crie seu primeiro quadro para começar.
          </div>
        )}
      </div>
    </div>
  );
}

function WorkspaceTabs({
  workspaces,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  workspaces: WorkspaceResumo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (nome: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");

  return (
    <div className="flex items-center gap-2 border-b border-border">
      {workspaces.map((w) => (
        <div key={w.id} className="group relative flex items-center">
          <button
            onClick={() => onSelect(w.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition",
              w.id === activeId
                ? "border-institutional text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {w.nome}
            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
              {w.total_cards}
            </span>
          </button>
          {w.id === activeId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`Excluir o quadro "${w.nome}" e todas as colunas/cartões?`)) {
                      onDelete(w.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Excluir quadro
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <Plus className="h-4 w-4" /> Novo quadro
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo quadro</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="ws-nome">Nome do quadro</Label>
            <Input
              id="ws-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Semana / Prioridades / Modelos rápidos"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                const n = nome.trim();
                if (!n) return;
                onCreate(n);
                setNome("");
                setOpen(false);
              }}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ColumnsBoard({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const colsQuery = useQuery({
    queryKey: ["ws-cols", workspaceId],
    queryFn: () => listarColunasWorkspace(workspaceId),
  });

  const criarCol = useMutation({
    mutationFn: (nome: string) => criarColunaWorkspace(workspaceId, nome),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ws-cols", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ws-list"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha"),
  });

  const [novaCol, setNovaCol] = useState("");

  const cols = colsQuery.data ?? [];

  return (
    <div className="h-full overflow-x-auto pb-4">
      <div className="flex h-full min-w-max items-start gap-4">
        {cols.map((c) => (
          <ColumnCard key={c.id} column={c} workspaceId={workspaceId} />
        ))}
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
      </div>
    </div>
  );
}

function ColumnCard({ column, workspaceId }: { column: ColunaResumo; workspaceId: string }) {
  const qc = useQueryClient();

  const cardsQuery = useQuery({
    queryKey: ["col-cards", column.id],
    queryFn: () => listarCardsColuna(column.id),
  });

  const cards = cardsQuery.data ?? [];

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["col-cards", column.id] });
    qc.invalidateQueries({ queryKey: ["ws-cols", workspaceId] });
    qc.invalidateQueries({ queryKey: ["ws-list"] });
  };

  const excluirCol = useMutation({
    mutationFn: () => excluirColunaWorkspace(column.id),
    onSuccess: invalidateAll,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha"),
  });

  const removerCard = useMutation({
    mutationFn: (id: string) => removerCardWorkspace(id),
    onSuccess: invalidateAll,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha"),
  });

  return (
    <div className="w-72 shrink-0">
      <div className="surface-panel flex h-full max-h-[calc(100vh-13rem)] flex-col p-3">
        <header className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{column.nome}</h3>
            <span className="font-mono text-[10px] text-muted-foreground">
              {column.total_cards}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (confirm(`Excluir a coluna "${column.nome}"?`)) excluirCol.mutate();
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir coluna
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onRemove={() => removerCard.mutate(card.id)}
            />
          ))}
          {cards.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">Sem cartões</p>
          )}
        </div>

        <div className="mt-2">
          <AddCardDialog columnId={column.id} onAdded={invalidateAll} />
        </div>
      </div>
    </div>
  );
}

function CardItem({ card, onRemove }: { card: CardResumo; onRemove: () => void }) {
  const Icon = card.kind === "cota" ? Scale : FileText;
  return (
    <div className="group relative rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-institutional">
      <Link
        to="/biblioteca/$itemId"
        params={{ itemId: card.item_id }}
        className="block"
      >
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">{card.titulo}</p>
            {(card.categoria || card.note) && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {card.categoria ? `${card.categoria}` : ""}
                {card.categoria && card.note ? " · " : ""}
                {card.note ?? ""}
              </p>
            )}
          </div>
        </div>
      </Link>
      <button
        onClick={onRemove}
        className="absolute right-1 top-1 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
        aria-label="Remover cartão"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddCardDialog({ columnId, onAdded }: { columnId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const bibQuery = useQuery({
    queryKey: ["biblioteca-picker", query],
    queryFn: () => listarBiblioteca({ query: query.trim() || undefined, limit: 20 }),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: () => adicionarCardWorkspace(columnId, selecionado!, note.trim() || undefined),
    onSuccess: () => {
      toast.success("Cartão adicionado");
      onAdded();
      setOpen(false);
      setSelecionado(null);
      setNote("");
      setQuery("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha"),
  });

  const itens = bibQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
          <Plus className="h-4 w-4" /> Adicionar cartão
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar modelo da Biblioteca</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar modelo…"
            autoFocus
          />
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1">
            {itens.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum modelo encontrado.
              </p>
            ) : (
              itens.map((i) => {
                const Icon = i.kind === "cota" ? Scale : FileText;
                return (
                  <button
                    key={i.id}
                    onClick={() => setSelecionado(i.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded p-2 text-left text-sm transition hover:bg-sidebar-accent",
                      selecionado === i.id && "bg-sidebar-accent",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 text-institutional" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.titulo}</p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {i.kind}{i.categoria_nome ? ` · ${i.categoria_nome}` : ""} · {i.status}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div>
            <Label htmlFor="card-note">Nota interna (opcional)</Label>
            <Input
              id="card-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota visível apenas no seu quadro"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!selecionado || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? "Adicionando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
