import { createFileRoute } from "@tanstack/react-router";
import { TecnicoPage } from "@/components/tecnico-guard";

export const Route = createFileRoute("/_authenticated/admin-tecnico/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <TecnicoPage
      title="Auditoria global"
      description="Consulta append-only aos eventos institucionais. Nem o Administrador Técnico pode editar, excluir ou alterar autor, data ou correlation ID."
    >
      <div className="surface-panel p-6 text-sm text-muted-foreground">
        Consulta consolidada será liberada com a Fase 2 (visão paginada por
        entidade, ator, órgão, resultado e correlation ID). Os eventos já são
        registrados em <code className="font-mono">private.audit_events</code>{" "}
        e podem ser inspecionados pelo operador autorizado via banco.
      </div>
    </TecnicoPage>
  ),
});
