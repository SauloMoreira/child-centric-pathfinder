import { useEffect, useState } from "react";
import { Copy, Loader2, MessageSquare, Pencil, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  campoVisivel,
  hasRespostaPreenchida,
  montarRespostasParaResumo,
  montarTextoExpandido,
  obrigatoriosFaltando,
  valorInicial,
  type AtendimentoFormValues,
} from "@/components/atendimento/form-field-types";
import {
  abrirImpressao,
  montarFormularioBrancoHtml,
  montarFormularioPreenchidoHtml,
} from "@/components/atendimento/print";
import { gerarResumoAtendimentoIA } from "@/lib/reintegra-api";
import {
  useAtendimentoDetalhe,
  useExcluirAtendimento,
  mensagemErroAtendimento,
} from "@/features/atendimento/hooks";

interface AtendimentoDetailSheetProps {
  itemId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDeleted: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { dateStyle: "short" });
  } catch {
    return iso;
  }
}

/** Mensagens amigáveis para os códigos de erro do resumo por IA. */
function mensagemErroResumoIA(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.includes("NO_ANSWERS")) return "Preencha ao menos uma resposta antes de concluir.";
  if (msg.includes("RATE_LIMITED"))
    return "Muitas solicitações agora. Aguarde um instante e tente novamente.";
  if (msg.includes("AI_CREDITS_EXHAUSTED"))
    return "O saldo de IA do projeto no Lovable acabou. Verifique em Configurações → Cloud & AI balance.";
  if (msg.includes("UNAUTHENTICATED")) return "Sua sessão expirou. Recarregue a página.";
  if (msg.includes("AI_GATEWAY_UNREACHABLE"))
    return "Não foi possível contatar o serviço de IA (função indisponível ou não publicada). Detalhe técnico: " + msg;
  if (msg.includes("AI_GATEWAY_ERROR"))
    return "O serviço de IA retornou um erro. Detalhe técnico: " + msg;
  if (msg.includes("EMPTY_AI_RESPONSE"))
    return "O serviço de IA não retornou nenhum texto. Tente novamente.";
  if (msg.includes("INVALID_PAYLOAD") || msg.includes("INVALID_JSON"))
    return "Dados do formulário inválidos ao enviar para o relato. Detalhe técnico: " + msg;
  // Código não mapeado (ex.: função não encontrada/não implantada, erro de rede) —
  // mostra o detalhe bruto em vez de esconder atrás de uma mensagem genérica,
  // para que o erro real seja visível sem precisar de acesso aos logs do Lovable.
  return "Não foi possível gerar o relato agora. Detalhe técnico: " + (msg || "erro desconhecido");
}

/**
 * Caixa sobreposta (Dialog centralizado, largo) de detalhe do Atendimento:
 * título, autor, categoria(s), descrição e o formulário (preenchível em
 * memória — nada é persistido). Editar/excluir permanentemente ficam
 * restritos ao autor. Usa Dialog (não Sheet lateral, como a Cota) porque
 * a execução do formulário demanda mais dedicação, tempo e espaço na tela.
 *
 * Fase 3 — execução: "Concluir" valida os campos obrigatórios, gera um
 * resumo narrativo por IA (Lovable AI) e libera a impressão/PDF do
 * formulário preenchido. Editar respostas depois de concluir NÃO
 * regenera o resumo automaticamente — aparece "Atualizar conclusão".
 * Fechar a caixa com alguma resposta já preenchida pede confirmação.
 */
export function AtendimentoDetailSheet({
  itemId,
  onOpenChange,
  onEdit,
  onDeleted,
}: AtendimentoDetailSheetProps) {
  const detalhe = useAtendimentoDetalhe(itemId);
  const excluir = useExcluirAtendimento();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [values, setValues] = useState<AtendimentoFormValues>({});
  const [resumo, setResumo] = useState<string | null>(null);
  const [resumoDesatualizado, setResumoDesatualizado] = useState(false);
  const [gerandoResumo, setGerandoResumo] = useState(false);

  useEffect(() => {
    if (!detalhe.data) return;
    const initial: AtendimentoFormValues = {};
    for (const field of detalhe.data.formSchema) {
      initial[field.id] = valorInicial(field);
    }
    setValues(initial);
    setResumo(null);
    setResumoDesatualizado(false);
  }, [detalhe.data]);

  const handleChange = (fieldId: string, value: AtendimentoFormValues[string]) => {
    setValues((prev) => {
      const next = { ...prev, [fieldId]: value };
      // Fase 2 — lógica condicional: se essa resposta fez algum campo
      // posterior deixar de estar visível, limpa a resposta dele (evita
      // guardar respostas "fantasma" de campos escondidos).
      for (const field of detalhe.data?.formSchema ?? []) {
        if (field.type === "section") continue;
        if (!campoVisivel(field, next) && next[field.id] !== undefined) {
          next[field.id] = valorInicial(field);
        }
      }
      return next;
    });
    // Fase 3: editar uma resposta depois de já ter concluído não regenera
    // o resumo sozinho — só marca que ele ficou desatualizado.
    if (resumo) setResumoDesatualizado(true);
  };

  const handleDelete = () => {
    if (!detalhe.data) return;
    excluir.mutate(
      { itemId: detalhe.data.id, expectedVersion: detalhe.data.optimisticVersion },
      {
        onSuccess: () => {
          toast.success("Atendimento excluído permanentemente");
          setConfirmDelete(false);
          onOpenChange(false);
          onDeleted();
        },
        onError: (e) => {
          toast.error(mensagemErroAtendimento(e, "Falha ao excluir o atendimento"));
          setConfirmDelete(false);
        },
      },
    );
  };

  const handleConcluir = async () => {
    if (!detalhe.data) return;
    const faltando = obrigatoriosFaltando(detalhe.data.formSchema, values);
    if (faltando.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${faltando.join(", ")}`);
      return;
    }
    setGerandoResumo(true);
    try {
      const respostas = montarRespostasParaResumo(detalhe.data.formSchema, values);
      const texto = await gerarResumoAtendimentoIA({
        titulo: detalhe.data.titulo,
        descricao: detalhe.data.descricao,
        respostas,
      });
      setResumo(texto);
      setResumoDesatualizado(false);
      toast.success("Relato do atendimento gerado");
    } catch (e) {
      toast.error(mensagemErroResumoIA(e));
    } finally {
      setGerandoResumo(false);
    }
  };

  const handleCopiarTextoExpandido = async () => {
    if (!detalhe.data) return;
    const texto = montarTextoExpandido(detalhe.data.formSchema, values);
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
    if (!detalhe.data) return;
    const html = montarFormularioBrancoHtml(
      detalhe.data.titulo,
      detalhe.data.descricao,
      detalhe.data.formSchema,
    );
    if (!abrirImpressao(detalhe.data.titulo, html)) {
      toast.error("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
    }
  };

  const handleImprimirPreenchido = () => {
    if (!detalhe.data) return;
    const html = montarFormularioPreenchidoHtml(
      detalhe.data.titulo,
      detalhe.data.descricao,
      detalhe.data.formSchema,
      values,
      resumo,
    );
    if (!abrirImpressao(detalhe.data.titulo, html)) {
      toast.error("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
    }
  };

  const handleSheetOpenChange = (open: boolean) => {
    if (!open && hasRespostaPreenchida(values)) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(open);
  };

  const temCampos = (detalhe.data?.formSchema ?? []).some((f) => f.type !== "section");

  return (
    <>
      <Dialog open={!!itemId} onOpenChange={handleSheetOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden">
          {detalhe.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : !detalhe.data ? (
            <p className="p-4 text-sm text-muted-foreground">Atendimento não encontrado.</p>
          ) : (
            <>
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex items-start gap-2 pr-6 text-base">
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
                  <span className="break-words">{detalhe.data.titulo}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="mt-2 shrink-0 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">Autor(a):</span>{" "}
                  {detalhe.data.ownerDisplayName}
                </span>
                <span aria-hidden>·</span>
                <span>Editado em {formatDate(detalhe.data.updatedAt)}</span>
                <span aria-hidden>·</span>
                {detalhe.data.categorias.length === 0 ? (
                  <Badge variant="outline" className="text-[10px]">
                    Sem categoria
                  </Badge>
                ) : (
                  detalhe.data.categorias.map((c) => (
                    <Badge key={c.id} variant="outline" className="text-[10px]">
                      {c.nome}
                    </Badge>
                  ))
                )}
              </div>

              {detalhe.data.descricao && (
                <p className="mt-2 shrink-0 whitespace-pre-wrap text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Descrição:</span>{" "}
                  {detalhe.data.descricao}
                </p>
              )}

              {temCampos && (
                <div className="mt-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-[11px] text-muted-foreground"
                    onClick={handleImprimirBranco}
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir formulário
                  </Button>
                </div>
              )}

              <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3">
                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
                  <FormRenderer fields={detalhe.data.formSchema} values={values} onChange={handleChange} />

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
                </div>
              </div>

              {(temCampos || detalhe.data.canEdit) && (
                <DialogFooter className="mt-3 shrink-0 sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    {temCampos && (
                      <Button
                        size="sm"
                        variant={resumo && !resumoDesatualizado ? "outline" : "default"}
                        className="gap-1.5"
                        onClick={handleConcluir}
                        disabled={gerandoResumo || (!!resumo && !resumoDesatualizado)}
                      >
                        {gerandoResumo && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        {resumo ? (resumoDesatualizado ? "Atualizar conclusão" : "Concluído") : "Concluir"}
                      </Button>
                    )}
                    {temCampos && hasRespostaPreenchida(values) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={handleCopiarTextoExpandido}
                      >
                        <Copy className="h-3.5 w-3.5" /> Copiar
                      </Button>
                    )}
                    {temCampos && resumo && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={handleImprimirPreenchido}
                      >
                        <Printer className="h-3.5 w-3.5" /> Imprimir
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {detalhe.data.canEdit && (
                      <>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
                          <Pencil className="h-3.5 w-3.5" /> Editar modelo
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDelete(true)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir modelo
                        </Button>
                      </>
                    )}
                  </div>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja fechar?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao fechar, as respostas preenchidas neste atendimento serão perdidas.
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atendimento permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O atendimento "{detalhe.data?.titulo}" será removido
              de todos os Painéis e deixará de estar disponível para sua equipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluir.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={excluir.isPending}
            >
              {excluir.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
