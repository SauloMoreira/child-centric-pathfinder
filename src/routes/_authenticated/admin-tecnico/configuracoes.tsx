import { createFileRoute } from "@tanstack/react-router";
import { TecnicoPage } from "@/components/tecnico-guard";

export const Route = createFileRoute("/_authenticated/admin-tecnico/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <TecnicoPage
      title="Configurações técnicas"
      description="Políticas funcionais da aplicação, catálogos e parâmetros institucionais. Toda alteração é auditada."
      requireAal2
    >
      <div className="surface-panel p-6 text-sm text-muted-foreground">
        Interface de configurações e catálogos entrará na Fase 2. As tabelas de suporte serão
        criadas por migrations versionadas e alteradas exclusivamente por RPC administrativa.
      </div>
    </TecnicoPage>
  ),
});
