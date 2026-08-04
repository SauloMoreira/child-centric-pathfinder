import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  FileText,
  FolderInput,
  MoreVertical,
  Pencil,
  Scale,
  Search,
  Star,
} from "lucide-react";
import {
  alternarFavoritoBiblioteca,
  listarAutoresBiblioteca,
  listarBiblioteca,
  listarCategoriasBiblioteca,
  obterAtendimentoDetalhe,
  obterCotaDetalhe,
  registrarAcessoBiblioteca,
  type AtendimentoDetalhe,
  type BibliotecaItem,
  type CotaDetalhe,
  type ContentKind,
} from "@/lib/reintegra-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEstadoInstitucional } from "@/hooks/use-estado-institucional";
import { useCurrentDefenderContext } from "@/features/team/defender-bonds";
import { useWorkArea } from "@/features/work-area";
import { CotaFormSheet } from "@/components/cota/cota-form-sheet";
import { CotaDetailSheet } from "@/components/cota/cota-detail-sheet";
import { cotaKeys } from "@/features/cota/hooks";
import { AtendimentoFormSheet } from "@/components/atendimento/atendimento-form-sheet";
import { AtendimentoDetailSheet } from "@/components/atendimento/atendimento-detail-sheet";
import { atendimentoKeys } from "@/features/atendimento/hooks";
import { FavoritoEstatisticasTooltip } from "@/components/biblioteca/favorito-estatisticas-tooltip";
import {
  MoveToPanelDialog,
  type MoveToPanelTarget,
} from "@/routes/_authenticated/area-de-trabalho";

export const Route = createFileRoute("/_authenticated/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca — Ágora" },
      {
        name: "description",
        content: "Biblioteca institucional de modelos de atendimentos e cotas reutilizáveis.",
      },
    ],
  }),
  component: BibliotecaPage,
});

const kindMeta: Record<ContentKind, { label: string; Icon: typeof FileText }> = {
  atendimento: { label: "Atendimento", Icon: FileText },
  cota: { label: "Cota", Icon: Scale },
};

type Autoria = "todos" | "meus" | (string & {});
type OrderBy = "recentes" | "favoritos" | "utilizados";

function BibliotecaPage() {
  const qc = useQueryClient();
  const { data: estado } = useEstadoInstitucional();
  const meuUserId = estado?.user_id ?? null;
  const defenderContext = useCurrentDefenderContext();
  const defensorId =
    defenderContext.mode === "owner"
      ? (estado?.user_id ?? null)
      : (defenderContext.current?.defenderUserId ?? null);
  const workArea = useWorkArea(defensorId);
  const allPanels = workArea.data?.panels ?? [];

  const [kind, setKind] = useState<ContentKind | "todos">("todos");
  const [categoria, setCategoria] = useState<string>("todas");
  const [query, setQuery] = useState("");
  const [autoria, setAutoria] = useState<Autoria>("todos");
  const [orderBy, setOrderBy] = useState<OrderBy>("recentes");
  const [somenteFavoritos, setSomenteFavoritos] = useState(false);

  // Ajuste doc — visualização/edição reaproveitam as mesmas caixas já
  // usadas na área de trabalho, em vez do antigo editor genérico da rota
  // /biblioteca/$itemId.
  const [cotaDetailId, setCotaDetailId] = useState<string | null>(null);
  const [cotaFormTarget, setCotaFormTarget] = useState<
    { mode: "create" } | { mode: "edit"; itemId: string; detalhe: CotaDetalhe } | null
  >(null);
  const [cotaFormOpen, setCotaFormOpen] = useState(false);

  const [atendimentoDetailId, setAtendimentoDetailId] = useState<string | null>(null);
  const [atendimentoFormTarget, setAtendimentoFormTarget] = useState<
    { mode: "create" } | { mode: "edit"; itemId: string; detalhe: AtendimentoDetalhe } | null
  >(null);
  const [atendimentoFormOpen, setAtendimentoFormOpen] = useState(false);

  // Ajuste doc — "Adicionar em painel" a partir do card da Biblioteca.
  const [moveTarget, setMoveTarget] = useState<MoveToPanelTarget | null>(null);

  const categoriasQuery = useQuery({
    queryKey: ["biblioteca-categorias"],
    queryFn: () => listarCategoriasBiblioteca(),
  });

  const autoresQuery = useQuery({
    queryKey: ["biblioteca-autores"],
    queryFn: () => listarAutoresBiblioteca(),
  });

  const itensQuery = useQuery({
    queryKey: ["biblioteca-itens", kind, categoria, query, autoria, orderBy, somenteFavoritos],
    queryFn: () =>
      listarBiblioteca({
        kind: kind === "todos" ? undefined : kind,
        categoria_id: categoria === "todas" ? undefined : categoria,
        query: query.trim() || undefined,
        apenas_meus: autoria === "meus",
        owner_user_id: autoria !== "todos" && autoria !== "meus" ? autoria : undefined,
        favoritos_apenas: somenteFavoritos,
        order_by: orderBy,
      }),
  });

  const itens = itensQuery.data ?? [];
  const categorias = categoriasQuery.data ?? [];
  const autores = autoresQuery.data ?? [];

  const favoritar = useMutation({
    mutationFn: (itemId: string) => alternarFavoritoBiblioteca(itemId),
    onSuccess: (res, itemId) => {
      qc.setQueryData<BibliotecaItem[]>(
        ["biblioteca-itens", kind, categoria, query, autoria, orderBy, somenteFavoritos],
        (prev) =>
          prev?.map((it) =>
            it.id === itemId
              ? { ...it, is_favorited: res.is_favorited, favorite_count: res.favorite_count }
              : it,
          ),
      );
    },
    onError: () => toast.error("Não foi possível atualizar o favorito"),
  });

  const abrirItem = (item: BibliotecaItem) => {
    registrarAcessoBiblioteca(item.id).catch(() => {
      // Ajuste doc — contador de uso é best-effort; falha aqui não deve
      // impedir a abertura do item.
    });
    if (item.kind === "cota") setCotaDetailId(item.id);
    else setAtendimentoDetailId(item.id);
  };

  const handleEditarItem = async (item: BibliotecaItem) => {
    try {
      if (item.kind === "cota") {
        const detalhe = await qc.fetchQuery({
          queryKey: cotaKeys.detalhe(item.id),
          queryFn: () => obterCotaDetalhe(item.id),
        });
        setCotaFormTarget({ mode: "edit", itemId: item.id, detalhe });
        setCotaFormOpen(true);
      } else {
        const detalhe = await qc.fetchQuery({
          queryKey: atendimentoKeys.detalhe(item.id),
          queryFn: () => obterAtendimentoDetalhe(item.id),
        });
        setAtendimentoFormTarget({ mode: "edit", itemId: item.id, detalhe });
        setAtendimentoFormOpen(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar para edição");
    }
  };

  const onRefetchBiblioteca = () => qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Ágora · Biblioteca institucional
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BookOpen className="h-6 w-6 text-institutional" />
          Biblioteca de atendimentos e cotas
        </h1>
      </header>

      <div className="surface-panel mb-6 flex flex-wrap items-center gap-2 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título ou conteúdo…"
            className="pl-9"
          />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as ContentKind | "todos")}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="atendimento">Atendimentos</SelectItem>
            <SelectItem value="cota">Cotas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={autoria} onValueChange={(v) => setAutoria(v)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Autoria: todos</SelectItem>
            <SelectItem value="meus">Somente meus</SelectItem>
            {autores
              .filter((a) => a.user_id !== meuUserId)
              .map((a) => (
                <SelectItem key={a.user_id} value={a.user_id}>
                  {a.nome}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={orderBy} onValueChange={(v) => setOrderBy(v as OrderBy)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recentes">Mais recentes</SelectItem>
            <SelectItem value="favoritos">Mais favoritados</SelectItem>
            <SelectItem value="utilizados">Mais utilizados</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={somenteFavoritos ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setSomenteFavoritos((v) => !v)}
        >
          <Star className={cn("h-3.5 w-3.5", somenteFavoritos && "fill-current")} aria-hidden />
          Favoritos
        </Button>
      </div>

      {itensQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="surface-panel p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {itens.map((it) => (
            <BibliotecaCard
              key={it.id}
              item={it}
              podeEditar={it.owner_user_id === meuUserId}
              onOpen={() => abrirItem(it)}
              onEditar={() => handleEditarItem(it)}
              onAdicionarEmPainel={() => setMoveTarget({ itemId: it.id, title: it.titulo })}
              onFavoritar={() => favoritar.mutate(it.id)}
            />
          ))}
        </ul>
      )}

      <CotaDetailSheet
        itemId={cotaDetailId}
        onOpenChange={(v) => !v && setCotaDetailId(null)}
        onEdit={() => {
          const detalhe = qc.getQueryData<CotaDetalhe>(cotaKeys.detalhe(cotaDetailId ?? ""));
          if (detalhe) {
            setCotaDetailId(null);
            setCotaFormTarget({ mode: "edit", itemId: detalhe.id, detalhe });
            setCotaFormOpen(true);
          }
        }}
        onDeleted={() => {
          setCotaDetailId(null);
          onRefetchBiblioteca();
        }}
      />
      <CotaFormSheet
        open={cotaFormOpen}
        onOpenChange={setCotaFormOpen}
        target={cotaFormTarget}
        onSaved={onRefetchBiblioteca}
      />

      <AtendimentoDetailSheet
        itemId={atendimentoDetailId}
        onOpenChange={(v) => !v && setAtendimentoDetailId(null)}
        onEdit={() => {
          const detalhe = qc.getQueryData<AtendimentoDetalhe>(
            atendimentoKeys.detalhe(atendimentoDetailId ?? ""),
          );
          if (detalhe) {
            setAtendimentoDetailId(null);
            setAtendimentoFormTarget({ mode: "edit", itemId: detalhe.id, detalhe });
            setAtendimentoFormOpen(true);
          }
        }}
        onDeleted={() => {
          setAtendimentoDetailId(null);
          onRefetchBiblioteca();
        }}
      />
      <AtendimentoFormSheet
        open={atendimentoFormOpen}
        onOpenChange={setAtendimentoFormOpen}
        target={atendimentoFormTarget}
        onSaved={onRefetchBiblioteca}
      />

      {defensorId && (
        <MoveToPanelDialog
          open={!!moveTarget}
          onOpenChange={(v) => !v && setMoveTarget(null)}
          card={moveTarget}
          currentPanelId=""
          defensorId={defensorId}
          allPanels={allPanels}
          onDone={() => setMoveTarget(null)}
        />
      )}
    </div>
  );
}

function BibliotecaCard({
  item,
  podeEditar,
  onOpen,
  onEditar,
  onAdicionarEmPainel,
  onFavoritar,
}: {
  item: BibliotecaItem;
  podeEditar: boolean;
  onOpen: () => void;
  onEditar: () => void;
  onAdicionarEmPainel: () => void;
  onFavoritar: () => void;
}) {
  const { Icon, label } = kindMeta[item.kind];
  // Ajuste doc — todos os Atendimentos na Biblioteca são verdes.
  const isAtendimento = item.kind === "atendimento";

  return (
    <li>
      <div className="surface-panel flex h-full flex-col gap-3 p-4 transition hover:border-institutional">
        <button type="button" onClick={onOpen} className="flex items-start gap-3 text-left">
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              isAtendimento
                ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)]"
                : "bg-sidebar-accent text-institutional",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium leading-tight">{item.titulo}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
              {item.categorias.length > 0 ? ` · ${item.categorias.map((c) => c.nome).join(", ")}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Por {item.owner_nome}</p>
          </div>
        </button>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <FavoritoEstatisticasTooltip itemId={item.id} kind={item.kind}>
            <button
              type="button"
              onClick={onFavoritar}
              aria-label={item.is_favorited ? "Desfavoritar" : "Favoritar"}
              className={cn(
                "flex items-center gap-1 rounded p-1 text-xs transition hover:bg-muted",
                item.is_favorited ? "text-warning" : "text-muted-foreground",
              )}
            >
              <Star className={cn("h-3.5 w-3.5", item.is_favorited && "fill-current")} aria-hidden />
              {item.favorite_count}
            </button>
          </FavoritoEstatisticasTooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Ações"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar && (
                <DropdownMenuItem onClick={onEditar}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  {item.kind === "cota" ? "Editar cota" : "Editar atendimento"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onAdicionarEmPainel}>
                <FolderInput className="mr-2 h-3.5 w-3.5" />
                Adicionar em painel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
