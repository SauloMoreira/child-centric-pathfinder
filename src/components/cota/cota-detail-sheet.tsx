import { useState } from "react";
import { Copy, Loader2, Pencil, Scale, Trash2 } from "lucide-react";
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
import { RichTextViewer } from "@/components/cota/rich-text-editor";
import { useCotaDetalhe, useExcluirCota, mensagemErroCota } from "@/features/cota/hooks";

interface CotaDetailSheetProps {
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
 * Camada lateral expandida de detalhe da Cota: título, autor, categoria(s),
 * texto, data da última edição, copiar, editar (autor) e excluir
 * permanentemente com confirmação (autor).
 */
export function CotaDetailSheet({ itemId, onOpenChange, onEdit, onDeleted }: CotaDetailSheetProps) {
  const detalhe = useCotaDetalhe(itemId);
  const excluir = useExcluirCota();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleCopy = async () => {
    if (!detalhe.data) return;
    try {
      await navigator.clipboard.writeText(detalhe.data.bodyText);
      toast.success("Texto da cota copiado");
    } catch {
      toast.error("Não foi possível copiar o texto");
    }
  };

  const handleDelete = () => {
    if (!detalhe.data) return;
    excluir.mutate(
      { itemId: detalhe.data.id, expectedVersion: detalhe.data.optimisticVersion },
      {
        onSuccess: () => {
          toast.success("Cota excluída permanentemente");
          setConfirmDelete(false);
          onOpenChange(false);
          onDeleted();
        },
        onError: (e) => {
          toast.error(mensagemErroCota(e, "Falha ao excluir a cota"));
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
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
        >
          {detalhe.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : !detalhe.data ? (
            <p className="p-4 text-sm text-muted-foreground">Cota não encontrada.</p>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-start gap-2 pr-6">
                  <Scale className="mt-0.5 h-4 w-4 shrink-0 text-institutional" />
                  <span className="break-words">{detalhe.data.titulo}</span>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{detalhe.data.ownerDisplayName}</span>
                  <span aria-hidden>·</span>
                  <span>Editado em {formatDate(detalhe.data.updatedAt)}</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
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

                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <RichTextViewer
                    html={(detalhe.data.bodyJson as { html?: string } | null)?.html ?? ""}
                  />
                </div>
              </div>

              <SheetFooter className="mt-6 sm:justify-between">
                <Button variant="outline" className="gap-2" onClick={handleCopy}>
                  <Copy className="h-4 w-4" /> Copiar texto
                </Button>
                {detalhe.data.canEdit && (
                  <div className="flex gap-2">
                    <Button variant="outline" className="gap-2" onClick={onEdit}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
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
            <AlertDialogTitle>Excluir cota permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A cota "{detalhe.data?.titulo}" será removida de
              todos os Painéis e deixará de estar disponível para sua equipe.
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
