import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Printer,
  Save,
  Share2,
  Archive,
  CheckCircle2,
} from "lucide-react";
import {
  arquivarItem,
  atualizarRascunho,
  obterItemBiblioteca,
  publicarVersao,
  type ContentVisibility,
} from "@/lib/reintegra-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/biblioteca/$itemId")({
  head: () => ({
    meta: [
      { title: "Editar modelo — Reintegra Infância" },
      { name: "description", content: "Edição de modelo institucional da biblioteca." },
    ],
  }),
  component: ItemEditor,
});

function ItemEditor() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const itemQuery = useQuery({
    queryKey: ["biblioteca-item", itemId],
    queryFn: () => obterItemBiblioteca(itemId),
  });

  const item = itemQuery.data;

  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [visibility, setVisibility] = useState<ContentVisibility>("privado");
  const initialized = useRef(false);

  useEffect(() => {
    if (item && !initialized.current) {
      setTitulo(item.titulo ?? "");
      const bj = item.body_json as { text?: string } | null;
      setTexto(bj?.text ?? "");
      setVisibility(item.visibility);
      initialized.current = true;
    }
  }, [item]);

  const salvar = useMutation({
    mutationFn: () =>
      atualizarRascunho({
        item_id: itemId,
        titulo: titulo.trim() || "(sem título)",
        body_json: { text: texto },
        body_text: texto,
      }),
    onSuccess: () => {
      toast.success("Rascunho salvo");
      qc.invalidateQueries({ queryKey: ["biblioteca-item", itemId] });
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const publicar = useMutation({
    mutationFn: () => publicarVersao({ item_id: itemId, visibility }),
    onSuccess: () => {
      toast.success("Versão publicada");
      qc.invalidateQueries({ queryKey: ["biblioteca-item", itemId] });
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao publicar"),
  });

  const arquivar = useMutation({
    mutationFn: () => arquivarItem(itemId),
    onSuccess: () => {
      toast.success("Modelo arquivado");
      navigate({ to: "/biblioteca" });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao arquivar"),
  });

  const kindLabel = useMemo(
    () => (item?.kind === "cota" ? "Cota" : "Atendimento"),
    [item?.kind],
  );

  if (itemQuery.isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!item) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Modelo não encontrado.</p>
        <Button asChild variant="ghost" className="mt-4">
          <Link to="/biblioteca"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/biblioteca">
            <ArrowLeft className="h-4 w-4 mr-2" /> Biblioteca
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => arquivar.mutate()}
            disabled={arquivar.isPending}
          >
            <Archive className="h-4 w-4 mr-2" /> Arquivar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {salvar.isPending ? "Salvando…" : "Salvar rascunho"}
          </Button>
          <Button size="sm" onClick={() => publicar.mutate()} disabled={publicar.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {publicar.isPending ? "Publicando…" : "Publicar"}
          </Button>
        </div>
      </div>

      <div className="surface-panel p-6 print:border-none print:p-0 print:shadow-none">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground print:hidden">
          {kindLabel}
          {item.categoria_nome ? ` · ${item.categoria_nome}` : ""}
          {" · "}
          {item.status} · v{item.version_number}
        </p>

        <div className="mt-4 grid gap-4">
          <div>
            <Label htmlFor="titulo" className="print:hidden">Título</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="text-lg font-medium print:border-none print:bg-transparent print:px-0 print:text-2xl"
            />
          </div>

          <div>
            <Label htmlFor="texto" className="print:hidden">Conteúdo</Label>
            <Textarea
              id="texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={18}
              placeholder="Escreva aqui o modelo. Nenhum dado pessoal deve ser preenchido — este é um modelo institucional reutilizável."
              className="font-serif text-[15px] leading-relaxed print:border-none print:bg-transparent print:p-0"
            />
          </div>

          <div className="flex items-end gap-3 print:hidden">
            <div className="flex-1 max-w-xs">
              <Label>Visibilidade ao publicar</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as ContentVisibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="privado">Privado (só eu)</SelectItem>
                  <SelectItem value="orgao">Órgão atual</SelectItem>
                  <SelectItem value="institucional">Institucional (toda a DPE)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              <Share2 className="inline h-3 w-3 mr-1" />
              Ao publicar, uma nova versão imutável é registrada.
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground print:hidden">
        Modelos institucionais não devem conter nomes, CPFs, endereços ou
        quaisquer dados pessoais de assistidos.
      </p>
    </div>
  );
}
