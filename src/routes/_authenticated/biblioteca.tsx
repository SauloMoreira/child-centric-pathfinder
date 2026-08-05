import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  FileText,
  FolderInput,
  MoreVertical,
  Pencil,
  ScrollText,
  Search,
  Star,
  Users,
  X,
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
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

type Autoria = "todos" | "meus" | (string & {});
type ColunaOrdenacao =
  | "titulo"
  | "autor"
  | "categorias"
  | "updated_at"
  | "access_count"
  | "favorite_count"
  | "criados_a_partir_count";

// Ajuste doc (PÁGINA BIBLIOTECA) — o botão de tipo dentro do motor de busca
// assume o ícone e o rótulo respectivos de Cota/Atendimento; "todos" usa a
// lupa neutra padrão.
const TIPO_META: Record<"todos" | ContentKind, { label: string; Icon: typeof Search; placeholder: string }> = {
  todos: { label: "Todos os tipos", Icon: Search, placeholder: "Buscar por título ou conteúdo…" },
  atendimento: { label: "Atendimentos", Icon: FileText, placeholder: "Buscar atendimentos…" },
  cota: { label: "Cotas", Icon: ScrollText, placeholder: "Buscar cotas…" },
};

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
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  const [buscaCategoria, setBuscaCategoria] = useState("");
  const [query, setQuery] = useState("");
  const [autoria, setAutoria] = useState<Autoria>("todos");
  const [buscaAutor, setBuscaAutor] = useState("");
  const [somenteFavoritos, setSomenteFavoritos] = useState(false);
  const [ordenacao, setOrdenacao] = useState<{ coluna: ColunaOrdenacao; dir: "asc" | "desc" }>({
    coluna: "updated_at",
    dir: "desc",
  });

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

  // Ajuste doc — "Adicionar em painel" a partir da linha da Biblioteca.
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
    queryKey: ["biblioteca-itens", kind, categoriaIds, query, autoria, somenteFavoritos],
    queryFn: () =>
      listarBiblioteca({
        kind: kind === "todos" ? undefined : kind,
        categoria_ids: categoriaIds.length > 0 ? categoriaIds : undefined,
        query: query.trim() || undefined,
        apenas_meus: autoria === "meus",
        owner_user_id: autoria !== "todos" && autoria !== "meus" ? autoria : undefined,
        favoritos_apenas: somenteFavoritos,
      }),
  });

  const categorias = categoriasQuery.data ?? [];
  const autores = autoresQuery.data ?? [];

  // Ajuste doc — sem dropdown de ordenação: a ordem agora é definida
  // clicando nas colunas da tabela (crescente/decrescente), padrão por
  // data de última edição, decrescente.
  const itens = useMemo(() => {
    const base = itensQuery.data ?? [];
    const { coluna, dir } = ordenacao;
    const sorted = [...base].sort((a, b) => {
      let cmp = 0;
      switch (coluna) {
        case "titulo":
          cmp = a.titulo.localeCompare(b.titulo, "pt-BR");
          break;
        case "autor":
          cmp = a.owner_nome.localeCompare(b.owner_nome, "pt-BR");
          break;
        case "categorias":
          cmp = a.categorias
            .map((c) => c.nome)
            .join(", ")
            .localeCompare(b.categorias.map((c) => c.nome).join(", "), "pt-BR");
          break;
        case "updated_at":
          cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case "access_count":
          cmp = a.access_count - b.access_count;
          break;
        case "favorite_count":
          cmp = a.favorite_count - b.favorite_count;
          break;
        case "criados_a_partir_count":
          cmp = a.criados_a_partir_count - b.criados_a_partir_count;
          break;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [itensQuery.data, ordenacao]);

  const favoritar = useMutation({
    mutationFn: (itemId: string) => alternarFavoritoBiblioteca(itemId),
    onSuccess: (res, itemId) => {
      qc.setQueryData<BibliotecaItem[]>(
        ["biblioteca-itens", kind, categoriaIds, query, autoria, somenteFavoritos],
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

  const toggleCategoria = (id: string) => {
    setCategoriaIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const toggleOrdenacao = (coluna: ColunaOrdenacao) => {
    setOrdenacao((prev) =>
      prev.coluna === coluna
        ? { coluna, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { coluna, dir: coluna === "titulo" || coluna === "autor" || coluna === "categorias" ? "asc" : "desc" },
    );
  };

  // Ajuste doc — flexão de gênero conforme o tipo selecionado no motor de
  // busca ("Criadas por…" para cotas, "Criados por…" para atendimentos ou
  // quando ambos os tipos estão em exibição).
  const feminino = kind === "cota";
  const rotuloAutoria =
    autoria === "todos"
      ? feminino
        ? "Criadas por todos"
        : "Criados por todos"
      : autoria === "meus"
        ? feminino
          ? "Criadas por mim"
          : "Criados por mim"
        : (() => {
            const autor = autores.find((a) => a.user_id === autoria);
            const nome = autor?.nome ?? "usuário";
            return feminino ? `Criadas por ${nome}` : `Criados por ${nome}`;
          })();

  const TipoIcon = TIPO_META[kind].Icon;

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

      <div className="surface-panel mb-3 space-y-2.5 p-4">
        {/* Ajuste doc — primeira linha: só o motor de busca (maior espaço)
            e, ao lado, o filtro de Autoria e o botão de Favorito. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Filtrar por tipo: ${TIPO_META[kind].label}`}
                  title={`Filtrar por tipo: ${TIPO_META[kind].label}`}
                  className={cn(
                    "absolute left-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded transition",
                    kind === "todos"
                      ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                      : "bg-institutional/[0.12] text-institutional hover:bg-institutional/[0.18]",
                  )}
                >
                  <TipoIcon className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setKind("todos")}>
                  <Search className="mr-2 h-3.5 w-3.5" aria-hidden /> Todos os tipos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setKind("atendimento")}>
                  <FileText className="mr-2 h-3.5 w-3.5" aria-hidden /> Atendimentos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setKind("cota")}>
                  <ScrollText className="mr-2 h-3.5 w-3.5" aria-hidden /> Cotas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={TIPO_META[kind].placeholder}
              className="pl-9"
            />
          </div>

          <DropdownMenu onOpenChange={(v) => !v && setBuscaAutor("")}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px] font-normal">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {rotuloAutoria}
                <ChevronDown className="h-3 w-3 opacity-50" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="kanban-scroll max-h-72 w-56 overflow-y-auto">
              <DropdownMenuItem onSelect={() => setAutoria("todos")}>
                {feminino ? "Criadas por todos" : "Criados por todos"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAutoria("meus")}>
                {feminino ? "Criadas por mim" : "Criados por mim"}
              </DropdownMenuItem>
              {autores.length > 5 && (
                <div className="p-1.5">
                  <Input
                    autoFocus
                    value={buscaAutor}
                    onChange={(e) => setBuscaAutor(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Buscar usuário…"
                    className="h-7 bg-background text-xs"
                  />
                </div>
              )}
              {autores
                .filter((a) => a.user_id !== meuUserId)
                .filter((a) => a.nome.toLowerCase().includes(buscaAutor.trim().toLowerCase()))
                .map((a) => (
                  <DropdownMenuItem key={a.user_id} onSelect={() => setAutoria(a.user_id)}>
                    {a.nome}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant={somenteFavoritos ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => setSomenteFavoritos((v) => !v)}
          >
            <Star className={cn("h-3.5 w-3.5", somenteFavoritos && "fill-current")} aria-hidden />
            Favoritos
          </Button>
        </div>

        {/* Ajuste doc — seleção de categorias, múltiplas simultaneamente,
            no mesmo padrão do seletor usado na criação de cotas. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu onOpenChange={(v) => !v && setBuscaCategoria("")}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={categoriasQuery.isLoading || categorias.length === 0}
                className="h-7 gap-1.5 text-[11px] font-normal"
              >
                {categoriaIds.length === 0
                  ? "Categorias"
                  : `${categoriaIds.length} categoria${categoriaIds.length > 1 ? "s" : ""}`}
                <ChevronDown className="h-3 w-3 opacity-50" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="kanban-scroll max-h-72 w-64 overflow-y-auto">
              {categorias.length > 5 && (
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
              {categorias
                .filter((c) => c.nome.toLowerCase().includes(buscaCategoria.trim().toLowerCase()))
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={categoriaIds.includes(c.id)}
                    onCheckedChange={() => toggleCategoria(c.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.nome}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {categoriaIds.length > 0 &&
            categorias
              .filter((c) => categoriaIds.includes(c.id))
              .map((c) => (
                <Badge key={c.id} variant="secondary" className="gap-1 pr-1 text-[11px]">
                  {c.nome}
                  <button
                    type="button"
                    onClick={() => toggleCategoria(c.id)}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remover categoria ${c.nome}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
        </div>
      </div>

      {itensQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="surface-panel p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
        </div>
      ) : (
        <div className="surface-panel overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <ThOrdenavel coluna="titulo" ordenacao={ordenacao} onClick={toggleOrdenacao}>
                  Título
                </ThOrdenavel>
                <ThOrdenavel coluna="autor" ordenacao={ordenacao} onClick={toggleOrdenacao}>
                  Autor(a)
                </ThOrdenavel>
                <ThOrdenavel coluna="categorias" ordenacao={ordenacao} onClick={toggleOrdenacao}>
                  Categoria(s)
                </ThOrdenavel>
                <ThOrdenavel coluna="updated_at" ordenacao={ordenacao} onClick={toggleOrdenacao}>
                  Última edição
                </ThOrdenavel>
                <ThOrdenavel coluna="access_count" ordenacao={ordenacao} onClick={toggleOrdenacao} align="right">
                  Acessos
                </ThOrdenavel>
                <ThOrdenavel coluna="favorite_count" ordenacao={ordenacao} onClick={toggleOrdenacao} align="right">
                  Favoritações
                </ThOrdenavel>
                <ThOrdenavel
                  coluna="criados_a_partir_count"
                  ordenacao={ordenacao}
                  onClick={toggleOrdenacao}
                  align="right"
                >
                  Criados a partir de
                </ThOrdenavel>
                <th className="w-0 px-2 py-2" aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <BibliotecaLinha
                  key={item.id}
                  item={item}
                  podeEditar={item.owner_user_id === meuUserId}
                  onOpen={() => abrirItem(item)}
                  onEditar={() => handleEditarItem(item)}
                  onAdicionarEmPainel={() => setMoveTarget({ itemId: item.id, title: item.titulo })}
                  onFavoritar={() => favoritar.mutate(item.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
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

function ThOrdenavel({
  coluna,
  ordenacao,
  onClick,
  align = "left",
  children,
}: {
  coluna: ColunaOrdenacao;
  ordenacao: { coluna: ColunaOrdenacao; dir: "asc" | "desc" };
  onClick: (coluna: ColunaOrdenacao) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const ativo = ordenacao.coluna === coluna;
  const Icon = ativo ? (ordenacao.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={cn("px-3 py-2 font-semibold", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onClick(coluna)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "flex-row-reverse",
          ativo && "text-foreground",
        )}
      >
        {children}
        <Icon className={cn("h-3 w-3", !ativo && "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

function BibliotecaLinha({
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
  const isAtendimento = item.kind === "atendimento";
  const Icon = isAtendimento ? FileText : ScrollText;

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-border/60 last:border-0 transition hover:bg-muted/50"
    >
      <td className="max-w-[280px] px-3 py-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded",
              isAtendimento
                ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)]"
                : "bg-sidebar-accent text-institutional",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </div>
          <span className="truncate font-medium">{item.titulo}</span>
        </div>
      </td>
      <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">{item.owner_nome}</td>
      <td className="max-w-[220px] px-3 py-2 text-muted-foreground">
        {item.categorias.length === 0 ? (
          <span className="text-muted-foreground/60">Sem categoria</span>
        ) : (
          <span className="truncate">{item.categorias.map((c) => c.nome).join(", ")}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
        {formatDateShort(item.updated_at)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{item.access_count}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{item.favorite_count}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {item.criados_a_partir_count}
      </td>
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          <FavoritoEstatisticasTooltip itemId={item.id} kind={item.kind}>
            <button
              type="button"
              onClick={onFavoritar}
              aria-label={item.is_favorited ? "Desfavoritar" : "Favoritar"}
              className={cn(
                "rounded p-1 transition hover:bg-muted",
                item.is_favorited ? "text-warning" : "text-muted-foreground",
              )}
            >
              <Star className={cn("h-3.5 w-3.5", item.is_favorited && "fill-current")} aria-hidden />
            </button>
          </FavoritoEstatisticasTooltip>
          <button
            type="button"
            onClick={onAdicionarEmPainel}
            aria-label="Adicionar em painel"
            title="Adicionar em painel"
            className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <FolderInput className="h-3.5 w-3.5" aria-hidden />
          </button>
          {podeEditar && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Ações"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditar}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  {item.kind === "cota" ? "Editar cota" : "Editar atendimento"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </td>
    </tr>
  );
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
