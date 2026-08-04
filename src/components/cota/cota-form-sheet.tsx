import { useEffect, useRef, useState } from "react";
import { ChevronDown, Info, Loader2, Plus, Scale, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RichTextEditor, type RichTextValue } from "@/components/cota/rich-text-editor";
import {
  useCategoriasCota,
  useCriarCota,
  useAtualizarCota,
  mensagemErroCota,
} from "@/features/cota/hooks";
import type { CotaDetalhe, CotaLink } from "@/lib/reintegra-api";

type CotaFormMode =
  | { mode: "create" }
  | { mode: "edit"; itemId: string; detalhe: CotaDetalhe }
  // Ajuste doc (AJUSTE 10) — "Inspirar nova cota": cria uma cota NOVA
  // herdando texto e orientação de uma já existente, exceto título e
  // categoria(s), que começam em branco.
  | { mode: "inspire"; detalhe: CotaDetalhe };

const RESERVED_CATEGORY_NAME = "Sem categoria";

interface CotaFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: CotaFormMode | null;
  /** Chamado após criar/editar com sucesso. Em modo criação, recebe o item_id novo. */
  onCreated?: (itemId: string) => void;
  onSaved?: () => void;
}

/**
 * Camada lateral de criação/edição de Cota. Campos: título, texto rico
 * (negrito/itálico/sublinhado), categoria(s) — múltiplas. Autor é sempre
 * implícito (o Defensor autenticado); nunca é selecionável aqui.
 */
export function CotaFormSheet({
  open,
  onOpenChange,
  target,
  onCreated,
  onSaved,
}: CotaFormSheetProps) {
  const categoriasQuery = useCategoriasCota();
  const categoriasSelecionaveis = (categoriasQuery.data ?? []).filter(
    (c) => c.nome !== RESERVED_CATEGORY_NAME,
  );
  const criar = useCriarCota();
  const atualizar = useAtualizarCota();

  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState<RichTextValue>({ html: "", text: "" });
  const [orientacao, setOrientacao] = useState("");
  const [mostrarOrientacao, setMostrarOrientacao] = useState(false);
  const [orientacaoNivel, setOrientacaoNivel] = useState<"media" | "alta">("media");
  // Ajuste doc (AJUSTE 17) — links sugeridos (título + url).
  const [links, setLinks] = useState<CotaLink[]>([]);
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  // Ajuste doc (AJUSTE 20) — confirmação ao fechar com alterações não
  // salvas, mesmo padrão já usado no Atendimento.
  const [confirmClose, setConfirmClose] = useState(false);
  const initialSnapshotRef = useRef("");
  const [buscaCategoria, setBuscaCategoria] = useState("");

  const isEdit = target?.mode === "edit";
  const pending = criar.isPending || atualizar.isPending;
  // Ajuste doc (AJUSTE 10) — base de comparação para bloquear a criação
  // quando, no modo "inspire", nem o título nem o texto mudaram.
  const inspireBaseRef = useRef<{ titulo: string; textoHtml: string } | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    if (target.mode === "edit") {
      setTitulo(target.detalhe.titulo);
      const bj = target.detalhe.bodyJson as { html?: string } | null;
      setTexto({ html: bj?.html ?? "", text: target.detalhe.bodyText });
      setOrientacao(target.detalhe.orientacao ?? "");
      setMostrarOrientacao(!!target.detalhe.orientacao);
      setOrientacaoNivel(target.detalhe.orientacaoNivel ?? "media");
      setCategoriaIds(target.detalhe.categorias.map((c) => c.id));
      setLinks(target.detalhe.links ?? []);
      inspireBaseRef.current = null;
      initialSnapshotRef.current = JSON.stringify({
        titulo: target.detalhe.titulo,
        textoHtml: bj?.html ?? "",
        orientacao: target.detalhe.orientacao ?? "",
        orientacaoNivel: target.detalhe.orientacaoNivel ?? "media",
        categoriaIds: target.detalhe.categorias.map((c) => c.id),
        links: target.detalhe.links ?? [],
      });
    } else if (target.mode === "inspire") {
      const bj = target.detalhe.bodyJson as { html?: string } | null;
      const html = bj?.html ?? "";
      setTitulo("");
      setTexto({ html, text: target.detalhe.bodyText });
      setOrientacao(target.detalhe.orientacao ?? "");
      setMostrarOrientacao(!!target.detalhe.orientacao);
      setOrientacaoNivel(target.detalhe.orientacaoNivel ?? "media");
      setCategoriaIds([]);
      setLinks(target.detalhe.links ?? []);
      inspireBaseRef.current = { titulo: target.detalhe.titulo, textoHtml: html };
      initialSnapshotRef.current = JSON.stringify({
        titulo: "",
        textoHtml: html,
        orientacao: target.detalhe.orientacao ?? "",
        orientacaoNivel: target.detalhe.orientacaoNivel ?? "media",
        categoriaIds: [],
        links: target.detalhe.links ?? [],
      });
    } else {
      setTitulo("");
      setTexto({ html: "", text: "" });
      setOrientacao("");
      setMostrarOrientacao(false);
      setOrientacaoNivel("media");
      setCategoriaIds([]);
      setLinks([]);
      inspireBaseRef.current = null;
      initialSnapshotRef.current = JSON.stringify({
        titulo: "",
        textoHtml: "",
        orientacao: "",
        orientacaoNivel: "media",
        categoriaIds: [],
        links: [],
      });
    }
  }, [open, target]);

  // Ajuste doc (AJUSTE 20) — confirmação ao fechar com alterações não
  // salvas.
  const formEstaSujo = () =>
    JSON.stringify({
      titulo,
      textoHtml: texto.html,
      orientacao,
      orientacaoNivel,
      categoriaIds,
      links,
    }) !== initialSnapshotRef.current;

  const handleOpenChange = (v: boolean) => {
    if (!v && formEstaSujo()) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(v);
  };

  const toggleCategoria = (id: string) => {
    setCategoriaIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleSubmit = () => {
    if (!titulo.trim()) {
      toast.error("Informe um título para a cota.");
      return;
    }
    if (!texto.text.trim()) {
      toast.error("Informe o texto da cota.");
      return;
    }
    if (categoriaIds.length === 0) {
      toast.error("Selecione ao menos uma categoria.");
      return;
    }
    if (
      inspireBaseRef.current &&
      titulo.trim() === inspireBaseRef.current.titulo &&
      texto.html === inspireBaseRef.current.textoHtml
    ) {
      toast.error("Altere ao menos o título ou o texto em relação à cota usada como referência.");
      return;
    }
    if (target?.mode === "edit") {
      atualizar.mutate(
        {
          itemId: target.itemId,
          expectedVersion: target.detalhe.optimisticVersion,
          titulo: titulo.trim(),
          bodyJson: { html: texto.html },
          bodyText: texto.text,
          categoryIds: categoriaIds,
          orientacao: orientacao.trim(),
          orientacaoNivel,
          links: links.filter((l) => l.titulo.trim() && l.url.trim()),
        },
        {
          onSuccess: () => {
            toast.success("Cota atualizada");
            onOpenChange(false);
            onSaved?.();
          },
          onError: (e) => toast.error(mensagemErroCota(e, "Falha ao salvar a cota")),
        },
      );
    } else {
      criar.mutate(
        {
          titulo: titulo.trim(),
          bodyJson: { html: texto.html },
          bodyText: texto.text,
          categoryIds: categoriaIds,
          orientacao: orientacao.trim(),
          orientacaoNivel,
          links: links.filter((l) => l.titulo.trim() && l.url.trim()),
          origemItemId: target?.mode === "inspire" ? target.detalhe.id : undefined,
        },
        {
          onSuccess: (result) => {
            toast.success("Cota criada");
            onOpenChange(false);
            onCreated?.(result.item_id);
          },
          onError: (e) => toast.error(mensagemErroCota(e, "Falha ao criar a cota")),
        },
      );
    }
  };

  return (
    <>
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="kanban-scroll flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Scale className="h-4 w-4 text-institutional" />
            {isEdit ? "Editar cota" : "Nova cota"}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-5 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="cota-titulo" className="text-xs">
              Título
            </Label>
            <Input
              id="cota-titulo"
              className="bg-background text-xs"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Bloqueio de valores para aquisição de medicamento"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Texto</Label>
            <RichTextEditor html={texto.html} onChange={setTexto} minHeight="260px" />
          </div>

          {mostrarOrientacao ? (
            <div
              className={cn(
                "space-y-1.5 rounded-md border p-2.5",
                orientacaoNivel === "alta"
                  ? "border-critical/40 bg-critical/[0.06]"
                  : "border-warning/40 bg-warning/[0.06]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="cota-orientacao" className="text-xs">
                  Orientação
                </Label>
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setMostrarOrientacao(false);
                    setOrientacao("");
                    setOrientacaoNivel("media");
                  }}
                >
                  Remover
                </button>
              </div>
              {/* Ajuste doc (AJUSTE 24) — negrito/sublinhado na
                  orientação, botões à esquerda do seletor de Importância
                  (mesma barra, via trailingToolbar). */}
              <RichTextEditor
                html={orientacao}
                onChange={(v) => setOrientacao(v.html)}
                tools={["bold", "italic", "underline", "strike"]}
                placeholder="Ex.: Indique a quantia necessária de acordo com os orçamentos apresentados pelo(a) assistido(a)."
                minHeight="60px"
                className="bg-background text-xs"
                trailingToolbar={
                  <Select
                    value={orientacaoNivel}
                    onValueChange={(v) => setOrientacaoNivel(v as "media" | "alta")}
                  >
                    <SelectTrigger className="h-6 w-[155px] text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="media">Relevância: Média</SelectItem>
                      <SelectItem value="alta">Relevância: Alta</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-fit gap-1.5 text-xs"
              onClick={() => setMostrarOrientacao(true)}
            >
              <Info className="h-3.5 w-3.5" aria-hidden /> Adicionar orientação
            </Button>
          )}

          {/* Ajuste doc (AJUSTE 17) — links sugeridos (título + url). */}
          <div className="space-y-1.5">
            <Label className="text-xs">Links sugeridos (opcional)</Label>
            <div className="space-y-1.5">
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={link.titulo}
                    onChange={(e) =>
                      setLinks((prev) => prev.map((l, li) => (li === i ? { ...l, titulo: e.target.value } : l)))
                    }
                    placeholder="Título (ex.: Tabela de valores INSS)"
                    className="h-7 flex-1 bg-background text-xs"
                  />
                  <Input
                    value={link.url}
                    onChange={(e) =>
                      setLinks((prev) => prev.map((l, li) => (li === i ? { ...l, url: e.target.value } : l)))
                    }
                    placeholder="https://…"
                    className="h-7 flex-1 bg-background text-xs"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Remover link"
                    onClick={() => setLinks((prev) => prev.filter((_, li) => li !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-[11px]"
                onClick={() => setLinks((prev) => [...prev, { titulo: "", url: "" }])}
              >
                <Plus className="h-3 w-3" aria-hidden /> Adicionar link
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Categoria(s)</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={categoriasQuery.isLoading || categoriasSelecionaveis.length === 0}
                  className="w-full justify-between bg-background text-xs font-normal"
                >
                  <span className="text-muted-foreground">
                    {categoriasQuery.isLoading
                      ? "Carregando categorias…"
                      : categoriasSelecionaveis.length === 0
                        ? "Nenhuma categoria disponível"
                        : categoriaIds.length === 0
                          ? "Selecione categoria(s)"
                          : `${categoriaIds.length} categoria${categoriaIds.length > 1 ? "s" : ""} selecionada${categoriaIds.length > 1 ? "s" : ""}`}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="kanban-scroll max-h-72 w-[--radix-dropdown-menu-trigger-width] overflow-y-auto"
                onCloseAutoFocus={() => setBuscaCategoria("")}
              >
                {categoriasSelecionaveis.length > 5 && (
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
                {categoriasSelecionaveis
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
            {categoriasSelecionaveis.length === 0 && !categoriasQuery.isLoading && (
              <p className="text-[11px] text-muted-foreground">
                Nenhuma categoria disponível ainda. Peça ao Admin Técnico para criar uma categoria
                antes de cadastrar cotas.
              </p>
            )}
            {categoriaIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {categoriasSelecionaveis
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
            <p className="text-[11px] text-muted-foreground">
              Selecione ao menos uma categoria. É obrigatório.
            </p>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !titulo.trim() || !texto.text.trim() || categoriaIds.length === 0}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {isEdit ? "Salvar alterações" : "Criar cota"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza que deseja fechar?</AlertDialogTitle>
          <AlertDialogDescription>
            Ao fechar, as alterações feitas nesta {isEdit ? "cota" : "nova cota"} serão perdidas.
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
