import { useEffect, useRef, useState } from "react";
import {
  Copy,
  ListChecks,
  Loader2,
  MessageSquare,
  Pencil,
  Printer,
  Sparkles,
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { FormRenderer } from "@/components/atendimento/form-renderer";
import { FieldEditor, InsertFieldHere } from "@/components/atendimento/atendimento-form-sheet";
import {
  campoVisivel,
  fieldHasOptions,
  hasRespostaPreenchida,
  isChoiceField,
  montarRespostasParaResumo,
  montarTextoExpandido,
  novoCampo,
  novoChecklist,
  obrigatoriosFaltando,
  removerReferenciaDaCondicao,
  valorInicial,
  type AtendimentoFormValues,
} from "@/components/atendimento/form-field-types";
import {
  abrirImpressao,
  montarFormularioBrancoHtml,
  montarFormularioPreenchidoHtml,
} from "@/components/atendimento/print";
import { gerarAtendimentoComIA, gerarResumoAtendimentoIA } from "@/lib/reintegra-api";
import { mensagemErroResumoIA } from "@/components/atendimento/atendimento-detail-sheet";
import type { AtendimentoFieldType, AtendimentoFormField } from "@/lib/reintegra-api";

export type AtendimentoIaResultado = {
  personName: string;
  context: string;
  campos: AtendimentoFormField[];
  /** Ajuste doc — mantido em memória (nunca persistido) só para permitir
   *  "Alterar contexto e reformular" sem pedir novo upload. */
  file: File;
};

interface AtendimentoIaSheetProps {
  open: boolean;
  data: AtendimentoIaResultado | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Bloco doc "IMPLEMENTAÇÃO DO ATENDIMENTO IA" — caixa de execução do
 * formulário gerado pela IA: título é o nome da pessoa atendida, "Gerado
 * pelo AtendimentoIA" no lugar da informação de autor/edição/categoria, e
 * o contexto informado ocupa o lugar da descrição. As perguntas podem ser
 * editadas/adicionadas/removidas inline (mesmo editor do builder normal)
 * antes ou durante o preenchimento. Nada aqui é persistido — assim como
 * nos Atendimentos normais, fechar a caixa ou atualizar a página destrói
 * o formulário e as respostas.
 */
export function AtendimentoIaSheet({ open, data, onOpenChange }: AtendimentoIaSheetProps) {
  const [campos, setCampos] = useState<AtendimentoFormField[]>([]);
  const [values, setValues] = useState<AtendimentoFormValues>({});
  const [editando, setEditando] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [resumoDesatualizado, setResumoDesatualizado] = useState(false);
  const [gerandoResumo, setGerandoResumo] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // Ajuste doc — "Alterar contexto e reformular": mantém o arquivo
  // original em memória (nunca persistido) para reprocessar com um novo
  // contexto, sem pedir novo upload.
  const [reformularAberto, setReformularAberto] = useState(false);
  const [novoContexto, setNovoContexto] = useState("");
  const [reformulando, setReformulando] = useState(false);
  const [contextoAtual, setContextoAtual] = useState("");

  useEffect(() => {
    if (!open || !data) return;
    // Ajuste doc — no formulário formulado pelo Atendimento IA, todas as
    // perguntas são de resposta opcional (mesmo que a IA/o campo original
    // tenha marcado "obrigatório").
    setCampos(data.campos.map((c) => ({ ...c, required: false, requiredIf: null })));
    setValues({});
    setEditando(false);
    setResumo(null);
    setResumoDesatualizado(false);
    setContextoAtual(data.context);
  }, [open, data]);

  // Garante valor inicial para qualquer campo novo (gerado pela IA ou
  // acrescentado na edição) sem sobrescrever respostas já dadas.
  useEffect(() => {
    setValues((prev) => {
      let mudou = false;
      const next = { ...prev };
      for (const c of campos) {
        if (!(c.id in next)) {
          next[c.id] = valorInicial(c);
          mudou = true;
        }
      }
      return mudou ? next : prev;
    });
  }, [campos]);

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

  const addCampo = () => setCampos((prev) => [...prev, novoCampo()]);
  const addChecklist = () => setCampos((prev) => [...prev, novoChecklist()]);

  // Ajuste doc — "Alterar contexto e reformular": reprocessa o mesmo
  // arquivo original com um novo contexto, substituindo as perguntas e
  // descartando respostas/relato já preenchidos (o formulário muda).
  const handleReformular = async () => {
    if (!data || !novoContexto.trim()) return;
    setReformulando(true);
    try {
      const novosCampos = await gerarAtendimentoComIA({
        personName: data.personName,
        context: novoContexto.trim(),
        file: data.file,
      });
      setCampos(novosCampos.map((c) => ({ ...c, required: false, requiredIf: null })));
      setValues({});
      setResumo(null);
      setResumoDesatualizado(false);
      setContextoAtual(novoContexto.trim());
      setReformularAberto(false);
      toast.success("Atendimento reformulado com o novo contexto");
    } catch (e) {
      toast.error(mensagemErroResumoIA(e));
    } finally {
      setReformulando(false);
    }
  };
  // Ajuste doc — mesma inserção rápida entre campos do builder normal.
  const insertCampoAt = (index: number, campo: AtendimentoFormField) =>
    setCampos((prev) => {
      const next = [...prev];
      next.splice(index, 0, campo);
      return next;
    });
  const removeCampo = (id: string) =>
    setCampos((prev) =>
      prev
        .filter((f) => f.id !== id)
        .map((f) => ({
          ...f,
          visibleIf: removerReferenciaDaCondicao(f.visibleIf, id),
          requiredIf: removerReferenciaDaCondicao(f.requiredIf, id),
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
            checklistItems: type === "checklist" ? (f.checklistItems?.length ? f.checklistItems : ["Item 1"]) : null,
          };
        }
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

  const handleChange = (fieldId: string, value: AtendimentoFormValues[string]) => {
    setValues((prev) => {
      const next = { ...prev, [fieldId]: value };
      for (const field of campos) {
        if (field.type === "section") continue;
        if (!campoVisivel(field, next) && next[field.id] !== undefined) {
          next[field.id] = valorInicial(field);
        }
      }
      return next;
    });
    if (resumo) setResumoDesatualizado(true);
  };

  const handleConcluir = async () => {
    if (!data) return;
    const faltando = obrigatoriosFaltando(campos, values);
    if (faltando.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${faltando.join(", ")}`);
      return;
    }
    setGerandoResumo(true);
    try {
      const respostas = montarRespostasParaResumo(campos, values);
      const texto = await gerarResumoAtendimentoIA({
        titulo: data.personName,
        descricao: contextoAtual,
        respostas,
      });
      setResumo(texto);
      setResumoDesatualizado(false);
      toast.success("Relato do atendimento gerado");
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    } catch (e) {
      toast.error(mensagemErroResumoIA(e));
    } finally {
      setGerandoResumo(false);
    }
  };

  const handleCopiarTextoExpandido = async () => {
    const texto = montarTextoExpandido(campos, values);
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado — gerado localmente, nenhuma resposta trafegou pela rede");
    } catch {
      toast.error("Não foi possível copiar o texto");
    }
  };

  const handleCopiarResumo = async () => {
    if (!resumo) return;
    try {
      await navigator.clipboard.writeText(resumo);
      toast.success("Relato copiado");
    } catch {
      toast.error("Não foi possível copiar o relato");
    }
  };

  const handleImprimirBranco = () => {
    if (!data) return;
    const html = montarFormularioBrancoHtml(data.personName, contextoAtual, campos);
    if (!abrirImpressao(data.personName, html)) {
      toast.error("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
    }
  };

  const handleImprimirPreenchido = () => {
    if (!data) return;
    const html = montarFormularioPreenchidoHtml(data.personName, contextoAtual, campos, values, resumo);
    if (!abrirImpressao(data.personName, html)) {
      toast.error("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
    }
  };

  const handleSheetOpenChange = (v: boolean) => {
    if (!v && hasRespostaPreenchida(values)) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(v);
  };

  if (!data) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleSheetOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-start gap-2 pr-6 text-base">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
              <span className="break-words">{data.personName}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="mt-2 shrink-0 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-semibold text-institutional">
              <Sparkles className="h-3 w-3" aria-hidden /> Gerado pelo AtendimentoIA
            </span>
          </div>

          {contextoAtual && (
            <p className="mt-2 shrink-0 whitespace-pre-wrap text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Contexto:</span> {contextoAtual}
            </p>
          )}

          {/* Ajuste doc — "Imprimir formulário" alinhado à direita, na
              lateral direita da caixa; oculto durante a edição das
              perguntas (ajuste doc — Atendimento IA). */}
          <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[11px] text-muted-foreground"
              onClick={() => {
                // Ajuste doc — não permitir concluir a edição com alguma
                // pergunta sem rótulo.
                if (editando) {
                  const semRotulo = campos.some((c) => !c.label?.trim());
                  if (semRotulo) {
                    toast.error("Preencha o rótulo de todas as perguntas antes de concluir a edição.");
                    return;
                  }
                }
                setEditando((v) => !v);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editando ? "Concluir edição das perguntas" : "Editar perguntas"}
            </Button>
            {!editando && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-[11px] text-muted-foreground"
                onClick={() => {
                  setNovoContexto(data?.context ?? "");
                  setReformularAberto(true);
                }}
              >
                <Sparkles className="h-3.5 w-3.5" /> Alterar contexto e reformular
              </Button>
            )}
            {!editando && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1.5 text-[11px] text-muted-foreground"
                onClick={handleImprimirBranco}
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir formulário
              </Button>
            )}
          </div>

          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3">
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/30 py-3 pl-7 pr-3"
            >
              {editando ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addCampo}>
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Adicionar pergunta
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addChecklist}>
                      <ListChecks className="h-3.5 w-3.5" aria-hidden /> Adicionar checklist
                    </Button>
                  </div>
                  {campos.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      Nenhuma pergunta ainda. Use "Adicionar pergunta" para montar o formulário.
                    </p>
                  ) : (
                    <DndContext
                      sensors={dragSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEndCampos}
                    >
                      <SortableContext items={campos.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                        <div>
                          {campos.map((campo, index) => (
                            <div key={campo.id} className="pb-3">
                              {index > 0 && (
                                <InsertFieldHere
                                  onInsert={(novo) => insertCampoAt(index, novo)}
                                  opcoes={["pergunta", "checklist"]}
                                />
                              )}
                              <FieldEditor
                                campo={campo}
                                campos={campos}
                                index={index}
                                total={campos.length}
                                onChange={(patch) => updateCampo(campo.id, patch)}
                                onChangeType={(type) => changeCampoType(campo.id, type)}
                                onRemove={() => removeCampo(campo.id)}
                                onMove={(dir) => moveCampo(index, dir)}
                              />
                            </div>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              ) : (
                <>
                  <FormRenderer
                    fields={campos}
                    values={values}
                    onChange={handleChange}
                    onRemoveField={removeCampo}
                    onInsertFieldAt={insertCampoAt}
                    respostaCompacta
                    onRenameField={(fieldId, novoLabel) =>
                      setCampos((prev) => prev.map((c) => (c.id === fieldId ? { ...c, label: novoLabel } : c)))
                    }
                  />

                  {resumo && (
                    <div className="mt-4 rounded-md border border-institutional/30 bg-institutional/[0.06] p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-institutional">
                          Relato do atendimento {resumoDesatualizado && "(desatualizado)"}
                        </p>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          aria-label="Copiar relato do atendimento"
                          onClick={handleCopiarResumo}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-xs text-foreground">{resumo}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {!editando && (
            <DialogFooter className="mt-3 shrink-0 sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={resumo && !resumoDesatualizado ? "outline" : "default"}
                  className="gap-1.5"
                  onClick={handleConcluir}
                  disabled={gerandoResumo || (!!resumo && !resumoDesatualizado)}
                >
                  {gerandoResumo && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  {resumo ? (resumoDesatualizado ? "Atualizar relato" : "Concluído") : "Gerar relato"}
                </Button>
                {hasRespostaPreenchida(values) && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopiarTextoExpandido}>
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                )}
                {resumo && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleImprimirPreenchido}>
                    <Printer className="h-3.5 w-3.5" /> Imprimir
                  </Button>
                )}
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja fechar?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao fechar, o formulário gerado pela IA e as respostas preenchidas serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar preenchendo</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmClose(false);
                onOpenChange(false);
              }}
            >
              Fechar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reformularAberto} onOpenChange={setReformularAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar contexto e reformular</AlertDialogTitle>
            <AlertDialogDescription>
              O mesmo documento anexado será reanalisado com o novo contexto, gerando um formulário
              novo. Perguntas respondidas e o relato já gerado (se houver) serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={novoContexto}
            onChange={(e) => setNovoContexto(e.target.value)}
            placeholder="Novo contexto para a formulação do atendimento…"
            rows={4}
            className="resize-none bg-surface text-xs"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reformulando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!novoContexto.trim() || reformulando}
              onClick={(e) => {
                e.preventDefault();
                handleReformular();
              }}
            >
              {reformulando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Reformular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
