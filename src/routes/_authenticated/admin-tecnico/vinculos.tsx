import { createFileRoute } from "@tanstack/react-router";
import { TecnicoPage } from "@/components/tecnico-guard";

export const Route = createFileRoute("/_authenticated/admin-tecnico/vinculos")({
  head: () => ({
    meta: [
      { title: "Vínculos — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <TecnicoPage
      title="Vínculos institucionais"
      description="Correção controlada de vínculos usuário↔órgão. Toda alteração exige MFA e é registrada em auditoria."
      requireAal2
    >
      <div className="surface-panel p-6 text-sm text-muted-foreground">
        Interface operacional será liberada na Fase 2 junto com o módulo de movimentações
        institucionais. A RPC de correção de vínculo já está prevista no roteiro e será acionada
        exclusivamente por esta tela.
      </div>
    </TecnicoPage>
  ),
});
