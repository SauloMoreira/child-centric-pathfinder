import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstadoInstitucional, isAdmin } from "@/hooks/use-estado-institucional";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/orgaos")({
  head: () => ({
    meta: [
      { title: "Órgãos de execução — Reintegra Infância" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrgaosAdmin,
});

function OrgaosAdmin() {
  const { data: estado, isLoading: le } = useEstadoInstitucional();

  const orgaosQ = useQuery({
    queryKey: ["orgaos-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id,nome,sigla,comarca,cidade,uf,ativo,created_at")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin(estado),
  });

  if (le) return <div className="p-8"><Skeleton className="h-8 w-64" /></div>;
  if (!isAdmin(estado)) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="surface-panel p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-6 w-6 text-destructive" aria-hidden />
            <div>
              <h1 className="text-lg font-semibold">Acesso restrito</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Esta área é exclusiva do Administrador Institucional.
              </p>
            </div>
          </div>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/painel">Voltar ao painel</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Administração institucional
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Órgãos de execução</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Unidades cadastradas da DPE-RS. Novos órgãos são criados durante a
            aprovação de solicitações de acesso que os propõem.
          </p>
        </div>
      </header>

      <div className="mt-6 surface-panel overflow-hidden">
        {orgaosQ.isLoading ? (
          <div className="p-6"><Skeleton className="h-6 w-full" /></div>
        ) : orgaosQ.data && orgaosQ.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Nenhum órgão cadastrado</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Órgãos serão criados quando o Administrador aprovar solicitações
              com proposta de novo órgão.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-canvas/40 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Sigla</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Comarca / cidade</th>
                <th className="px-4 py-3">UF</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orgaosQ.data?.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-mono">{o.sigla}</td>
                  <td className="px-4 py-3">{o.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[o.comarca, o.cidade].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">{o.uf}</td>
                  <td className="px-4 py-3">
                    {o.ativo ? (
                      <span className="rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-[11px]">
                        Ativo
                      </span>
                    ) : (
                      <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        Inativo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
