import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
  Info,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  SeparatorHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  camposElegiveisParaCalculo,
  camposElegiveisParaCondicao,
  FIELD_TYPE_META,
  FIELD_TYPE_ORDER,
  fieldHasOptions,
  isChoiceField,
  normalizarCondicao,
  novaOrientacao,
  novaSecao,
  novoCampo,
  novoChecklist,
  removerReferenciaDaCondicao,
  REPEAT_SUBFIELD_TYPES,
  validarCondicaoParaSubmissao,
} from "@/components/atendimento/form-field-types";
import type {
  AtendimentoCalc,
  AtendimentoConditionRule,
  AtendimentoDetalhe,
  AtendimentoFieldCondition,
  AtendimentoFieldType,
  AtendimentoFormField,
} from "@/lib/reintegra-api";

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
 * Caixa sobreposta (Dialog centralizado, largo) de criação/edição de
 * Atendimento: título, descrição (opcional), categoria(s) — múltiplas —
 * e o construtor de campos do formulário (tipos de campo, obrigatoriedade,
 * opções). A criação/edição de Atendimento usa Dialog (não Sheet lateral,
 * como a Cota) porque demanda mais dedicação, tempo e espaço na tela.
 * Fase 2: lógica condicional — cada campo/seção pode ter uma condição
 * "mostrar apenas se" referenciando um campo de escolha (radio/checkbox/
 * dropdown) anterior na lista, e seções inteiras podem ser puladas assim.
 * Autor é sempre implícito (o Defensor autenticado).
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
  // Ajuste doc — confirmação ao fechar com alterações não salvas: guarda uma
  // "foto" do estado logo após abrir/carregar, para comparar na hora de
  // fechar (sem precisar marcar "sujo" em cada setter individualmente).
  const [confirmClose, setConfirmClose] = useState(false);
  const initialSnapshotRef = useRef("");

  const isEdit = target?.mode === "edit";
  const pending = criar.isPending || atualizar.isPending;

  useEffect(() => {
    if (!open || !target) return;
    if (target.mode === "edit") {
      setTitulo(target.detalhe.titulo);
      setDescricao(target.detalhe.descricao ?? "");
      setCategoriaIds(target.detalhe.categorias.map((c) => c.id));
      setCampos(target.detalhe.formSchema);
      initialSnapshotRef.current = JSON.stringify({
        titulo: target.detalhe.titulo,
        descricao: target.detalhe.descricao ?? "",
        categoriaIds: target.detalhe.categorias.map((c) => c.id),
        campos: target.detalhe.formSchema,
      });
    } else {
      setTitulo("");
      setDescricao("");
      setCategoriaIds([]);
      setCampos([]);
      initialSnapshotRef.current = JSON.stringify({ titulo: "", descricao: "", categoriaIds: [], campos: [] });
    }
  }, [open, target]);

  const formEstaSujo = () =>
    JSON.stringify({ titulo, descricao, categoriaIds, campos }) !== initialSnapshotRef.current;

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

  const addCampo = () => setCampos((prev) => [...prev, novoCampo()]);
  const addSecao = () => setCampos((prev) => [...prev, novaSecao()]);
  const addOrientacao = () => setCampos((prev) => [...prev, novaOrientacao()]);
  const addChecklist = () => setCampos((prev) => [...prev, novoChecklist()]);

  // Ajuste doc — reordenar campos por arrastar e soltar, além das setas.
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEndCampos = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setCampos((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === active.id);
      const newIndex = prev.findIndex((f) => f.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };
  const removeCampo = (id: string) =>
    setCampos((prev) =>
      prev
        .filter((f) => f.id !== id)
        // Remove regras de condição e referências de cálculo que apontavam
        // para o campo excluído — evita referência pendente.
        .map((f) => ({
          ...f,
          visibleIf: removerReferenciaDaCondicao(f.visibleIf, id),
          requiredIf: removerReferenciaDaCondicao(f.requiredIf, id),
          calc: f.calc ? { ...f.calc, fieldIds: f.calc.fieldIds.filter((fid) => fid !== id) } : f.calc,
        })),
    );
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
      prev.map((f) => {
        if (f.id === id) {
          return {
            ...f,
            type,
            options: fieldHasOptions(type)
              ? f.options?.length
                ? f.options
                : ["Opção 1"]
              : type === "matrix"
                ? f.options?.length
                  ? f.options
                  : ["Coluna 1", "Coluna 2"]
                : null,
            allowOther: fieldHasOptions(type) ? f.allowOther : false,
            matrixRows: type === "matrix" ? (f.matrixRows?.length ? f.matrixRows : ["Linha 1"]) : null,
            tableColumns:
              type === "table_fillable" ? (f.tableColumns?.length ? f.tableColumns : ["Coluna 1"]) : null,
            repeatFields: type === "repeat_group" ? (f.repeatFields ?? []) : null,
            calc: type === "calculated" ? (f.calc ?? { kind: "sum", fieldIds: [], outputCurrency: false }) : null,
          };
        }
        // Se o campo deixou de ser de escolha, condições que dependiam
        // dele deixam de fazer sentido.
        if (!isChoiceField(type)) {
          return {
            ...f,
            visibleIf: removerReferenciaDaCondicao(f.visibleIf, id),
            requiredIf: removerReferenciaDaCondicao(f.requiredIf, id),
          };
        }
        return f;
      }),
    );
  };

  const campoValido = (f: AtendimentoFormField): boolean => {
    // Checklist tem título opcional — quem precisa de conteúdo obrigatório
    // são os itens da lista, validados abaixo.
    if (f.type !== "checklist" && !f.label.trim()) return false;
    if (fieldHasOptions(f.type) && !(f.options ?? []).some((o) => o.trim())) return false;
    if (f.type === "matrix") {
      if (!(f.matrixRows ?? []).some((r) => r.trim())) return false;
      if (!(f.options ?? []).some((o) => o.trim())) return false;
    }
    if (f.type === "table_fillable" && !(f.tableColumns ?? []).some((c) => c.trim())) return false;
    if (f.type === "repeat_group" && !(f.repeatFields ?? []).some((sf) => sf.label.trim())) return false;
    if (f.type === "calculated" && (f.calc?.fieldIds.length ?? 0) === 0) return false;
    if (f.type === "checklist" && !(f.checklistItems ?? []).some((i) => i.trim())) return false;
    return true;
  };
  const camposValidos = campos.every(campoValido);

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

    const schema = campos.map((f, i) => {
      // Descarta regras de condição que ficaram órfãs (campo referenciado
      // removido, deixou de ser de escolha, ou a opção referenciada foi
      // apagada) — melhor cair para "sem condição" do que salvar uma regra
      // que nunca vai bater com nada. Mesma ideia para referências de
      // campo calculado.
      const anteriores = campos.slice(0, i);
      return {
        ...f,
        label: f.label.trim(),
        options:
          fieldHasOptions(f.type) || f.type === "matrix"
            ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
            : null,
        matrixRows: f.type === "matrix" ? (f.matrixRows ?? []).map((r) => r.trim()).filter(Boolean) : null,
        tableColumns:
          f.type === "table_fillable" ? (f.tableColumns ?? []).map((c) => c.trim()).filter(Boolean) : null,
        repeatFields:
          f.type === "repeat_group"
            ? (f.repeatFields ?? [])
                .filter((sf) => sf.label.trim())
                .map((sf) => ({
                  ...sf,
                  label: sf.label.trim(),
                  options: fieldHasOptions(sf.type) ? (sf.options ?? []).map((o) => o.trim()).filter(Boolean) : null,
                }))
            : null,
        calc:
          f.type === "calculated" && f.calc
            ? { ...f.calc, fieldIds: f.calc.fieldIds.filter((fid) => campos.some((c) => c.id === fid)) }
            : null,
        checklistItems:
          f.type === "checklist" ? (f.checklistItems ?? []).map((i) => i.trim()).filter(Boolean) : null,
        visibleIf: validarCondicaoParaSubmissao(f.visibleIf, anteriores),
        requiredIf:
          f.type === "section" || f.type === "orientation" || f.type === "checklist"
            ? null
            : validarCondicaoParaSubmissao(f.requiredIf, anteriores),
      };
    }).map((f) => (f.type === "calculated" && (f.calc?.fieldIds.length ?? 0) === 0 ? { ...f, calc: null } : f));

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
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-institutional" />
            {isEdit ? "Editar atendimento" : "Novo atendimento"}
          </DialogTitle>
          <DialogDescription>
            Modelo de formulário reutilizável para orientar sua equipe no atendimento presencial.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 flex-1 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="atendimento-titulo">Título</Label>
            <Input
              id="atendimento-titulo"
              className="bg-surface text-xs"
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
              className="resize-none bg-surface text-xs"
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
                  className="w-full justify-between bg-surface font-normal text-xs"
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
            <div className="flex items-center justify-between gap-2">
              <Label>Campos do formulário</Label>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addCampo}>
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar pergunta
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addSecao}>
                  <SeparatorHorizontal className="h-3.5 w-3.5" aria-hidden /> Adicionar seção
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addOrientacao}>
                  <Info className="h-3.5 w-3.5" aria-hidden /> Adicionar orientação
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addChecklist}>
                  <ListChecks className="h-3.5 w-3.5" aria-hidden /> Adicionar checklist
                </Button>
              </div>
            </div>
            {campos.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Nenhum campo ainda. Use "Adicionar pergunta" para montar o formulário.
              </p>
            ) : (
              <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCampos}>
                <SortableContext items={campos.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {campos.map((campo, index) => (
                      <FieldEditor
                        key={campo.id}
                        campo={campo}
                        campos={campos}
                        index={index}
                        total={campos.length}
                        onChange={(patch) => updateCampo(campo.id, patch)}
                        onChangeType={(type) => changeCampoType(campo.id, type)}
                        onRemove={() => removeCampo(campo.id)}
                        onMove={(dir) => moveCampo(index, dir)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <DialogFooter className="mt-6 shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !titulo.trim() || categoriaIds.length === 0}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {isEdit ? "Salvar alterações" : "Criar atendimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza que deseja fechar?</AlertDialogTitle>
          <AlertDialogDescription>
            Ao fechar, as alterações feitas neste {isEdit ? "atendimento" : "novo atendimento"} serão perdidas.
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

/** Exportado para reaproveitar na edição inline das perguntas geradas pelo
 *  Atendimento IA (atendimento-ia-sheet.tsx) — mesmo editor de campo usado
 *  no builder normal, incluindo drag handle (precisa estar dentro de um
 *  DndContext/SortableContext com os ids dos campos). */
export function FieldEditor({
  campo,
  campos,
  index,
  total,
  onChange,
  onChangeType,
  onRemove,
  onMove,
}: {
  campo: AtendimentoFormField;
  campos: AtendimentoFormField[];
  index: number;
  total: number;
  onChange: (patch: Partial<AtendimentoFormField>) => void;
  onChangeType: (type: AtendimentoFieldType) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const isSection = campo.type === "section";
  const isOrientation = campo.type === "orientation";
  const isChecklist = campo.type === "checklist";
  const options = campo.options ?? [];
  const checklistItems = campo.checklistItems ?? [];

  const sortable = useSortable({ id: campo.id });
  const sortableStyle = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  const setOption = (i: number, value: string) => {
    const next = [...options];
    next[i] = value;
    onChange({ options: next });
  };
  const addOption = () => onChange({ options: [...options, `Opção ${options.length + 1}`] });
  const removeOption = (i: number) => onChange({ options: options.filter((_, oi) => oi !== i) });

  const setChecklistItem = (i: number, value: string) => {
    const next = [...checklistItems];
    next[i] = value;
    onChange({ checklistItems: next });
  };
  const addChecklistItem = () =>
    onChange({ checklistItems: [...checklistItems, `Item ${checklistItems.length + 1}`] });
  const removeChecklistItem = (i: number) =>
    onChange({ checklistItems: checklistItems.filter((_, ci) => ci !== i) });

  const moveButtons = (
    <div className="flex shrink-0 flex-col items-center gap-0.5">
      <button
        type="button"
        className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Arrastar para reordenar"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
        aria-label="Mover para cima"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
        aria-label="Mover para baixo"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const removeButton = (
    <button
      type="button"
      className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
      aria-label={isSection ? "Remover seção" : "Remover campo"}
      onClick={onRemove}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );

  if (isSection) {
    return (
      <div
        ref={sortable.setNodeRef}
        style={sortableStyle}
        className="rounded-md border border-dashed border-institutional/40 bg-institutional/[0.03] p-3"
      >
        <div className="flex items-start gap-2">
          {moveButtons}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <SeparatorHorizontal className="h-3.5 w-3.5 shrink-0 text-institutional" aria-hidden />
              <Input
                value={campo.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="Título da seção"
                className="bg-surface text-xs font-medium"
              />
            </div>
            <ConditionEditor
              titulo="Mostrar apenas se…"
              condicao={campo.visibleIf}
              elegiveis={camposElegiveisParaCondicao(campos, index)}
              onChange={(visibleIf) => onChange({ visibleIf })}
            />
          </div>
          {removeButton}
        </div>
      </div>
    );
  }

  if (isOrientation) {
    return (
      <div
        ref={sortable.setNodeRef}
        style={sortableStyle}
        className="rounded-md border border-dashed border-institutional/40 bg-institutional/[0.03] p-3"
      >
        <div className="flex items-start gap-2">
          {moveButtons}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 shrink-0 text-institutional" aria-hidden />
              <p className="text-xs font-medium text-institutional">Orientação</p>
            </div>
            <Textarea
              value={campo.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Texto de orientação para quem preenche o formulário…"
              rows={2}
              className="resize-none bg-surface text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Aparece em destaque no formulário. Não entra no resumo por IA nem nos PDFs gerados.
            </p>
          </div>
          {removeButton}
        </div>
      </div>
    );
  }

  if (isChecklist) {
    return (
      <div ref={sortable.setNodeRef} style={sortableStyle} className="rounded-md border border-border p-3">
        <div className="flex items-start gap-2">
          {moveButtons}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-3.5 w-3.5 shrink-0 text-institutional" aria-hidden />
              <Input
                value={campo.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="Título do checklist (opcional)"
                className="bg-surface text-xs"
              />
            </div>
            <div className="space-y-1.5 rounded-md bg-muted/30 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Itens</p>
              {checklistItems.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={item}
                    onChange={(e) => setChecklistItem(i, e.target.value)}
                    className="h-7 bg-surface text-xs"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    aria-label="Remover item"
                    disabled={checklistItems.length <= 1}
                    onClick={() => removeChecklistItem(i)}
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
                onClick={addChecklistItem}
              >
                <Plus className="h-3 w-3" aria-hidden /> Adicionar item
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id={`obrigatorio-${campo.id}`}
                checked={campo.required}
                onCheckedChange={(v) => onChange({ required: v })}
              />
              <Label htmlFor={`obrigatorio-${campo.id}`} className="text-xs font-normal">
                Obrigatório (exige todos os itens marcados)
              </Label>
            </div>
            <ConditionEditor
              titulo="Mostrar apenas se…"
              condicao={campo.visibleIf}
              elegiveis={camposElegiveisParaCondicao(campos, index)}
              onChange={(visibleIf) => onChange({ visibleIf })}
            />
          </div>
          {removeButton}
        </div>
      </div>
    );
  }

  return (
    <div ref={sortable.setNodeRef} style={sortableStyle} className="rounded-md border border-border p-3">
      <div className="flex items-start gap-2">
        {moveButtons}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={campo.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Rótulo do campo"
              className="min-w-[160px] flex-1 bg-surface text-xs"
            />
            <Select value={campo.type} onValueChange={(v) => onChangeType(v as AtendimentoFieldType)}>
              <SelectTrigger className="w-[200px] bg-surface text-xs">
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

          {campo.type !== "calculated" && (
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
          )}

          {campo.type === "matrix" && (
            <div className="space-y-2 rounded-md bg-muted/30 p-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Linhas</p>
                {(campo.matrixRows ?? []).map((linha, i) => (
                  <div key={i} className="flex items-center gap-1.5 pt-1">
                    <Input
                      value={linha}
                      onChange={(e) => {
                        const next = [...(campo.matrixRows ?? [])];
                        next[i] = e.target.value;
                        onChange({ matrixRows: next });
                      }}
                      className="h-7 bg-surface text-xs"
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      aria-label="Remover linha"
                      disabled={(campo.matrixRows ?? []).length <= 1}
                      onClick={() =>
                        onChange({ matrixRows: (campo.matrixRows ?? []).filter((_, ri) => ri !== i) })
                      }
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
                  onClick={() =>
                    onChange({
                      matrixRows: [...(campo.matrixRows ?? []), `Linha ${(campo.matrixRows ?? []).length + 1}`],
                    })
                  }
                >
                  <Plus className="h-3 w-3" aria-hidden /> Adicionar linha
                </Button>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Colunas</p>
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5 pt-1">
                    <Input value={opt} onChange={(e) => setOption(i, e.target.value)} className="h-7 bg-surface text-xs" />
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      aria-label="Remover coluna"
                      disabled={options.length <= 1}
                      onClick={() => removeOption(i)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-[11px]" onClick={addOption}>
                  <Plus className="h-3 w-3" aria-hidden /> Adicionar coluna
                </Button>
              </div>
            </div>
          )}

          {campo.type === "table_fillable" && (
            <div className="space-y-1.5 rounded-md bg-muted/30 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Colunas da tabela
              </p>
              {(campo.tableColumns ?? []).map((col, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={col}
                    onChange={(e) => {
                      const next = [...(campo.tableColumns ?? [])];
                      next[i] = e.target.value;
                      onChange({ tableColumns: next });
                    }}
                    className="h-7 bg-surface text-xs"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    aria-label="Remover coluna"
                    disabled={(campo.tableColumns ?? []).length <= 1}
                    onClick={() =>
                      onChange({ tableColumns: (campo.tableColumns ?? []).filter((_, ci) => ci !== i) })
                    }
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
                onClick={() =>
                  onChange({
                    tableColumns: [...(campo.tableColumns ?? []), `Coluna ${(campo.tableColumns ?? []).length + 1}`],
                  })
                }
              >
                <Plus className="h-3 w-3" aria-hidden /> Adicionar coluna
              </Button>
            </div>
          )}

          {campo.type === "repeat_group" && (
            <div className="space-y-2 rounded-md bg-muted/30 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Campos do grupo (repetidos a cada item)
              </p>
              {(campo.repeatFields ?? []).map((sf, i) => (
                <RepeatSubfieldEditor
                  key={sf.id}
                  subcampo={sf}
                  onChange={(patch) => {
                    const next = [...(campo.repeatFields ?? [])];
                    next[i] = { ...next[i], ...patch };
                    onChange({ repeatFields: next });
                  }}
                  onRemove={() =>
                    onChange({ repeatFields: (campo.repeatFields ?? []).filter((_, si) => si !== i) })
                  }
                />
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-[11px]"
                onClick={() =>
                  onChange({ repeatFields: [...(campo.repeatFields ?? []), novoCampo("text_short")] })
                }
              >
                <Plus className="h-3 w-3" aria-hidden /> Adicionar campo ao grupo
              </Button>
            </div>
          )}

          {campo.type === "calculated" && (
            <CalcEditor campo={campo} campos={campos} index={index} onChange={onChange} />
          )}

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
                    className="h-7 bg-surface text-xs"
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
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id={`outro-${campo.id}`}
                  checked={!!campo.allowOther}
                  onCheckedChange={(v) => onChange({ allowOther: v })}
                />
                <Label htmlFor={`outro-${campo.id}`} className="text-[11px] font-normal">
                  Permitir opção "Outro" (texto livre)
                </Label>
              </div>
            </div>
          )}

          <ConditionEditor
            titulo="Mostrar apenas se…"
            condicao={campo.visibleIf}
            elegiveis={camposElegiveisParaCondicao(campos, index)}
            onChange={(visibleIf) => onChange({ visibleIf })}
          />
          {campo.type !== "calculated" && (
            <ConditionEditor
              titulo="Obrigatório apenas se…"
              condicao={campo.requiredIf}
              elegiveis={camposElegiveisParaCondicao(campos, index)}
              onChange={(requiredIf) => onChange({ requiredIf })}
            />
          )}
        </div>

        {removeButton}
      </div>
    </div>
  );
}

/** Fase 7 — editor de um sub-campo dentro de um grupo repetível: versão
 *  enxuta do editor de campo comum (sem condições, sem "Outro", sem
 *  reordenação — mantém o aninhamento simples por design). */
function RepeatSubfieldEditor({
  subcampo,
  onChange,
  onRemove,
}: {
  subcampo: AtendimentoFormField;
  onChange: (patch: Partial<AtendimentoFormField>) => void;
  onRemove: () => void;
}) {
  const options = subcampo.options ?? [];
  const setOption = (i: number, value: string) => {
    const next = [...options];
    next[i] = value;
    onChange({ options: next });
  };
  const addOption = () => onChange({ options: [...options, `Opção ${options.length + 1}`] });
  const removeOption = (i: number) => onChange({ options: options.filter((_, oi) => oi !== i) });

  return (
    <div className="space-y-1.5 rounded border border-border bg-background p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          value={subcampo.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Rótulo do sub-campo"
          className="h-7 min-w-[120px] flex-1 text-xs"
        />
        <Select
          value={subcampo.type}
          onValueChange={(v) => {
            const type = v as AtendimentoFieldType;
            onChange({
              type,
              options: fieldHasOptions(type) ? (options.length ? options : ["Opção 1"]) : null,
            });
          }}
        >
          <SelectTrigger className="h-7 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPEAT_SUBFIELD_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {FIELD_TYPE_META[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
          aria-label="Remover campo do grupo"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={`req-sub-${subcampo.id}`}
          checked={subcampo.required}
          onCheckedChange={(v) => onChange({ required: v })}
        />
        <Label htmlFor={`req-sub-${subcampo.id}`} className="text-[11px] font-normal">
          Obrigatório
        </Label>
      </div>
      {fieldHasOptions(subcampo.type) && (
        <div className="space-y-1 pl-1">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input value={opt} onChange={(e) => setOption(i, e.target.value)} className="h-6 bg-surface text-[11px]" />
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-30"
                aria-label="Remover opção"
                disabled={options.length <= 1}
                onClick={() => removeOption(i)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="h-5 gap-1 text-[10px]" onClick={addOption}>
            <Plus className="h-2.5 w-2.5" aria-hidden /> Adicionar opção
          </Button>
        </div>
      )}
    </div>
  );
}

/** Fase 7 — editor de campo calculado: escolhe soma ou concatenação,
 *  quais campos anteriores usar como fonte, e opções de formatação. */
function CalcEditor({
  campo,
  campos,
  index,
  onChange,
}: {
  campo: AtendimentoFormField;
  campos: AtendimentoFormField[];
  index: number;
  onChange: (patch: Partial<AtendimentoFormField>) => void;
}) {
  const calc: AtendimentoCalc = campo.calc ?? { kind: "sum", fieldIds: [], outputCurrency: false };
  const elegiveis = camposElegiveisParaCalculo(campos, index, calc.kind);

  const toggleField = (fieldId: string) => {
    const next = calc.fieldIds.includes(fieldId)
      ? calc.fieldIds.filter((id) => id !== fieldId)
      : [...calc.fieldIds, fieldId];
    onChange({ calc: { ...calc, fieldIds: next } });
  };

  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tipo de cálculo</p>
        <Select
          value={calc.kind}
          onValueChange={(v) => onChange({ calc: { kind: v as "sum" | "concat", fieldIds: [] } })}
        >
          <SelectTrigger className="h-7 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sum">Soma</SelectItem>
            <SelectItem value="concat">Concatenar texto</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {elegiveis.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">
          {calc.kind === "sum"
            ? "Adicione um campo Número ou Valor (R$) antes deste para somar."
            : "Adicione algum campo antes deste para concatenar."}
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Campos a usar</p>
          {elegiveis.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={calc.fieldIds.includes(c.id)} onChange={() => toggleField(c.id)} />
              {c.label || "(sem rótulo)"}
            </label>
          ))}
        </div>
      )}
      {calc.kind === "concat" && (
        <div className="space-y-1">
          <Label className="text-[11px] font-normal text-muted-foreground">Separador</Label>
          <Input
            value={calc.separator ?? ", "}
            onChange={(e) => onChange({ calc: { ...calc, separator: e.target.value } })}
            className="h-7 w-[120px] bg-surface text-xs"
          />
        </div>
      )}
      {calc.kind === "sum" && (
        <div className="flex items-center gap-2">
          <Switch
            id={`calc-currency-${campo.id}`}
            checked={!!calc.outputCurrency}
            onCheckedChange={(v) => onChange({ calc: { ...calc, outputCurrency: v } })}
          />
          <Label htmlFor={`calc-currency-${campo.id}`} className="text-[11px] font-normal">
            Exibir resultado como moeda (R$)
          </Label>
        </div>
      )}
    </div>
  );
}

/**
 * Editor de condição (Fase 2: visibilidade; Fase 4: robustecido com
 * múltiplas regras E/OU, reutilizado tanto para "mostrar apenas se…"
 * quanto para "obrigatório apenas se…"). Só oferece campos de escolha
 * (radio/checkbox/dropdown) que aparecem ANTES deste na lista, o que
 * evita referências circulares ou "para frente" por construção.
 */
function ConditionEditor({
  titulo,
  condicao,
  elegiveis,
  onChange,
}: {
  titulo: string;
  condicao: AtendimentoFieldCondition | null | undefined;
  elegiveis: AtendimentoFormField[];
  onChange: (condicao: AtendimentoFieldCondition | null) => void;
}) {
  const norm = normalizarCondicao(condicao);
  const hasCondition = !!norm;
  const rules = norm?.rules ?? [];
  const operator = norm?.operator ?? "AND";
  const controleId = `condicao-${titulo}-${elegiveis[0]?.id ?? "x"}`;

  if (elegiveis.length === 0 && !hasCondition) {
    return null;
  }

  const referenciado = (fieldId: string) => elegiveis.find((c) => c.id === fieldId);

  const setRule = (i: number, patch: Partial<AtendimentoConditionRule>) => {
    onChange({ operator, rules: rules.map((r, ri) => (ri === i ? { ...r, ...patch } : r)) });
  };
  const addRule = () => {
    const first = elegiveis[0];
    onChange({ operator, rules: [...rules, { fieldId: first.id, value: (first.options ?? [])[0] ?? "" }] });
  };
  const removeRule = (i: number) => {
    const next = rules.filter((_, ri) => ri !== i);
    onChange(next.length > 0 ? { operator, rules: next } : null);
  };

  return (
    <div className="space-y-1.5 rounded-md bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Switch
          id={controleId}
          checked={hasCondition}
          disabled={elegiveis.length === 0}
          onCheckedChange={(v) => {
            if (v && elegiveis.length > 0) {
              const first = elegiveis[0];
              onChange({ operator: "AND", rules: [{ fieldId: first.id, value: (first.options ?? [])[0] ?? "" }] });
            } else {
              onChange(null);
            }
          }}
        />
        <Label htmlFor={controleId} className="text-xs font-normal">
          {titulo}
        </Label>
      </div>
      {hasCondition && (
        <div className="space-y-1.5 pl-1">
          {rules.length > 1 && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>Combinar regras com</span>
              <Select value={operator} onValueChange={(v) => onChange({ operator: v as "AND" | "OR", rules })}>
                <SelectTrigger className="h-6 w-[68px] text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">E</SelectItem>
                  <SelectItem value="OR">OU</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {rules.map((rule, i) => {
            const ref = referenciado(rule.fieldId);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select
                  value={rule.fieldId}
                  onValueChange={(fieldId) => {
                    const r = referenciado(fieldId);
                    setRule(i, { fieldId, value: (r?.options ?? [])[0] ?? "" });
                  }}
                >
                  <SelectTrigger className="h-7 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {elegiveis.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label || "(sem rótulo)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">for</span>
                <Select value={rule.value} onValueChange={(value) => setRule(i, { value })}>
                  <SelectTrigger className="h-7 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(ref?.options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rules.length > 1 && (
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Remover regra"
                    onClick={() => removeRule(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-[11px]" onClick={addRule}>
            <Plus className="h-3 w-3" aria-hidden /> Adicionar condição
          </Button>
        </div>
      )}
    </div>
  );
}
