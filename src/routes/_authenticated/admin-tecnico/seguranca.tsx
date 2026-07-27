import { createFileRoute } from "@tanstack/react-router";
import { TecnicoPage } from "@/components/tecnico-guard";

export const Route = createFileRoute("/_authenticated/admin-tecnico/seguranca")({
  head: () => ({
    meta: [
      { title: "Segurança — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <TecnicoPage
      title="Segurança e integridade"
      description="Painel consolidado de MFA, sessões, tentativas suspeitas e políticas técnicas. Nenhuma credencial privilegiada é exibida no cliente."
      requireAal2
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-panel p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Autenticação
          </p>
          <p className="mt-2 text-sm">
            Provedor único: e-mail/senha. MFA (TOTP) obrigatório para administradores. Confirmação
            de identidade em ações críticas.
          </p>
        </div>
        <div className="surface-panel p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Sessões
          </p>
          <p className="mt-2 text-sm">
            Sessões anteriores são encerradas na alteração de senha. Bloqueio automático após
            tentativas suspeitas. Nenhum token é armazenado fora do gerenciador do Cloud.
          </p>
        </div>
        <div className="surface-panel p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            RLS
          </p>
          <p className="mt-2 text-sm">
            Acesso global do Administrador Técnico é concedido por policies explícitas — RLS nunca é
            desabilitado.
          </p>
        </div>
        <div className="surface-panel p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Segredos
          </p>
          <p className="mt-2 text-sm">
            service_role permanece exclusivamente no servidor. Nenhuma chave aparece no bundle do
            navegador.
          </p>
        </div>
      </div>
    </TecnicoPage>
  ),
});
