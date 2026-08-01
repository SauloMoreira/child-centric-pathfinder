import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Info, Link as LinkIcon, Loader2, Pencil, Sparkles, Star, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { alternarFavoritoBiblioteca, obterFavoritoBiblioteca } from "@/lib/reintegra-api";
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
import { cn, copyRichText } from "@/lib/utils";

interface CotaDetailSheetProps {
  itemId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDeleted: () => void;
  /** Ajuste doc (AJUSTE 10) — "Inspirar novo": abre a criação de uma
   *  cota nova herdando texto e orientação desta. */
  onInspire?: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { dateStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Camada lateral expandida de detalhe da Cota: título, autor, categoria(s),
 * texto, data da última edição, copiar, editar (autor) e excluir
 * permanentemente com confirmação (autor).
 */
export function CotaDetailSheet({ itemId, onOpenChange, onEdit, onDeleted, onInspire }: CotaDetailSheetProps) {
  const detalhe = useCotaDetalhe(itemId);
  const excluir = useExcluirCota();
  const qc = useQueryClient();
  // Ajuste doc — estrelinha de favorito também dentro da Cota.
  const favoritoQuery = useQuery({
    queryKey: ["biblioteca-favorito", itemId],
    queryFn: () => obterFavoritoBiblioteca(itemId as string),
    enabled: !!itemId,
  });
  const favoritar = useMutation({
    mutationFn: () => alternarFavoritoBiblioteca(itemId as string),
    onSuccess: (res) => {
      qc.setQueryData(["biblioteca-favorito", itemId], res);
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
    },
    onError: () => toast.error("Não foi possível atualizar o favorito"),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleCopy = async () => {
    if (!detalhe.data) return;
    try {
      const html = (detalhe.data.bodyJson as { html?: string } | null)?.html ?? null;
      await copyRichText(html, detalhe.data.bodyText);
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
          className="flex h-full w-full flex-col gap-0 overflow-hidden sm:max-w-lg"
        >
          {detalhe.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : !detalhe.data ? (
            <p className="p-4 text-sm text-muted-foreground">Cota não encontrada.</p>
          ) : (
            <>
              <SheetHeader className="shrink-0">
                <SheetTitle className="flex items-start gap-2 pr-6 text-base">
                  <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" />
                  <span className="min-w-0 flex-1 break-words">{detalhe.data.titulo}</span>
                  <button
                    type="button"
                    onClick={() => favoritar.mutate()}
                    disabled={favoritar.isPending || !itemId}
                    aria-label={favoritoQuery.data?.is_favorited ? "Desfavoritar" : "Favoritar"}
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded p-1 text-xs font-normal transition hover:bg-muted",
                      favoritoQuery.data?.is_favorited ? "text-warning" : "text-muted-foreground",
                    )}
                  >
                    <Star
                      className={cn("h-3.5 w-3.5", favoritoQuery.data?.is_favorited && "fill-current")}
                      aria-hidden
                    />
                    {favoritoQuery.data?.favorite_count ?? 0}
                  </button>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
                <div className="shrink-0 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>
                    <span className="font-semibold text-foreground">Autor(a):</span>{" "}
                    {detalhe.data.ownerDisplayName}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{formatDate(detalhe.data.updatedAt)}</span>
                  {detalhe.data.categorias.length === 0 ? (
                    <>
                      <span aria-hidden>·</span>
                      <Badge variant="outline" className="text-[10px]">
                        Sem categoria
                      </Badge>
                    </>
                  ) : (
                    <>
                      <span aria-hidden>·</span>
                      {detalhe.data.categorias.map((c) => (
                        <Badge key={c.id} variant="outline" className="text-[10px]">
                          {c.nome}
                        </Badge>
                      ))}
                    </>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
                  {detalhe.data.orientacao && (
                    <div
                      className={cn(
                        "mb-3 flex items-start gap-2 rounded-md border p-2.5",
                        detalhe.data.orientacaoNivel === "alta"
                          ? "border-critical/30 bg-critical/[0.1]"
                          : "border-warning/30 bg-warning/[0.1]",
                      )}
                    >
                      <Info
                        className={cn(
                          "mt-0.5 h-3.5 w-3.5 shrink-0",
                          detalhe.data.orientacaoNivel === "alta" ? "text-critical" : "text-warning",
                        )}
                        aria-hidden
                      />
                      <p className="whitespace-pre-wrap text-xs text-foreground">
                        {detalhe.data.orientacao}
                      </p>
                    </div>
                  )}
                  <RichTextViewer
                    html={(detalhe.data.bodyJson as { html?: string } | null)?.html ?? ""}
                  />
                </div>
              </div>

              {/* Ajuste doc (AJUSTE 17) — links sugeridos, ao final da
                  página, antes dos botões. */}
              {detalhe.data.links.length > 0 && (
                <div className="mt-3 shrink-0 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Links sugeridos
                  </p>
                  <ul className="space-y-1">
                    {detalhe.data.links.map((link, i) => (
                      <li key={i}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-1.5 text-xs text-institutional hover:underline"
                        >
                          <LinkIcon className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">{link.titulo}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <SheetFooter className="mt-3 shrink-0 sm:justify-between">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
                  <Copy className="h-3.5 w-3.5" /> Copiar texto
                </Button>
                {detalhe.data.canEdit && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    {onInspire && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={onInspire}>
                        <Sparkles className="h-3.5 w-3.5" /> Criar a nova partir desta
                      </Button>
                    )}
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
