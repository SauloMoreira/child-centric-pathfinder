import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Loader2, Tags, Trash2 } from "lucide-react";
import { TecnicoPage } from "@/components/tecnico-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { listarCategoriasBiblioteca, type BibliotecaCategoria } from "@/lib/reintegra-api";
import {
  useAdminCriarCategoriaBiblioteca,
  useAdminExcluirCategoriaBiblioteca,
  useAdminRenomearCategoriaBiblioteca,
} from "@/features/cota/hooks";

export const Route = createFileRoute("/_authenticated/admin-tecnico/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CategoriasTecnico,
});

const RESERVED_NAME = "Sem categoria";

/** Mensagens amigáveis para os erros estruturados das RPCs de categoria. */
function mensagemErro(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.includes("CATEGORY_ALREADY_EXISTS")) return "Já existe uma categoria com esse nome.";
  if (msg.includes("RESERVED_NAME") || msg.includes("RESERVED_CATEGORY"))
    return `"${RESERVED_NAME}" é reservado pelo sistema.`;
  if (msg.includes("INVALID_NAME")) return "Informe um nome para a categoria.";
  if (msg.includes("CATEGORY_NOT_FOUND")) return "Categoria não encontrada.";
  if (msg.includes("FORBIDDEN")) return "Apenas o Admin Técnico pode gerenciar categorias.";
  return msg || fallback;
}

function CategoriasTecnico() {
  const [criarOpen, setCriarOpen] = useState(false);
  const [renomeando, setRenomeando] = useState<BibliotecaCategoria | null>(null);
  const [excluindo, setExcluindo] = useState<BibliotecaCategoria | null>(null);

  const categoriasQ = useQuery({
    queryKey: ["biblioteca-categorias"],
    queryFn: () => listarCategoriasBiblioteca(),
  });

  return (
    <TecnicoPage
      title="Categorias"
      description="Categorias usadas para organizar Cotas e Atendimentos na Biblioteca — uma lista única para os dois tipos. Apenas o Admin Técnico pode criá-las ou renomeá-las."
      action={
        <Button size="sm" className="gap-1.5" onClick={() => setCriarOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Nova categoria
        </Button>
      }
    >
      <div className="surface-panel divide-y divide-border">
        {categoriasQ.isLoading && (
          <div className="p-6">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="mt-2 h-4 w-48" />
          </div>
        )}
        {categoriasQ.data && categoriasQ.data.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma categoria criada ainda. Enquanto isso, novos itens caem em "{RESERVED_NAME}".
          </div>
        )}
        {categoriasQ.data?.map((c) => {
          const isReserved = c.nome === RESERVED_NAME;
          return (
            <article key={c.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-2">
                <Tags className="h-4 w-4 shrink-0 text-institutional" aria-hidden />
                <p className="truncate text-sm font-medium">{c.nome}</p>
                {isReserved && (
                  <Badge variant="outline" className="text-[10px]">
                    Padrão do sistema
                  </Badge>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  disabled={isReserved}
                  onClick={() => setRenomeando(c)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Renomear
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={isReserved}
                  onClick={() => setExcluindo(c)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <DialogCriar open={criarOpen} onOpenChange={setCriarOpen} />
      {renomeando && <DialogRenomear categoria={renomeando} onClose={() => setRenomeando(null)} />}
      {excluindo && <DialogExcluir categoria={excluindo} onClose={() => setExcluindo(null)} />}
    </TecnicoPage>
  );
}

function DialogCriar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [nome, setNome] = useState("");
  const criar = useAdminCriarCategoriaBiblioteca();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nome.trim();
    if (!trimmed) return;
    criar.mutate(
      { nome: trimmed },
      {
        onSuccess: () => {
          toast.success("Categoria criada.");
          setNome("");
          onOpenChange(false);
        },
        onError: (e) => toast.error(mensagemErro(e, "Falha ao criar categoria.")),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setNome("");
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription>
              Disponível para todos os Defensores, tanto em Cotas quanto em Atendimentos.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da categoria"
              maxLength={80}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={criar.isPending || !nome.trim()}>
              {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogRenomear({
  categoria,
  onClose,
}: {
  categoria: BibliotecaCategoria;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(categoria.nome);
  const renomear = useAdminRenomearCategoriaBiblioteca();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nome.trim();
    if (!trimmed) return;
    renomear.mutate(
      { categoryId: categoria.id, nome: trimmed },
      {
        onSuccess: () => {
          toast.success("Categoria renomeada.");
          onClose();
        },
        onError: (e) => toast.error(mensagemErro(e, "Falha ao renomear categoria.")),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Renomear categoria</DialogTitle>
            <DialogDescription>
              O novo nome vale para todos os itens já categorizados.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da categoria"
              maxLength={80}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={renomear.isPending || !nome.trim()}>
              {renomear.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogExcluir({
  categoria,
  onClose,
}: {
  categoria: BibliotecaCategoria;
  onClose: () => void;
}) {
  const excluir = useAdminExcluirCategoriaBiblioteca();

  const handleConfirm = () => {
    excluir.mutate(
      { categoryId: categoria.id },
      {
        onSuccess: () => {
          toast.success("Categoria excluída.");
          onClose();
        },
        onError: (e) => {
          toast.error(mensagemErro(e, "Falha ao excluir categoria."));
          onClose();
        },
      },
    );
  };

  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir categoria "{categoria.nome}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Cotas e atendimentos que usam esta categoria serão recategorizados automaticamente
            para "{RESERVED_NAME}". Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={excluir.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={excluir.isPending}
          >
            {excluir.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
