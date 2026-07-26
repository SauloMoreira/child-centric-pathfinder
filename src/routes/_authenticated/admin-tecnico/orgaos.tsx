import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TecnicoPage } from "@/components/tecnico-guard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrgaoNovoSheet } from "@/components/orgao-novo-sheet";
import { Copy, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useEstadoInstitucional,
  isAdminTecnico,
  isAdminInstitucionalStrict,
} from "@/hooks/use-estado-institucional";

export const Route = createFileRoute("/_authenticated/admin-tecnico/orgaos")({
  head: () => ({
    meta: [
      { title: "Órgãos — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrgaosTecnico,
});

function normalize(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function OrgaosTecnico() {
  const { data: estado } = useEstadoInstitucional();
  const canManage =
    isAdminTecnico(estado) || isAdminInstitucionalStrict(estado);
  const [busca, setBusca] = useState("");

  const q = useQuery({
    queryKey: ["admin-tecnico", "orgaos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id,nome,comarca,created_at,updated_at")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const comarcas = useMemo(
    () =>
      Array.from(new Set((q.data ?? []).map((o) => o.comarca))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [q.data],
  );

  const filtrados = useMemo(() => {
    const n = normalize(busca);
    if (!n) return q.data ?? [];
    return (q.data ?? []).filter(
      (o) =>
        normalize(o.nome).includes(n) || normalize(o.comarca).includes(n),
    );
  }, [q.data, busca]);

  return (
    <TecnicoPage
      title="Órgãos de execução"
      description="Cadastro institucional de órgãos. Cada órgão possui identificador interno único e não pode ser duplicado na mesma comarca."
      action={
        canManage ? <OrgaoNovoSheet comarcasSugeridas={comarcas} /> : undefined
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou comarca…"
            className="pl-8"
          />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {filtrados.length} de {q.data?.length ?? 0}
        </p>
      </div>

      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {q.data && filtrados.length === 0 && (
        <div className="surface-panel p-8 text-center text-sm text-muted-foreground">
          {q.data.length === 0
            ? "Nenhum órgão cadastrado ainda."
            : "Nenhum órgão corresponde à busca."}
          {canManage && q.data.length === 0 && " Use “Novo órgão” para começar."}
        </div>
      )}
      {filtrados.length > 0 && (
        <div className="surface-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-mono">Órgão de execução</th>
                <th className="px-4 py-2 text-left font-mono">Comarca</th>
                <th className="px-4 py-2 text-left font-mono">Criado em</th>
                <th className="px-4 py-2 text-left font-mono">ID interno</th>
                {canManage && (
                  <th className="px-4 py-2 text-right font-mono">Ações</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((o) => (
                <tr key={o.id} className="border-t border-border align-middle">
                  <td className="px-4 py-2">{o.nome}</td>
                  <td className="px-4 py-2">{o.comarca}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(o.id);
                        toast.success("ID copiado.");
                      }}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                      title={o.id}
                    >
                      <Copy className="h-3 w-3" aria-hidden />
                      {o.id.slice(0, 8)}…
                    </button>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <OrgaoNovoSheet
                        mode="edit"
                        orgao={{
                          id: o.id,
                          nome: o.nome,
                          comarca: o.comarca,
                        }}
                        comarcasSugeridas={comarcas}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Editar
                          </Button>
                        }
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TecnicoPage>
  );
}
