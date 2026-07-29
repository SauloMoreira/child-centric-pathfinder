import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  useCategoriasBiblioteca,
  useCriarAtendimento,
  useAtualizarAtendimento,
  mensagemErroAtendimento,
} from "@/features/atendimento/hooks";
import { FIELD_TYPE_META, FIELD_TYPE_ORDER, fieldHasOptions, novoCampo } from "@/components/atendimento/form-field-types";
import type { AtendimentoDetalhe, AtendimentoFieldType, AtendimentoFormField } from "@/lib/reintegra-api";

type AtendimentoFormMode =
  | { mode: "create" }
  | { mode: "edit"; itemId: string; detalhe: AtendimentoDetalhe };

const RESERVED_CATEGORY_NAME = "Sem categoria";

interface AtendimentoFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AtendimentoFormMode | null;
  onCreated?: (itemId: string) => void;
  onSaved?: () => void;
}

/**
 * Camada lateral de criação/edição de Atendimento: título, descrição
 * (opcional), categoria(s) — múltiplas — e o construtor de campos do
 * formulário (tipos de campo, obrigatoriedade, opções). Sem lógica
 * condicional/branching nesta fase. Autor é sempre implícito (o Defensor
 * autenticado).
 */
export function AtendimentoFormSheet({
  open,
  onOpenChange,
  target,
  onCreated,
  onSaved,
}: AtendimentoFormSheetProps) {
  const categoriasQuery = useCategoriasBiblioteca();
  const categoriasSelecionaveis = (categoriasQuery.data ?? []).filter(
    (c) => c.nome !== RESERVED_CATEGORY_NAME,
  );
  const criar = useCriarAtendimento();
  const atualizar = useAtualizarAtendimento();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  const [campos, setCampos] = useState<AtendimentoFormField[]>([]);

  const isEdit = target?.mode === "edit";
  const pending = criar.isPending || atualizar.isPending;

  useEffect(() => {
    if (!open || !target) return;
    if (target.mode === "edit") {
      setTitulo(target.detalhe.titulo);
      setDescricao(target.detalhe.descricao ?? "");
      setCategoriaIds(target.detalhe.categorias.map((c) => c.id));
      setCampos(target.detalhe.formSchema);
    } else {
      setTitulo("");
      setDescricao("");
      setCategoriaIds([]);
      setCampos([]);
    }
  }, [open, target]);

  const toggleCategoria = (id: string) => {
    setCategoriaIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const addCampo = () => setCampos((prev) => [...prev, novoCampo()]);
  const removeCampo = (id: string) => setCampos((prev) => prev.filter((f) => f.id !== id));
  const moveCampo = (index: number, dir: -1 | 1) => {
    setCampos((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const updateCampo = (id: string, patch: Partial<AtendimentoFormField>) => {
    setCampos((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };
  const changeCampoType = (id: string, type: AtendimentoFieldType) => {
    setCampos((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, type, options: fieldHasOptions(type) ? (f.options?.length ? f.options : ["Opção 1"]) : null }
          : f,
      ),
    );
  };

  const camposValidos = campos.every(
    (f) => f.label.trim().length > 0 && (!fieldHasOptions(f.type) || (f.options ?? []).some((o) => o.trim())),
  );

  const handleSubmit = () => {
    if (!titulo.trim()) {
      toast.error("Informe um título para o atendimento.");
      return;
    }
    if (categoriaIds.length === 0) {
      toast.error("Selecione ao menos uma categoria.");
      return;
    }
    if (!camposValidos) {
      toast.error("Todo campo do formulário precisa de um rótulo (e ao menos uma opção, quando aplicável).");
      return;
    }

    const schema = campos.map((f) => ({
      ...f,
      label: f.label.trim(),
      options: fieldHasOptions(f.type) ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : null,
    }));

    if (target?.mode === "edit") {
      atualizar.mutate(
        {
          itemId: target.itemId,
          expectedVersion: target.detalhe.optimisticVersion,
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          formSchema: schema,
          categoryIds: categoriaIds,
        },
        {
          onSuccess: () => {
            toast.success("Atendimento atualizado");
            onOpenChange(false);
            onSaved?.();
          },
          onError: (e) => toast.error(mensagemErroAtendimento(e, "Falha ao salvar o atendimento")),
        },
      );
    } else {
      criar.mutate(
        {
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          formSchema: schema,
          categoryIds: categoriaIds,
        },
        {
          onSuccess: (result) => {
            toast.success("Atendimento criado");
            onOpenChange(false);
            onCreated?.(result.item_id);
          },
          onError: (e) => toast.error(mensagemErroAtendimento(e, "Falha ao criar o atendimento")),
        },
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-institutional" />
            {isEdit ? "Editar atendimento" : "Novo atendimento"}
          </SheetTitle>
          <SheetDescription>
            Modelo de formulário reutilizável para orientar sua equipe no atendimento presencial.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="atendimento-titulo">Título</Label>
            <Input
              id="atendimento-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Atendimento — Pedido de alimentos"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="atendimento-descricao">Descrição (opcional)</Label>
            <Textarea
              id="atendimento-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Contexto para a equipe sobre quando usar este atendimento…"
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria(s)</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={categoriasQuery.isLoading || categoriasSelecionaveis.length === 0}
                  className="w-full justify-between font-normal"
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

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label>Campos do formulário</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addCampo}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar campo
              </Button>
            </div>
            {campos.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Nenhum campo ainda. Use "Adicionar campo" para montar o formulário.
              </p>
            ) : (
              <div className="space-y-3">
                {campos.map((campo, index) => (
                  <FieldEditor
                    key={campo.id}
                    campo={campo}
                    index={index}
                    total={campos.length}
                    onChange={(patch) => updateCampo(campo.id, patch)}
                    onChangeType={(type) => changeCampoType(campo.id, type)}
                    onRemove={() => removeCampo(campo.id)}
                    onMove={(dir) => moveCampo(index, dir)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !titulo.trim() || categoriaIds.length === 0}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {isEdit ? "Salvar alterações" : "Criar atendimento"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FieldEditor({
  campo,
  index,
  total,
  onChange,
  onChangeType,
  onRemove,
  onMove,
}: {
  campo: AtendimentoFormField;
  index: number;
  total: number;
  onChange: (patch: Partial<AtendimentoFormField>) => void;
  onChangeType: (type: AtendimentoFieldType) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const options = campo.options ?? [];

  const setOption = (i: number, value: string) => {
    const next = [...options];
    next[i] = value;
    onChange({ options: next });
  };
  const addOption = () => onChange({ options: [...options, `Opção ${options.length + 1}`] });
  const removeOption = (i: number) => onChange({ options: options.filter((_, oi) => oi !== i) });

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-start gap-2">
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Mover campo para cima"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Mover campo para baixo"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={campo.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Rótulo do campo"
              className="min-w-[160px] flex-1 text-sm"
            />
            <Select value={campo.type} onValueChange={(v) => onChangeType(v as AtendimentoFieldType)}>
              <SelectTrigger className="w-[200px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPE_ORDER.map((t) => (
                  <SelectItem key={t} value={t}>
                    {FIELD_TYPE_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id={`obrigatorio-${campo.id}`}
              checked={campo.required}
              onCheckedChange={(v) => onChange({ required: v })}
            />
            <Label htmlFor={`obrigatorio-${campo.id}`} className="text-xs font-normal">
              Obrigatório
            </Label>
          </div>

          {fieldHasOptions(campo.type) && (
            <div className="space-y-1.5 rounded-md bg-muted/30 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Opções
              </p>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    className="h-7 text-xs"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    aria-label="Remover opção"
                    disabled={options.length <= 1}
                    onClick={() => removeOption(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-[11px]" onClick={addOption}>
                <Plus className="h-3 w-3" aria-hidden /> Adicionar opção
              </Button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
          aria-label="Remover campo"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
