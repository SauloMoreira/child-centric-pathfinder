import { useEffect, useRef, useState } from "react";
import { ChevronDown, Info, Loader2, Scale, X } from "lucide-react";
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
import type { CotaDetalhe } from "@/lib/reintegra-api";

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
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);

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
      inspireBaseRef.current = null;
    } else if (target.mode === "inspire") {
      const bj = target.detalhe.bodyJson as { html?: string } | null;
      const html = bj?.html ?? "";
      setTitulo("");
      setTexto({ html, text: target.detalhe.bodyText });
      setOrientacao(target.detalhe.orientacao ?? "");
      setMostrarOrientacao(!!target.detalhe.orientacao);
      setOrientacaoNivel(target.detalhe.orientacaoNivel ?? "media");
      setCategoriaIds([]);
      inspireBaseRef.current = { titulo: target.detalhe.titulo, textoHtml: html };
    } else {
      setTitulo("");
      setTexto({ html: "", text: "" });
      setOrientacao("");
      setMostrarOrientacao(false);
      setOrientacaoNivel("media");
      setCategoriaIds([]);
      inspireBaseRef.current = null;
    }
  }, [open, target]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
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
                <div className="flex items-center gap-2">
                  <Select
                    value={orientacaoNivel}
                    onValueChange={(v) => setOrientacaoNivel(v as "media" | "alta")}
                  >
                    <SelectTrigger className="h-6 w-[135px] text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="media">Importância: Média</SelectItem>
                      <SelectItem value="alta">Importância: Alta</SelectItem>
                    </SelectContent>
                  </Select>
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
              </div>
              <Textarea
                id="cota-orientacao"
                value={orientacao}
                onChange={(e) => setOrientacao(e.target.value)}
                placeholder="Ex.: Indique a quantia necessária de acordo com os orçamentos apresentados pelo(a) assistido(a)."
                rows={3}
                className="resize-none bg-background text-xs"
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
                className="max-h-64 w-[--radix-dropdown-menu-trigger-width] overflow-y-auto"
              >
                {categoriasSelecionaveis.map((c) => (
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
  );
}
