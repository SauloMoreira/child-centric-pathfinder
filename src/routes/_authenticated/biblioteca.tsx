import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search, FileText, Scale } from "lucide-react";
import {
  criarContentItem,
  listarBiblioteca,
  listarCategoriasBiblioteca,
  type ContentKind,
} from "@/lib/reintegra-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca — Reintegra Infância" },
      {
        name: "description",
        content:
          "Biblioteca institucional de modelos de atendimentos e cotas reutilizáveis.",
      },
    ],
  }),
  component: BibliotecaPage,
});

const kindMeta: Record<ContentKind, { label: string; Icon: typeof FileText }> = {
  atendimento: { label: "Atendimento", Icon: FileText },
  cota: { label: "Cota", Icon: Scale },
};

function BibliotecaPage() {
  const [kind, setKind] = useState<ContentKind | "todos">("todos");
  const [categoria, setCategoria] = useState<string>("todas");
  const [query, setQuery] = useState("");
  const [apenasMeus, setApenasMeus] = useState(false);

  const categoriasQuery = useQuery({
    queryKey: ["biblioteca-categorias", kind],
    queryFn: () => listarCategoriasBiblioteca(kind === "todos" ? undefined : kind),
  });

  const itensQuery = useQuery({
    queryKey: ["biblioteca-itens", kind, categoria, query, apenasMeus],
    queryFn: () =>
      listarBiblioteca({
        kind: kind === "todos" ? undefined : kind,
        categoria_id: categoria === "todas" ? undefined : categoria,
        query: query.trim() || undefined,
        apenas_meus: apenasMeus,
      }),
  });

  const itens = itensQuery.data ?? [];
  const categorias = categoriasQuery.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Reintegra · Biblioteca institucional
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-institutional" />
            Biblioteca de atendimentos e cotas
          </h1>
        </div>
        <NovoItemDialog />
      </header>

      <div className="surface-panel mb-6 flex flex-wrap items-center gap-3 p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título ou conteúdo…"
            className="pl-9"
          />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as ContentKind | "todos")}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="atendimento">Atendimentos</SelectItem>
            <SelectItem value="cota">Cotas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={apenasMeus ? "default" : "outline"}
          size="sm"
          onClick={() => setApenasMeus((v) => !v)}
        >
          Somente meus
        </Button>
      </div>

      {itensQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="surface-panel p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum item encontrado. Crie o primeiro modelo para começar.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {itens.map((it) => {
            const { Icon, label } = kindMeta[it.kind];
            return (
              <li key={it.id}>
                <Link
                  to="/biblioteca/$itemId"
                  params={{ itemId: it.id }}
                  className="surface-panel block p-4 transition hover:border-institutional"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-institutional">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium leading-tight">{it.titulo}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {label}
                          {it.categoria_nome ? ` · ${it.categoria_nome}` : ""}
                          {" · "}
                          {it.status}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NovoItemDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ContentKind>("atendimento");
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<string>("nenhuma");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const categoriasQuery = useQuery({
    queryKey: ["biblioteca-categorias", kind],
    queryFn: () => listarCategoriasBiblioteca(kind),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: () =>
      criarContentItem({
        kind,
        titulo: titulo.trim() || "Novo modelo",
        categoria_id: categoria === "nenhuma" ? null : categoria,
        visibility: "privado",
      }),
    onSuccess: (id) => {
      toast.success("Modelo criado");
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
      setOpen(false);
      setTitulo("");
      navigate({ to: "/biblioteca/$itemId", params: { itemId: id } });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao criar"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Novo modelo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo modelo</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ContentKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="atendimento">Atendimento</SelectItem>
                <SelectItem value="cota">Cota</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="titulo-novo">Título</Label>
            <Input
              id="titulo-novo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Cota de vista — pedido de guarda"
              autoFocus
            />
          </div>
          <div>
            <Label>Categoria (opcional)</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Sem categoria</SelectItem>
                {(categoriasQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Criando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
