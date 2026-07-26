import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TecnicoPage } from "@/components/tecnico-guard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { OrgaoNovoSheet } from "@/components/orgao-novo-sheet";
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

function OrgaosTecnico() {
  const { data: estado } = useEstadoInstitucional();
  const canCreate =
    isAdminTecnico(estado) || isAdminInstitucionalStrict(estado);

  const q = useQuery({
    queryKey: ["admin-tecnico", "orgaos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id,nome,sigla,comarca,cidade,uf,ativo,created_at")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  return (
    <TecnicoPage
      title="Órgãos de execução"
      description="Consulta global de órgãos, inclusive inativos. Criação direta reservada ao Administrador Técnico (com MFA) e Institucional."
      action={canCreate ? <OrgaoNovoSheet /> : undefined}
    >
      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {q.data && q.data.length === 0 && (
        <div className="surface-panel p-8 text-center text-sm text-muted-foreground">
          Nenhum órgão cadastrado ainda.
          {canCreate && " Use “Novo órgão” para começar."}
        </div>
      )}
      {q.data && q.data.length > 0 && (
        <div className="surface-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-mono">Sigla</th>
                <th className="px-4 py-2 text-left font-mono">Nome</th>
                <th className="px-4 py-2 text-left font-mono">Comarca / Município</th>
                <th className="px-4 py-2 text-left font-mono">Situação</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">
                    {o.sigla ?? "—"}
                  </td>
                  <td className="px-4 py-2">{o.nome}</td>
                  <td className="px-4 py-2">
                    {[o.comarca, o.cidade].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {o.ativo ? "ativo" : "inativo"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TecnicoPage>
  );
}
