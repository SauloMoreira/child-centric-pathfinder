import { useEffect, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor, type RichTextValue } from "@/components/cota/rich-text-editor";
import {
  useCategoriasCota,
  useCriarCota,
  useAtualizarCota,
  mensagemErroCota,
} from "@/features/cota/hooks";
import type { CotaDetalhe } from "@/lib/reintegra-api";

type CotaFormMode = { mode: "create" } | { mode: "edit"; itemId: string; detalhe: CotaDetalhe };

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
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);

  const isEdit = target?.mode === "edit";
  const pending = criar.isPending || atualizar.isPending;

  useEffect(() => {
    if (!open || !target) return;
    if (target.mode === "edit") {
      setTitulo(target.detalhe.titulo);
      const bj = target.detalhe.bodyJson as { html?: string } | null;
      setTexto({ html: bj?.html ?? "", text: target.detalhe.bodyText });
      setCategoriaIds(target.detalhe.categorias.map((c) => c.id));
    } else {
      setTitulo("");
      setTexto({ html: "", text: "" });
      setCategoriaIds([]);
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
    if (target?.mode === "edit") {
      atualizar.mutate(
        {
          itemId: target.itemId,
          expectedVersion: target.detalhe.optimisticVersion,
          titulo: titulo.trim(),
          bodyJson: { html: texto.html },
          bodyText: texto.text,
          categoryIds: categoriaIds,
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
          <SheetTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-institutional" />
            {isEdit ? "Editar cota" : "Nova cota"}
          </SheetTitle>
          <SheetDescription>
            Modelo de texto reutilizável para sua equipe copiar em minutas de processos.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="cota-titulo">Título</Label>
            <Input
              id="cota-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Cota de vista — pedido de guarda"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Texto</Label>
            <RichTextEditor html={texto.html} onChange={setTexto} minHeight="260px" />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria(s)</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-input p-2">
              {categoriasQuery.isLoading ? (
                <p className="p-2 text-xs text-muted-foreground">Carregando categorias…</p>
              ) : categoriasSelecionaveis.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  Nenhuma categoria disponível ainda. Peça ao Admin Técnico para criar uma categoria
                  antes de cadastrar cotas.
                </p>
              ) : (
                categoriasSelecionaveis.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={categoriaIds.includes(c.id)}
                      onCheckedChange={() => toggleCategoria(c.id)}
                    />
                    {c.nome}
                  </label>
                ))
              )}
            </div>
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
