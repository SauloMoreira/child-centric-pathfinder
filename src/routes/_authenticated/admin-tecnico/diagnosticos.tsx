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
      const [{ count: orgaos }, { count: profiles }] = await Promise.all([
        supabase.from("orgaos_execucao").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("user_id", { count: "exact", head: true }),
      ]);
      return { orgaos: orgaos ?? 0, profiles: profiles ?? 0 };
    },
  });

  return (
    <TecnicoPage
      title="Diagnósticos"
      description="Indicadores mínimos de saúde institucional consultados pelo próprio Administrador Técnico via RLS — sem uso de service_role no cliente."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Órgãos" value={q.data?.orgaos ?? "…"} />
        <Card label="Perfis" value={q.data?.profiles ?? "…"} />
        <Card label="Ambiente" value="Lovable Cloud (US East)" mono />
      </div>
    </TecnicoPage>
  );
}

function Card({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="surface-panel p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-xl ${mono ? "font-mono" : "font-semibold"}`}>
        {value}
      </p>
    </div>
  );
}
