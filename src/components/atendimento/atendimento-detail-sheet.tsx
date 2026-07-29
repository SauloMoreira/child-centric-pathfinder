import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
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
  valorInicial,
  type AtendimentoFormValues,
} from "@/components/atendimento/form-field-types";
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
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Camada lateral expandida de detalhe do Atendimento: título, autor,
 * categoria(s), descrição e o formulário (preenchível em memória — nada é
 * persistido). Editar/excluir permanentemente ficam restritos ao autor.
 * A conclusão do atendimento (resumo por IA + PDF) chega em uma fase
 * seguinte; aqui o formulário serve apenas para consulta/preenchimento.
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
  const [values, setValues] = useState<AtendimentoFormValues>({});

  useEffect(() => {
    if (!detalhe.data) return;
    const initial: AtendimentoFormValues = {};
    for (const field of detalhe.data.formSchema) {
      initial[field.id] = valorInicial(field);
    }
    setValues(initial);
  }, [detalhe.data]);

  const handleChange = (fieldId: string, value: string | string[]) => {
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

  return (
    <>
      <Sheet open={!!itemId} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden sm:max-w-xl"
        >
          {detalhe.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : !detalhe.data ? (
            <p className="p-4 text-sm text-muted-foreground">Atendimento não encontrado.</p>
          ) : (
            <>
              <SheetHeader className="shrink-0">
                <SheetTitle className="flex items-start gap-2 pr-6 text-base">
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
                  <span className="break-words">{detalhe.data.titulo}</span>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
                <div className="shrink-0 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{detalhe.data.ownerDisplayName}</span>
                  <span aria-hidden>·</span>
                  <span>Editado em {formatDate(detalhe.data.updatedAt)}</span>
                </div>

                <div className="shrink-0 flex flex-wrap gap-1.5">
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

                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
                  {detalhe.data.descricao && (
                    <div className="mb-3 rounded-md border border-institutional/30 bg-institutional/[0.06] p-2.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-institutional">
                        Descrição
                      </p>
                      <p className="whitespace-pre-wrap text-xs text-foreground">
                        {detalhe.data.descricao}
                      </p>
                    </div>
                  )}
                  <FormRenderer fields={detalhe.data.formSchema} values={values} onChange={handleChange} />
                </div>
              </div>

              <SheetFooter className="mt-3 shrink-0 sm:justify-between">
                <p className="text-[10px] text-muted-foreground">
                  As respostas preenchidas aqui não são salvas.
                </p>
                {detalhe.data.canEdit && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </div>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

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
