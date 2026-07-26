import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TecnicoPage } from "@/components/tecnico-guard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin-tecnico/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UsuariosTecnico,
});

function UsuariosTecnico() {
  const q = useQuery({
    queryKey: ["admin-tecnico", "profiles"],
    queryFn: async () => {
      // A policy profiles_select_admin autoriza admin_tecnico a consultar todos.
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,nome_completo,matricula,cargo,status,ativo,updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <TecnicoPage
      title="Usuários"
      description="Todos os perfis institucionais registrados. Ações de bloqueio, reativação e reset serão liberadas por RPC administrativa auditada."
    >
      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {q.error && (
        <p className="text-sm text-destructive">
          Falha ao consultar perfis: {(q.error as Error).message}
        </p>
      )}
      {q.data && (
        <div className="surface-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-mono">Nome</th>
                <th className="px-4 py-2 text-left font-mono">Matrícula</th>
                <th className="px-4 py-2 text-left font-mono">Cargo</th>
                <th className="px-4 py-2 text-left font-mono">Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    Nenhum perfil encontrado.
                  </td>
                </tr>
              )}
              {q.data.map((p) => (
                <tr key={p.user_id} className="border-t border-border">
                  <td className="px-4 py-2">{p.nome_completo ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.matricula ?? "—"}</td>
                  <td className="px-4 py-2">{p.cargo ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TecnicoPage>
  );
}
