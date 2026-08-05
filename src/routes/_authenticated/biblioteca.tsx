import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  Download,
  FileText,
  FolderInput,
  Layers,
  LayoutPanelTop,
  Loader2,
  MessageSquare,
  MoreVertical,
  Pencil,
  Search,
  Star,
  User,
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
import {
  useWorkArea,
  usePublicPanelSearch,
  useImportPanel,
  panelErrorFromUnknown,
  type PublicPanelSearchResult,
} from "@/features/work-area";
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
  // Ajuste doc (PÁGINA BIBLIOTECA) — "Acessos" foi substituído por
  // "Inserções em painéis" (access_count deixou de ser exibido em
  // qualquer lugar do sistema).
  | "panel_insert_count"
  | "favorite_count"
  | "criados_a_partir_count";

// Ajuste doc (PÁGINA BIBLIOTECA) — o botão de tipo dentro do motor de busca
// assume o ícone e o rótulo respectivos de Cota/Atendimento; "todos" usa a
// lupa neutra padrão.
// Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — "No botão do motor de busca,
// onde há Atendimento e Cotas, haverá também a opção Painéis".
type TipoBusca = "todos" | ContentKind | "painel";
const TIPO_META: Record<TipoBusca, { label: string; Icon: typeof Search; placeholder: string }> = {
  // Ajuste doc (PÁGINA BIBLIOTECA) — "Todos os tipos" deixou de ser uma
  // opção selecionável no menu (padrão passou a ser "Atendimentos"), mas o
  // placeholder segue existindo para o caso residual de kind==="todos".
  todos: {
    label: "Todos os tipos",
    Icon: Search,
    placeholder: "Buscar atendimentos, cotas ou painéis…",
  },
  // Ajuste doc (PÁGINA BIBLIOTECA) — ícone de Atendimentos no motor de
  // busca passa a ser o mesmo do card de Atendimento na Área de Trabalho
  // (balão preenchido), em vez do FileText genérico.
  atendimento: { label: "Atendimentos", Icon: MessageSquare, placeholder: "Buscar atendimentos…" },
  // Ajuste doc (AJUSTE 36) — ícone de Cota = ícone de Atendimento (mesmo
  // símbolo exibido ao arrastar um card de Atendimento na Área de Trabalho).
  cota: { label: "Cotas", Icon: FileText, placeholder: "Buscar cotas…" },
  painel: { label: "Painéis", Icon: LayoutPanelTop, placeholder: "Buscar painéis…" },
};

/** Ajuste doc (PÁGINA BIBLIOTECA) — badge de ícone branco sobre fundo verde
 *  escuro para identificar o tipo do item na tabela (Atendimento, Cota ou
 *  Painel), reaproveitando os mesmos símbolos exibidos nos cards/abas da
 *  Área de Trabalho: balão preenchido para Atendimento, documento para
 *  Cota e camadas para Painel (ícone padrão das abas de Painel). */
function TabelaKindIcon({
  kind,
  className,
}: {
  kind: "atendimento" | "cota" | "painel";
  className?: string;
}) {
  const Icon = kind === "atendimento" ? MessageSquare : kind === "painel" ? Layers : FileText;
  return (
    <div
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded bg-institutional text-institutional-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" fill={kind === "atendimento" ? "currentColor" : "none"} aria-hidden />
    </div>
  );
}

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

  // Ajuste doc (PÁGINA BIBLIOTECA) — "Todos os tipos" deixou de ser opção;
  // o padrão de exibição passa a ser "Atendimentos".
  const [kind, setKind] = useState<TipoBusca>("atendimento");
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  const [buscaCategoria, setBuscaCategoria] = useState("");
  const [query, setQuery] = useState("");
  // Ajuste doc (PÁGINA BIBLIOTECA) — padrão do filtro de autoria passa a
  // ser "Criados por mim".
  const [autoria, setAutoria] = useState<Autoria>("meus");
  const [buscaAutor, setBuscaAutor] = useState("");
  // Ajuste doc (PÁGINA BIBLIOTECA) — a opção "Criados por…" some a busca
  // interna de um Defensor específico só depois de clicada, em vez de
  // sempre visível dentro do menu de autoria.
  const [porNomeOpen, setPorNomeOpen] = useState(false);
  const [somenteFavoritos, setSomenteFavoritos] = useState(false);
  const [ordenacao, setOrdenacao] = useState<{ coluna: ColunaOrdenacao; dir: "asc" | "desc" }>({
    coluna: "updated_at",
    dir: "desc",
  });

  // Ajuste doc (PÁGINA BIBLIOTECA) — exibição limitada a 50 itens por vez,
  // carregando mais 50 conforme o usuário rola a tela (infinite scroll).
  const PAGE_SIZE = 50;
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [kind, categoriaIds, query, autoria, somenteFavoritos]);
  const scrollSentinelRef = useRef<HTMLDivElement | null>(null);

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
    queryKey: ["biblioteca-itens", kind, categoriaIds, query, autoria, somenteFavoritos, visibleLimit],
    enabled: kind !== "painel",
    queryFn: () =>
      listarBiblioteca({
        kind: kind === "todos" || kind === "painel" ? undefined : kind,
        categoria_ids: categoriaIds.length > 0 ? categoriaIds : undefined,
        query: query.trim() || undefined,
        apenas_meus: autoria === "meus",
        owner_user_id: autoria !== "todos" && autoria !== "meus" ? autoria : undefined,
        favoritos_apenas: somenteFavoritos,
        limit: visibleLimit,
      }),
  });

  // Ajuste doc (PÁGINA BIBLIOTECA) — carrega mais 50 itens quando o
  // sentinela no fim da tabela entra na tela, contanto que a última leva
  // tenha vindo cheia (sinal de que pode haver mais).
  const podeCarregarMais = (itensQuery.data?.length ?? 0) >= visibleLimit;
  useEffect(() => {
    const el = scrollSentinelRef.current;
    if (!el || kind === "painel" || !podeCarregarMais) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !itensQuery.isFetching) {
          setVisibleLimit((v) => v + PAGE_SIZE);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [kind, podeCarregarMais, itensQuery.isFetching]);

  // Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — aba "Painéis" do motor de
  // busca: lista Painéis públicos de todos os Defensores, com importação
  // direta para a própria Área de Trabalho.
  const panelSearchQuery = usePublicPanelSearch(query.trim(), kind === "painel");
  const importPanel = useImportPanel(defensorId ?? "");
  const [importingId, setImportingId] = useState<string | null>(null);

  const handleImportPanel = async (panel: PublicPanelSearchResult) => {
    setImportingId(panel.panelId);
    try {
      await importPanel.mutateAsync({ panelId: panel.panelId });
      toast.success(`“${panel.name}” importado para sua Área de Trabalho`);
      qc.invalidateQueries({ queryKey: ["public-panel-search"] });
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    } finally {
      setImportingId(null);
    }
  };

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
        case "panel_insert_count":
          cmp = a.panel_insert_count - b.panel_insert_count;
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
        ["biblioteca-itens", kind, categoriaIds, query, autoria, somenteFavoritos, visibleLimit],
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
  // Ajuste doc (PÁGINA BIBLIOTECA) — ícone de pessoa única para "Criados
  // por mim" e "Criados por (nome específico)"; ícone de grupo só para
  // "Criados por todos".
  const AutoriaIcon = autoria === "todos" ? Users : User;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BookOpen className="h-6 w-6 text-institutional" />
          Biblioteca Ágora
        </h1>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Atendimentos, cotas e painéis.
        </p>
      </header>

      <div className="surface-panel mb-3 space-y-2.5 p-4">
        {/* Ajuste doc (PÁGINA BIBLIOTECA) — primeira linha: motor de busca
            (maior espaço) e, ao lado, na ordem Autoria → Categorias →
            Favoritos. As categorias selecionadas continuam aparecendo na
            linha de baixo. */}
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
                {/* Ajuste doc — "Todos os tipos" deixou de ser uma opção
                    do menu; o padrão de exibição é "Atendimentos". */}
                <DropdownMenuItem onClick={() => setKind("atendimento")}>
                  <MessageSquare className="mr-2 h-3.5 w-3.5" aria-hidden /> Atendimentos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setKind("cota")}>
                  <FileText className="mr-2 h-3.5 w-3.5" aria-hidden /> Cotas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setKind("painel")}>
                  <LayoutPanelTop className="mr-2 h-3.5 w-3.5" aria-hidden /> Painéis
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

          {kind !== "painel" && (
            <DropdownMenu
              onOpenChange={(v) => {
                if (!v) {
                  setBuscaAutor("");
                  setPorNomeOpen(false);
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px] font-normal">
                  <AutoriaIcon className="h-3.5 w-3.5" aria-hidden />
                  {rotuloAutoria}
                  <ChevronDown className="h-3 w-3 opacity-50" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="kanban-scroll max-h-72 w-56 overflow-y-auto">
                {!porNomeOpen ? (
                  <>
                    {/* Ajuste doc — "Criados por mim" é a primeira opção e
                        o padrão do filtro. */}
                    <DropdownMenuItem onSelect={() => setAutoria("meus")}>
                      <User className="mr-2 h-3.5 w-3.5" aria-hidden />
                      {feminino ? "Criadas por mim" : "Criados por mim"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setAutoria("todos")}>
                      <Users className="mr-2 h-3.5 w-3.5" aria-hidden />
                      {feminino ? "Criadas por todos" : "Criados por todos"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setPorNomeOpen(true);
                      }}
                    >
                      <User className="mr-2 h-3.5 w-3.5" aria-hidden />
                      {feminino ? "Criadas por…" : "Criados por…"}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <div className="p-1.5">
                      <Input
                        autoFocus
                        value={buscaAutor}
                        onChange={(e) => setBuscaAutor(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Buscar Defensor Público…"
                        className="h-7 bg-background text-xs"
                      />
                    </div>
                    {autores
                      .filter((a) => a.user_id !== meuUserId)
                      .filter((a) => a.nome.toLowerCase().includes(buscaAutor.trim().toLowerCase()))
                      .map((a) => (
                        <DropdownMenuItem key={a.user_id} onSelect={() => setAutoria(a.user_id)}>
                          <User className="mr-2 h-3.5 w-3.5" aria-hidden />
                          {a.nome}
                        </DropdownMenuItem>
                      ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Ajuste doc — botão de categorias reposicionado para a
              primeira linha, entre Autoria e Favoritos. */}
          {kind !== "painel" && (
            <DropdownMenu onOpenChange={(v) => !v && setBuscaCategoria("")}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={categoriasQuery.isLoading || categorias.length === 0}
                  className="h-7 gap-1.5 text-[11px] font-normal"
                >
                  {categoriaIds.length === 0
                    ? "Todas as categorias"
                    : `${categoriaIds.length} categoria${categoriaIds.length > 1 ? "s" : ""}`}
                  <ChevronDown className="h-3 w-3 opacity-50" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="kanban-scroll max-h-72 w-64 overflow-y-auto">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setCategoriaIds([]);
                  }}
                >
                  Todas as categorias
                </DropdownMenuItem>
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
          )}

          {kind !== "painel" && (
            <Button
              variant={somenteFavoritos ? "default" : "outline"}
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={somenteFavoritos ? "Mostrando só favoritos" : "Favoritos"}
              title="Favoritos"
              onClick={() => setSomenteFavoritos((v) => !v)}
            >
              <Star className={cn("h-3.5 w-3.5", somenteFavoritos && "fill-current")} aria-hidden />
            </Button>
          )}
        </div>

        {/* Ajuste doc — categorias selecionadas continuam na linha de
            baixo, agora sem o botão do filtro (que subiu para a primeira
            linha). */}
        {kind !== "painel" && categoriaIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {categorias
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
        )}
      </div>

      {kind === "painel" ? (
        panelSearchQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (panelSearchQuery.data ?? []).length === 0 ? (
          <div className="surface-panel p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum Painel público encontrado.</p>
          </div>
        ) : (
          <div className="surface-panel overflow-x-auto p-0">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Painel</th>
                  <th className="px-3 py-2 font-semibold">Gestor</th>
                  <th className="px-3 py-2 text-right font-semibold">Membros</th>
                  <th className="w-0 px-2 py-2" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {(panelSearchQuery.data ?? []).map((panel) => (
                  <tr
                    key={panel.panelId}
                    className="border-b border-border/60 last:border-0 transition hover:bg-muted/50"
                  >
                    <td className="max-w-[320px] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <TabelaKindIcon kind="painel" />
                        <div className="min-w-0">
                          <p className="truncate font-medium" title={panel.name}>
                            {panel.name}
                          </p>
                          {panel.description && (
                            <p
                              className="truncate text-[11px] text-muted-foreground"
                              title={panel.description}
                            >
                              {panel.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td
                      className="max-w-[160px] truncate px-3 py-2 text-muted-foreground"
                      title={panel.ownerDisplayName}
                    >
                      {panel.ownerDisplayName}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {panel.memberCount}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end">
                        {panel.isOwn ? (
                          <Badge variant="outline" className="text-[10px]">
                            Seu Painel
                          </Badge>
                        ) : panel.alreadyImported ? (
                          <Badge variant="outline" className="text-[10px]">
                            Já importado
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-[11px]"
                            disabled={importingId === panel.panelId}
                            onClick={() => handleImportPanel(panel)}
                          >
                            {importingId === panel.panelId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Download className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Importar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : itensQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="surface-panel p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
        </div>
      ) : (
        <div className="surface-panel overflow-x-auto p-0">
          {/* Ajuste doc — table-fixed + colgroup: sem isso, o max-w/truncate
              das células não tem efeito real (a tabela em layout automático
              cresce pelo conteúdo), o que fazia a coluna de Categoria(s)
              se sobrepor à coluna seguinte em vez de truncar com reticências. */}
          <table className="w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
            </colgroup>
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
                {/* Ajuste doc — "Acessos" substituído por "Inserções em
                    painéis"; a contagem de acessos não é mais exibida. */}
                <ThOrdenavel
                  coluna="panel_insert_count"
                  ordenacao={ordenacao}
                  onClick={toggleOrdenacao}
                  align="right"
                >
                  Inserções em painéis
                </ThOrdenavel>
                <ThOrdenavel coluna="favorite_count" ordenacao={ordenacao} onClick={toggleOrdenacao} align="right">
                  Favoritos
                </ThOrdenavel>
                <ThOrdenavel
                  coluna="criados_a_partir_count"
                  ordenacao={ordenacao}
                  onClick={toggleOrdenacao}
                  align="right"
                >
                  Criados a partir de
                </ThOrdenavel>
                <th className="px-2 py-2" aria-label="Ações" />
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
          {/* Ajuste doc — sentinela de rolagem infinita: exibe os 50
              primeiros e carrega mais 50 conforme o usuário rola a tela. */}
          {podeCarregarMais && <div ref={scrollSentinelRef} aria-hidden className="h-1 w-full" />}
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
  const categoriasTexto = item.categorias.map((c) => c.nome).join(", ");

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-border/60 last:border-0 transition hover:bg-muted/50"
    >
      <td className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <TabelaKindIcon kind={item.kind} />
          <span className="min-w-0 flex-1 truncate font-medium" title={item.titulo}>
            {item.titulo}
          </span>
        </div>
      </td>
      <td className="truncate px-3 py-2 text-muted-foreground" title={item.owner_nome}>
        {item.owner_nome}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {item.categorias.length === 0 ? (
          <span className="text-muted-foreground/60">Sem categoria</span>
        ) : (
          <span className="block truncate" title={categoriasTexto}>
            {categoriasTexto}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
        {formatDateShort(item.updated_at)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {item.panel_insert_count}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{item.favorite_count}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {item.criados_a_partir_count}
      </td>
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        {/* Ajuste doc — quando não há menu de 3 pontinhos (item de outro
            autor, sem permissão de edição), os botões de Favoritar e
            Adicionar em painel mantêm o alinhamento à esquerda em vez de
            colar no canto direito da coluna. */}
        <div className={cn("flex items-center gap-0.5", podeEditar ? "justify-end" : "justify-start")}>
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
