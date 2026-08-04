import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Info,
  ListChecks,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { InsertFieldHere } from "@/components/atendimento/atendimento-form-sheet";
import { sanitizeCotaHtml } from "@/components/cota/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AtendimentoFormField } from "@/lib/reintegra-api";
import {
  agruparEmEtapas,
  calcularValor,
  campoObrigatorioEfetivo,
  campoVisivel,
  construirValorOutro,
  ehValorOutro,
  formatarMoedaExibicao,
  textoDoValorOutro,
  type AtendimentoFormValues,
} from "@/components/atendimento/form-field-types";

type CampoValor = AtendimentoFormValues[string];

interface FormRendererProps {
  fields: AtendimentoFormField[];
  values: AtendimentoFormValues;
  onChange: (fieldId: string, value: CampoValor) => void;
  disabled?: boolean;
  /** Ajuste doc — Atendimento IA: quando fornecido, cada pergunta ganha um
   *  botão discreto de excluir ao passar o mouse (lateral esquerda),
   *  visível também durante o PREENCHIMENTO (não só na edição). Opcional e
   *  sem efeito nos Atendimentos normais, que não passam esta prop. Só se
   *  aplica ao modo sem etapas (formulários de página única). */
  onRemoveField?: (fieldId: string) => void;
  /** Ajuste doc — idem, para inserir um campo entre perguntas ao passar o
   *  mouse no espaço entre elas, mesma funcionalidade da página de edição. */
  onInsertFieldAt?: (index: number, campo: AtendimentoFormField) => void;
  /** Ajuste doc — Atendimento IA: todas as perguntas de texto exibem um
   *  campo compacto por padrão, com botão de expandir/comprimir no hover.
   *  Não afeta o Atendimento normal (prop não passada lá). */
  respostaCompacta?: boolean;
  /** Ajuste doc — Atendimento IA: botão na pilha de ícones à esquerda da
   *  caixa da pergunta para renomear o rótulo rapidamente, sem entrar em
   *  "Editar". */
  onRenameField?: (fieldId: string, novoLabel: string) => void;
  /** Ajuste doc (AJUSTE 6) — as justificativas já vêm prontas em
   *  field.justificativa (geradas em lote, junto com o formulário) — o
   *  botão na pilha de ícones só alterna VISIBILIDADE, nunca gera nada
   *  sob demanda. */
  justificativasVisiveis?: Record<string, boolean>;
  onToggleJustificativaVisivel?: (fieldId: string) => void;
  justificativasMinimizadas?: Record<string, boolean>;
  onToggleJustificativaMinimizada?: (fieldId: string) => void;
  /** Ajuste doc (AJUSTE 14) — arrastar a caixa da pergunta (só pelo
   *  ícone dedicado) para trocar de posição durante o preenchimento. */
  onReorderFields?: (activeId: string, overId: string) => void;
}

/**
 * Renderiza o formulário de um Atendimento para preenchimento. Estado
 * sempre em memória (values/onChange controlados pelo componente pai) —
 * nunca é enviado ao backend nem persiste entre sessões.
 *
 * Fase 2 — lógica condicional: campos e seções com `visibleIf` só aparecem
 * quando a condição é satisfeita pelas respostas já dadas. Uma seção cuja
 * condição não é satisfeita é pulada inteira (ela e os campos que a
 * seguem, até a próxima seção).
 *
 * Fase 5 — navegação por etapas: quando o formulário tem 2+ seções, o
 * preenchimento passa a ser uma seção por vez (Anterior/Próximo) em vez
 * de página única. A validação de obrigatórios continua centralizada em
 * "Concluir" (não bloqueia o avanço entre etapas).
 */
export function FormRenderer({
  fields,
  values,
  onChange,
  disabled,
  onRemoveField,
  onInsertFieldAt,
  respostaCompacta,
  onRenameField,
  justificativasVisiveis,
  onToggleJustificativaVisivel,
  justificativasMinimizadas,
  onToggleJustificativaMinimizada,
  onReorderFields,
}: FormRendererProps) {
  const usaEtapas = fields.filter((f) => f.type === "section").length >= 2;
  const visiveis = fields.filter((f) => campoVisivel(f, values));
  const etapas = usaEtapas ? agruparEmEtapas(visiveis) : null;
  const [etapaAtual, setEtapaAtual] = useState(0);

  // Reinicia a etapa ao trocar de atendimento (nova identidade de `fields`).
  useEffect(() => {
    setEtapaAtual(0);
  }, [fields]);

  // Ajuste doc (AJUSTE 6) — o ícone de editar rótulo passou a viver na
  // pilha de ícones à esquerda da caixa (junto com orientação e
  // excluir), fora do texto do rótulo em si — precisa ser controlado
  // daqui (fora do CampoRenderizado) para poder ficar nessa pilha.
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [rotuloTemp, setRotuloTemp] = useState("");
  const confirmarRenomeacao = (field: AtendimentoFormField) => {
    const novo = rotuloTemp.trim();
    if (novo && onRenameField) onRenameField(field.id, novo);
    setRenomeandoId(null);
  };

  // Ajuste doc (AJUSTE 14) — arrastar caixas de pergunta durante o
  // preenchimento (só quando onReorderFields é fornecido).
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEndFields = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !onReorderFields) return;
    onReorderFields(String(active.id), String(over.id));
  };

  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Este atendimento ainda não tem campos de formulário definidos.
      </p>
    );
  }

  if (etapas) {
    const indice = Math.min(etapaAtual, Math.max(etapas.length - 1, 0));
    const etapa = etapas[indice];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-institutional">
            {etapa?.titulo ?? "Início"}
          </p>
          <p className="shrink-0 text-[11px] text-muted-foreground">
            Etapa {indice + 1} de {etapas.length}
          </p>
        </div>
        <div className="space-y-4">
          {(etapa?.campos ?? []).map((field) =>
            field.type === "orientation" ? (
              <OrientacaoBox key={field.id} texto={field.label} nivel={field.nivelImportancia} />
            ) : field.type === "checklist" ? (
              <ChecklistField
                key={field.id}
                field={field}
                value={values[field.id]}
                values={values}
                onChange={onChange}
                disabled={disabled}
              />
            ) : (
              <CampoRenderizado
                key={field.id}
                field={field}
                value={values[field.id]}
                values={values}
                allFields={fields}
                onChange={onChange}
                disabled={disabled}
                respostaCompacta={respostaCompacta}
              />
            ),
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={indice === 0}
            onClick={() => setEtapaAtual((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={indice >= etapas.length - 1}
            onClick={() => setEtapaAtual((i) => Math.min(etapas.length - 1, i + 1))}
          >
            Próximo <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  const listaCampos = (
    <div className="space-y-4">
      {onInsertFieldAt && visiveis.length > 0 && (
        <InsertFieldHere
          onInsert={(novo) => onInsertFieldAt(0, novo)}
          opcoes={respostaCompacta ? ["pergunta"] : undefined}
        />
      )}
      {visiveis.map((field, i) => {
        const conteudo =
          field.type === "section" ? (
            <div className={i === 0 ? "space-y-1.5" : "space-y-1.5 pt-2"}>
              {i > 0 && <Separator />}
              <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-institutional">
                {field.label || "(seção sem título)"}
              </p>
            </div>
          ) : field.type === "orientation" ? (
            <OrientacaoBox texto={field.label} nivel={field.nivelImportancia} />
          ) : field.type === "checklist" ? (
            <ChecklistField field={field} value={values[field.id]} values={values} onChange={onChange} disabled={disabled} />
          ) : (
            <CampoRenderizado
              field={field}
              value={values[field.id]}
              values={values}
              allFields={fields}
              onChange={onChange}
              disabled={disabled}
              respostaCompacta={respostaCompacta}
              renomeando={renomeandoId === field.id || (!!respostaCompacta && !field.label.trim())}
              rotuloTemp={renomeandoId === field.id ? rotuloTemp : field.label}
              onRotuloTempChange={setRotuloTemp}
              onConfirmarRenomeacao={() => confirmarRenomeacao(field)}
              onCancelarRenomeacao={() => {
                setRotuloTemp(field.label);
                setRenomeandoId(null);
              }}
            />
          );

        // Ajuste doc (AJUSTE 6) — pilha de ícones à esquerda da caixa
        // (editar rótulo, pedir/ocultar orientação, excluir), alça de
        // arrastar sempre no canto superior direito. Só perguntas de
        // fato (não seção/orientação/checklist, que têm suas próprias
        // ferramentas de gestão na edição).
        const podeExcluirAqui =
          onRemoveField && field.type !== "section" && field.type !== "orientation" && field.type !== "checklist";
        const indiceReal = fields.findIndex((f) => f.id === field.id);
        const podeTerOrientacao = respostaCompacta && podeJustificar(field) && !!field.justificativa;
        const justificativaVisivel = !!justificativasVisiveis?.[field.id];
        const justificativaMinimizada = !!justificativasMinimizadas?.[field.id];

        return (
          <div key={field.id}>
            {onInsertFieldAt && i > 0 && (
              <InsertFieldHere
                onInsert={(novo) => onInsertFieldAt(indiceReal, novo)}
                opcoes={respostaCompacta ? ["pergunta"] : undefined}
              />
            )}
            <DraggableFieldBox
              id={field.id}
              enabled={!!(respostaCompacta && onReorderFields && field.type !== "section")}
              className={cn(
                "group/campo relative",
                respostaCompacta &&
                  field.type !== "section" &&
                  "rounded-md border border-border bg-surface/60 p-2.5 pl-7 pr-7",
              )}
            >
              {({ attributes, listeners }) => (
                <>
                  {respostaCompacta && field.type !== "section" && (
                    <div className="absolute left-1 top-0.5 flex flex-col items-center gap-0.5">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/campo:opacity-100"
                        aria-label="Editar rótulo da pergunta"
                        title="Editar rótulo da pergunta"
                        onClick={() => {
                          setRotuloTemp(field.label);
                          setRenomeandoId(field.id);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {podeTerOrientacao && onToggleJustificativaVisivel && (
                        <button
                          type="button"
                          className={cn(
                            "rounded p-1 transition-opacity hover:text-warning group-hover/campo:opacity-100",
                            justificativaVisivel
                              ? "text-warning opacity-100"
                              : "text-muted-foreground opacity-0",
                          )}
                          aria-label={justificativaVisivel ? "Ocultar orientação" : "Exibir orientação"}
                          title={justificativaVisivel ? "Ocultar orientação" : "Exibir orientação"}
                          onClick={() => onToggleJustificativaVisivel(field.id)}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {podeExcluirAqui && (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/campo:opacity-100"
                          aria-label="Excluir pergunta"
                          title="Excluir pergunta"
                          onClick={() => onRemoveField(field.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  {!respostaCompacta && podeExcluirAqui && (
                    <button
                      type="button"
                      className="absolute left-1 top-0.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/campo:opacity-100"
                      aria-label="Excluir pergunta"
                      title="Excluir pergunta"
                      onClick={() => onRemoveField(field.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {respostaCompacta && onReorderFields && field.type !== "section" && (
                    <button
                      type="button"
                      className="absolute right-1 top-0.5 cursor-grab touch-none rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/campo:opacity-100 active:cursor-grabbing"
                      aria-label="Arrastar para reposicionar"
                      title="Arrastar para reposicionar"
                      {...attributes}
                      {...listeners}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {conteudo}
                  {podeTerOrientacao && justificativaVisivel && (
                    <div className="mt-2 rounded-md border border-warning/30 bg-warning/[0.08] p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
                          <Info className="h-3 w-3" aria-hidden /> Orientação
                        </p>
                        <div className="flex items-center gap-0.5">
                          {onToggleJustificativaMinimizada && (
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                              aria-label={justificativaMinimizada ? "Expandir orientação" : "Minimizar orientação"}
                              title={justificativaMinimizada ? "Expandir orientação" : "Minimizar orientação"}
                              onClick={() => onToggleJustificativaMinimizada(field.id)}
                            >
                              {justificativaMinimizada ? (
                                <Maximize2 className="h-3 w-3" />
                              ) : (
                                <Minimize2 className="h-3 w-3" />
                              )}
                            </button>
                          )}
                          {onToggleJustificativaVisivel && (
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                              aria-label="Ocultar orientação"
                              title="Ocultar orientação"
                              onClick={() => onToggleJustificativaVisivel(field.id)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      {!justificativaMinimizada && (
                        <p className="whitespace-pre-wrap text-[11px] text-foreground">{field.justificativa}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </DraggableFieldBox>
          </div>
        );
      })}
      {onInsertFieldAt && visiveis.length > 0 && (
        <InsertFieldHere
          onInsert={(novo) => onInsertFieldAt(fields.length, novo)}
          opcoes={respostaCompacta ? ["pergunta"] : undefined}
        />
      )}
    </div>
  );

  if (respostaCompacta && onReorderFields) {
    return (
      <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEndFields}>
        <SortableContext items={visiveis.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {listaCampos}
        </SortableContext>
      </DndContext>
    );
  }

  return listaCampos;
}

/** Ajuste doc (AJUSTE 14) — só faz sentido pedir orientação de perguntas
 *  de fato (não seção/orientação/checklist). */
/** Ajuste doc (AJUSTE 14) — só arrasta pelo ícone dedicado (GripVertical),
 *  nunca pelo texto/campo de preenchimento. useSortable é sempre chamado
 *  (regras de hooks), mas fica "disabled" quando o recurso não está
 *  ativo (Atendimento normal, ou seções). */
function DraggableFieldBox({
  id,
  enabled,
  className,
  children,
}: {
  id: string;
  enabled: boolean;
  className?: string;
  children: (drag: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown> | undefined;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !enabled,
  });
  const style = enabled
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;
  return (
    <div ref={enabled ? setNodeRef : undefined} style={style} className={className}>
      {children({ attributes, listeners })}
    </div>
  );
}

function podeJustificar(field: AtendimentoFormField): boolean {
  return field.type !== "section" && field.type !== "orientation" && field.type !== "checklist";
}

/** Ajuste doc — nota de orientação do Defensor Público para quem preenche,
 *  em destaque no formulário (mesmo estilo da antiga descrição do
 *  Atendimento). Não é um campo de resposta: sem Label/FieldInput. */
function OrientacaoBox({ texto, nivel }: { texto: string; nivel?: "media" | "alta" | null }) {
  if (!texto) return null;
  // Ajuste doc — grau de importância: "media" (Âmbar, padrão) ou "alta" (Bordô).
  const alta = nivel === "alta";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border p-2.5",
        alta ? "border-critical/30 bg-critical/[0.1]" : "border-warning/30 bg-warning/[0.1]",
      )}
    >
      <Info className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", alta ? "text-critical" : "text-warning")} aria-hidden />
      {/* Ajuste doc (AJUSTE 24) — texto de orientação pode ter negrito/
          sublinhado; sanitizado antes de renderizar (mesma allowlist já
          usada nas Cotas). */}
      <p
        className="whitespace-pre-wrap text-xs text-foreground"
        dangerouslySetInnerHTML={{ __html: sanitizeCotaHtml(texto) }}
      />
    </div>
  );
}

/** Bloco grande (Ajuste 8) — checklist: itens marcáveis. Título opcional
 *  (ao contrário de um campo comum, não usa o Label externo do
 *  CampoRenderizado) — quando "Obrigatório" está marcado, exige que TODOS
 *  os itens estejam marcados para concluir o atendimento. */
function ChecklistField({
  field,
  value,
  values,
  onChange,
  disabled,
}: {
  field: AtendimentoFormField;
  value: CampoValor | undefined;
  values: AtendimentoFormValues;
  onChange: (fieldId: string, value: CampoValor) => void;
  disabled?: boolean;
}) {
  const items = field.checklistItems ?? [];
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const alta = field.nivelImportancia === "alta";
  return (
    // Ajuste doc — mesmo esquema de cor da Orientação: âmbar (média) ou bordô (alta).
    <div
      className={cn(
        "space-y-1 rounded-md border p-2.5",
        alta ? "border-critical/30 bg-critical/[0.1]" : "border-warning/30 bg-warning/[0.1]",
      )}
    >
      {field.label && (
        <div className="flex items-center gap-2">
          <ListChecks className={cn("h-3.5 w-3.5 shrink-0", alta ? "text-critical" : "text-warning")} aria-hidden />
          <p className="text-xs font-medium text-foreground">
            {field.label}
            {campoObrigatorioEfetivo(field, values) && <span className="ml-0.5 text-destructive">*</span>}
          </p>
        </div>
      )}
      <div className="space-y-1 pt-0.5">
        {items.map((item, i) => {
          const checked = selected.includes(item);
          return (
            <div key={i} className="flex items-center gap-2">
              <Checkbox
                id={`${field.id}-${i}`}
                className="h-3.5 w-3.5"
                checked={checked}
                disabled={disabled}
                onCheckedChange={(v) => {
                  const next = v ? [...selected, item] : selected.filter((x) => x !== item);
                  onChange(field.id, next);
                }}
              />
              <Label
                htmlFor={`${field.id}-${i}`}
                className={cn(
                  "text-xs font-normal",
                  checked && "text-muted-foreground line-through",
                )}
              >
                {item}
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CampoRenderizado({
  field,
  value,
  values,
  allFields,
  onChange,
  disabled,
  respostaCompacta,
  renomeando,
  rotuloTemp,
  onRotuloTempChange,
  onConfirmarRenomeacao,
  onCancelarRenomeacao,
}: {
  field: AtendimentoFormField;
  value: CampoValor | undefined;
  values: AtendimentoFormValues;
  allFields: AtendimentoFormField[];
  onChange: (fieldId: string, value: CampoValor) => void;
  disabled?: boolean;
  respostaCompacta?: boolean;
  /** Ajuste doc (AJUSTE 6) — o botão de editar rótulo migrou para a
   *  pilha de ícones à esquerda da caixa (fora deste componente); aqui
   *  só é recebido o estado já controlado por fora. */
  renomeando?: boolean;
  rotuloTemp?: string;
  onRotuloTempChange?: (v: string) => void;
  onConfirmarRenomeacao?: () => void;
  onCancelarRenomeacao?: () => void;
}) {
  // Fase 7 — campo calculado: nunca editável, computado ao vivo a partir
  // dos campos que ele referencia. Não passa por FieldInput.
  if (field.type === "calculated") {
    const texto = calcularValor(field, allFields, values);
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{field.label || "(sem rótulo)"}</Label>
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs">
          {texto || <span className="text-muted-foreground">—</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {renomeando ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={rotuloTemp}
            onChange={(e) => onRotuloTempChange?.(e.target.value)}
            placeholder="Rótulo da pergunta…"
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirmarRenomeacao?.();
              if (e.key === "Escape") onCancelarRenomeacao?.();
            }}
            onBlur={() => onConfirmarRenomeacao?.()}
            className="h-6 bg-surface text-xs"
          />
          {/* Ajuste doc (AJUSTE 6) — botão discreto de confirmar, além do
              Enter/blur. */}
          <button
            type="button"
            className="shrink-0 rounded p-1 text-institutional hover:bg-institutional/10"
            aria-label="Confirmar rótulo"
            title="Confirmar rótulo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onConfirmarRenomeacao?.()}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <Label htmlFor={`campo-${field.id}`} className="text-xs">
          {field.label || "(sem rótulo)"}
          {campoObrigatorioEfetivo(field, values) && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      <FieldInput
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        respostaCompacta={respostaCompacta}
      />
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
  respostaCompacta,
}: {
  field: AtendimentoFormField;
  value: CampoValor | undefined;
  onChange: (fieldId: string, value: CampoValor) => void;
  disabled?: boolean;
  /** Ajuste doc — Atendimento IA: todas as perguntas de texto exibem um
   *  campo compacto (uma linha) por padrão, com botão discreto (aparece
   *  no hover) para expandir para texto longo sem perder o que já foi
   *  escrito. Não afeta o Atendimento normal (prop não passada lá). */
  respostaCompacta?: boolean;
}) {
  const id = `campo-${field.id}`;
  const [expandido, setExpandido] = useState(false);

  // Ajuste doc — Atendimento IA: sugestões de resposta rápida (até 3) para
  // campos de texto curto/longo. Clicar preenche o campo com o texto
  // sugerido; a pessoa que preenche pode editar livremente depois.
  const sugestoes = (field.sugestoesResposta ?? []).filter((s) => s.trim());
  if ((field.type === "text_short" || field.type === "text_long") && sugestoes.length > 0) {
    const atual = (value as string) ?? "";
    const usaTextarea = respostaCompacta ? expandido : field.type === "text_long";
    return (
      <div className="space-y-1.5">
        <div className="group/campotexto relative">
          {usaTextarea ? (
            <Textarea
              id={id}
              className="bg-surface text-xs"
              value={atual}
              onChange={(e) => onChange(field.id, e.target.value)}
              placeholder={field.placeholder ?? undefined}
              disabled={disabled}
              rows={3}
              required={field.required}
            />
          ) : (
            <Input
              id={id}
              className={cn("bg-surface text-xs", respostaCompacta && "pr-7")}
              value={atual}
              onChange={(e) => onChange(field.id, e.target.value)}
              placeholder={field.placeholder ?? undefined}
              disabled={disabled}
              required={field.required}
            />
          )}
          {respostaCompacta && (
            <button
              type="button"
              className={cn(
                "absolute right-1.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/campotexto:opacity-100",
                usaTextarea ? "top-1.5" : "top-1/2 -translate-y-1/2",
              )}
              aria-label={usaTextarea ? "Compactar campo" : "Expandir campo"}
              title={usaTextarea ? "Compactar campo" : "Expandir campo"}
              onClick={() => setExpandido((v) => !v)}
            >
              {usaTextarea ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sugestoes.map((s, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                atual === s
                  ? "border-institutional bg-institutional/[0.08] text-institutional"
                  : "border-border text-muted-foreground hover:border-institutional/50 hover:text-institutional",
              )}
              onClick={() => onChange(field.id, s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (respostaCompacta && (field.type === "text_short" || field.type === "text_long")) {
    const atual = (value as string) ?? "";
    const usaTextarea = expandido;
    return (
      <div className="group/campotexto relative">
        {usaTextarea ? (
          <Textarea
            id={id}
            className="bg-surface text-xs"
            value={atual}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.placeholder ?? undefined}
            disabled={disabled}
            rows={3}
            required={field.required}
          />
        ) : (
          <Input
            id={id}
            className="bg-surface pr-7 text-xs"
            value={atual}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.placeholder ?? undefined}
            disabled={disabled}
            required={field.required}
          />
        )}
        <button
          type="button"
          className={cn(
            "absolute right-1.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/campotexto:opacity-100",
            usaTextarea ? "top-1.5" : "top-1/2 -translate-y-1/2",
          )}
          aria-label={usaTextarea ? "Compactar campo" : "Expandir campo"}
          title={usaTextarea ? "Compactar campo" : "Expandir campo"}
          onClick={() => setExpandido((v) => !v)}
        >
          {usaTextarea ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>
    );
  }

  switch (field.type) {
    case "text_long":
      return (
        <Textarea
          id={id}
          className="bg-surface text-xs"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder ?? undefined}
          disabled={disabled}
          rows={3}
          required={field.required}
        />
      );
    case "radio": {
      const opts = field.options ?? [];
      const atual = (value as string) ?? "";
      const outroAtivo = field.allowOther && (atual === "" ? false : ehValorOutro(atual) || !opts.includes(atual));
      const radioValue = outroAtivo ? "__outro__" : atual;
      return (
        <div className="space-y-1.5 pt-0.5">
          <RadioGroup
            value={radioValue}
            onValueChange={(v) => onChange(field.id, v === "__outro__" ? construirValorOutro("") : v)}
          >
            {opts.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-${i}`} value={opt} disabled={disabled} />
                <Label htmlFor={`${id}-${i}`} className="text-xs font-normal">
                  {opt}
                </Label>
              </div>
            ))}
            {field.allowOther && (
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-outro`} value="__outro__" disabled={disabled} />
                <Label htmlFor={`${id}-outro`} className="text-xs font-normal">
                  Outro
                </Label>
              </div>
            )}
          </RadioGroup>
          {outroAtivo && (
            <Input
              className="ml-6 h-8 max-w-[240px] bg-surface text-xs"
              value={ehValorOutro(atual) ? textoDoValorOutro(atual) : ""}
              onChange={(e) => onChange(field.id, construirValorOutro(e.target.value))}
              placeholder="Especifique…"
              disabled={disabled}
            />
          )}
        </div>
      );
    }
    case "checkbox": {
      const opts = field.options ?? [];
      const selected: string[] = Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : [];
      const outroSelecionado = selected.find((v) => ehValorOutro(v));
      return (
        <div className="space-y-1.5 pt-0.5">
          {opts.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${i}`}
                checked={selected.includes(opt)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const next = checked ? [...selected, opt] : selected.filter((o) => o !== opt);
                  onChange(field.id, next);
                }}
              />
              <Label htmlFor={`${id}-${i}`} className="text-xs font-normal">
                {opt}
              </Label>
            </div>
          ))}
          {field.allowOther && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-outro`}
                  checked={!!outroSelecionado}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...selected, construirValorOutro("")]
                      : selected.filter((v) => !ehValorOutro(v));
                    onChange(field.id, next);
                  }}
                />
                <Label htmlFor={`${id}-outro`} className="text-xs font-normal">
                  Outro
                </Label>
              </div>
              {outroSelecionado && (
                <Input
                  className="ml-6 h-8 max-w-[240px] bg-surface text-xs"
                  value={textoDoValorOutro(outroSelecionado)}
                  onChange={(e) => {
                    const next = selected.map((v) =>
                      ehValorOutro(v) ? construirValorOutro(e.target.value) : v,
                    );
                    onChange(field.id, next);
                  }}
                  placeholder="Especifique…"
                  disabled={disabled}
                />
              )}
            </div>
          )}
        </div>
      );
    }
    case "dropdown": {
      const opts = field.options ?? [];
      const atual = (value as string) ?? "";
      const outroAtivo = field.allowOther && atual !== "" && (ehValorOutro(atual) || !opts.includes(atual));
      const selectValue = outroAtivo ? "__outro__" : atual || undefined;
      return (
        <div className="space-y-1.5">
          <Select
            value={selectValue}
            onValueChange={(v) => onChange(field.id, v === "__outro__" ? construirValorOutro("") : v)}
            disabled={disabled}
          >
            <SelectTrigger id={id} className="bg-surface text-xs">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {opts.map((opt, i) => (
                <SelectItem key={i} value={opt} className="text-xs">
                  {opt}
                </SelectItem>
              ))}
              {field.allowOther && (
                <SelectItem value="__outro__" className="text-xs">
                  Outro
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {outroAtivo && (
            <Input
              className="h-8 max-w-[240px] bg-surface text-xs"
              value={ehValorOutro(atual) ? textoDoValorOutro(atual) : ""}
              onChange={(e) => onChange(field.id, construirValorOutro(e.target.value))}
              placeholder="Especifique…"
              disabled={disabled}
            />
          )}
        </div>
      );
    }
    case "currency":
      return (
        <Input
          id={id}
          className="bg-surface text-xs"
          inputMode="decimal"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          onBlur={(e) => {
            const formatado = formatarMoedaExibicao(e.target.value);
            if (formatado !== e.target.value) onChange(field.id, formatado);
          }}
          placeholder={field.placeholder ?? "R$ 0,00"}
          disabled={disabled}
          required={field.required}
        />
      );
    case "matrix": {
      const linhas = field.matrixRows ?? [];
      const colunas = field.options ?? [];
      const registro = (value as Record<string, string>) ?? {};
      return (
        <div className="kanban-scroll overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="p-2 text-left font-medium"> </th>
                {colunas.map((c, ci) => (
                  <th key={ci} className="p-2 text-center font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, ri) => (
                <tr key={ri} className="border-b border-border last:border-0">
                  <td className="p-2">{linha}</td>
                  <td colSpan={colunas.length} className="p-0">
                    <RadioGroup
                      value={registro[String(ri)] ?? ""}
                      onValueChange={(v) => onChange(field.id, { ...registro, [String(ri)]: v })}
                      className="flex"
                    >
                      {colunas.map((c, ci) => (
                        <div key={ci} className="flex flex-1 items-center justify-center py-2">
                          <RadioGroupItem value={c} disabled={disabled} aria-label={c} />
                        </div>
                      ))}
                    </RadioGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "table_fillable": {
      const colunas = field.tableColumns ?? [];
      const linhas = (value as Record<string, string>[]) ?? [];
      const setCelula = (ri: number, col: string, v: string) => {
        onChange(field.id, linhas.map((linha, i) => (i === ri ? { ...linha, [col]: v } : linha)));
      };
      const addLinha = () => onChange(field.id, [...linhas, {}]);
      const removeLinha = (ri: number) => onChange(field.id, linhas.filter((_, i) => i !== ri));
      return (
        <div className="space-y-2">
          <div className="kanban-scroll overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {colunas.map((c, ci) => (
                    <th key={ci} className="p-2 text-left font-medium">
                      {c}
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, ri) => (
                  <tr key={ri} className="border-b border-border last:border-0">
                    {colunas.map((c, ci) => (
                      <td key={ci} className="p-1">
                        <Input
                          className="h-7 bg-surface text-xs"
                          value={linha[c] ?? ""}
                          onChange={(e) => setCelula(ri, c, e.target.value)}
                          disabled={disabled}
                        />
                      </td>
                    ))}
                    <td className="p-1 text-center">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover linha"
                        disabled={disabled}
                        onClick={() => removeLinha(ri)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            disabled={disabled}
            onClick={addLinha}
          >
            <Plus className="h-3 w-3" aria-hidden /> Adicionar linha
          </Button>
        </div>
      );
    }
    case "repeat_group": {
      const subfields = field.repeatFields ?? [];
      const instancias = (value as Record<string, string>[]) ?? [];
      const setSub = (ii: number, subId: string, v: CampoValor) => {
        onChange(
          field.id,
          instancias.map((inst, i) => (i === ii ? { ...inst, [subId]: v as string } : inst)),
        );
      };
      const addInstancia = () => onChange(field.id, [...instancias, {}]);
      const removeInstancia = (ii: number) => onChange(field.id, instancias.filter((_, i) => i !== ii));
      return (
        <div className="space-y-2">
          {instancias.map((inst, ii) => (
            <div key={ii} className="space-y-2 rounded-md border border-border p-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">Item {ii + 1}</p>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover item"
                  disabled={disabled}
                  onClick={() => removeInstancia(ii)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {subfields.map((sf) => (
                <div key={sf.id} className="space-y-1">
                  <Label className="text-xs font-normal text-muted-foreground">
                    {sf.label || "(sem rótulo)"}
                  </Label>
                  <FieldInput
                    field={sf}
                    value={inst[sf.id] ?? ""}
                    onChange={(_, v) => setSub(ii, sf.id, v)}
                    disabled={disabled}
                  />
                </div>
              ))}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            disabled={disabled}
            onClick={addInstancia}
          >
            <Plus className="h-3 w-3" aria-hidden /> Adicionar {field.label || "item"}
          </Button>
        </div>
      );
    }
    case "email":
    case "phone":
    case "cpf_cnpj":
    case "date":
    case "time":
    case "number":
    case "text_short":
    default: {
      const htmlType: Record<string, string> = {
        email: "email",
        phone: "tel",
        date: "date",
        time: "time",
        number: "number",
      };
      const placeholder: Record<string, string> = {
        phone: "(00) 00000-0000",
        cpf_cnpj: "000.000.000-00",
      };
      return (
        <Input
          id={id}
          className="bg-surface text-xs"
          type={htmlType[field.type] ?? "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder ?? placeholder[field.type] ?? undefined}
          disabled={disabled}
          required={field.required}
        />
      );
    }
  }
}
