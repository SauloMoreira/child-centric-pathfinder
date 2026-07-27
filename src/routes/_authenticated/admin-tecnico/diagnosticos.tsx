import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TecnicoPage } from "@/components/tecnico-guard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin-tecnico/diagnosticos")({
  head: () => ({
    meta: [
      { title: "Diagnósticos — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DiagnosticosTecnico,
});

function DiagnosticosTecnico() {
  const q = useQuery({
    queryKey: ["admin-tecnico", "diagnosticos"],
    queryFn: async () => {
      const [{ count: profiles }, { count: vinculos }, { data: defensoresResp }] =
        await Promise.all([
          supabase.from("profiles").select("user_id", { count: "exact", head: true }),
          supabase
            .from("member_defensor_bonds")
            .select("id", { count: "exact", head: true })
            .eq("status", "ativo"),
          supabase.rpc("listar_defensores_disponiveis_contexto"),
        ]);
      const defensores = (defensoresResp as { items?: unknown[] } | null)?.items?.length ?? 0;
      return { defensores, vinculos: vinculos ?? 0, profiles: profiles ?? 0 };
    },
  });

  return (
    <TecnicoPage
      title="Diagnósticos"
      description="Indicadores mínimos de saúde institucional consultados pelo próprio Administrador Técnico via RLS — sem uso de service_role no cliente."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Defensores ativos" value={q.data?.defensores ?? "…"} />
        <Card label="Vínculos de equipe ativos" value={q.data?.vinculos ?? "…"} />
        <Card label="Perfis" value={q.data?.profiles ?? "…"} />
        <Card label="Ambiente" value="Lovable Cloud (US East)" mono />
      </div>
    </TecnicoPage>
  );
}

function Card({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="surface-panel p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-xl ${mono ? "font-mono" : "font-semibold"}`}>{value}</p>
    </div>
  );
}
