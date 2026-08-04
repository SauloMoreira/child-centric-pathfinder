import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  FileSymlink,
  Info,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Settings2,
  Star,
  StickyNote,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { RichTextViewer, sanitizeCotaHtml } from "@/components/cota/rich-text-editor";
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
  // Ajuste doc (AJUSTE 21) — lupas de aumentar/diminuir o texto da cota;
  // o tamanho escolhido persiste para o usuário (localStorage, preferência
  // só de exibição, nada sensível) em novas aberturas da layer.
  const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.45];
  const [zoomIndex, setZoomIndex] = useState(() => {
    const salvo = Number(localStorage.getItem("agora-cota-zoom-index"));
    return Number.isInteger(salvo) && salvo >= 0 && salvo < ZOOM_STEPS.length ? salvo : 1;
  });
  const alterarZoom = (delta: number) => {
    setZoomIndex((prev) => {
      const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, prev + delta));
      localStorage.setItem("agora-cota-zoom-index", String(next));
      return next;
    });
  };
  // Ajuste doc (AJUSTE 25) — lê o texto AO VIVO (já com eventuais
  // preenchimentos feitos pelo usuário nos trechos editáveis) na hora de
  // copiar, em vez do texto original armazenado.
  const textoRef = useRef<HTMLDivElement>(null);
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
      // Ajuste doc (AJUSTE 25) — copia o texto AO VIVO (já refletindo
      // eventuais preenchimentos nos trechos editáveis); cai para o texto
      // original armazenado se, por algum motivo, a referência não
      // estiver disponível ainda.
      const html = textoRef.current?.innerHTML ?? (detalhe.data.bodyJson as { html?: string } | null)?.html ?? null;
      const text = textoRef.current?.innerText ?? detalhe.data.bodyText;
      await copyRichText(html, text);
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

                <div className="kanban-scroll relative min-h-0 flex-1 overflow-y-auto">
                  {/* Ajuste doc (AJUSTE 15) — o limite da borda deve
                      acompanhar só a altura natural do texto, em vez de
                      esticar até o fim do espaço disponível (por isso o
                      border/bg fica só neste wrapper interno, e o flex-1 +
                      overflow-y-auto ficam no wrapper externo). */}
                  <div
                    style={{ fontSize: `${ZOOM_STEPS[zoomIndex]}em` }}
                    className="rounded-md border border-border bg-muted/30 p-3"
                  >
                    <RichTextViewer
                      ref={textoRef}
                      html={(detalhe.data.bodyJson as { html?: string } | null)?.html ?? ""}
                      interactive
                    />
                  </div>

                  {/* Ajuste doc (AJUSTE 15) — a orientação (quando existente)
                      fica fora dos limites da borda/caixa do texto, após o
                      texto e antes dos links sugeridos. */}
                  {detalhe.data.orientacao && (
                    <div
                      className={cn(
                        "mt-3 flex items-start gap-2 rounded-md border p-2.5",
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
                      <p
                        className="whitespace-pre-wrap text-xs text-foreground"
                        dangerouslySetInnerHTML={{ __html: sanitizeCotaHtml(detalhe.data.orientacao) }}
                      />
                    </div>
                  )}

                  <div className="sticky bottom-0 left-0 flex justify-end gap-0.5 pt-1">
                    <button
                      type="button"
                      className="rounded bg-surface/80 p-1 text-muted-foreground opacity-60 backdrop-blur-sm hover:bg-muted hover:text-foreground hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Diminuir texto"
                      title="Diminuir texto"
                      disabled={zoomIndex === 0}
                      onClick={() => alterarZoom(-1)}
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded bg-surface/80 p-1 text-muted-foreground opacity-60 backdrop-blur-sm hover:bg-muted hover:text-foreground hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Aumentar texto"
                      title="Aumentar texto"
                      disabled={zoomIndex === ZOOM_STEPS.length - 1}
                      onClick={() => alterarZoom(1)}
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label="Opções da cota"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={onEdit}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                      </DropdownMenuItem>
                      {onInspire && (
                        <DropdownMenuItem onClick={onInspire}>
                          <FileSymlink className="mr-2 h-3.5 w-3.5" /> Criar nova a partir desta
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
