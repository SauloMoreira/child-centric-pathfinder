import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, Users, LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ágora" },
      {
        name: "description",
        content:
          "Ágora - sistema de Formulários e cotas",
      },
      { property: "og:title", content: "Ágora" },
      {
        property: "og:description",
        content:
          "Ágora - sistema de Formulários e cotas",
      },
    ],
  }),
  component: PublicLanding,
});

function PublicLanding() {
  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="h-8 w-8 rounded-md bg-sidebar"
              style={{ boxShadow: "inset 0 0 0 2px var(--color-institutional)" }}
            />
            <div className="leading-tight">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                DPE-RS
              </p>
              <p className="text-sm font-semibold">Ágora</p>
            </div>
          </div>
          <Link
            to="/auth"
            search={{}}
            className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Acessar sistema <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <section>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Plataforma institucional · uso interno
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Plataforma colaborativa de atendimentos e cotas da Defensoria
              Pública.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              Espaço institucional para criar, organizar e utilizar modelos
              reutilizáveis de atendimento e cotas. O acesso é concedido
              mediante aprovação institucional.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                search={{}}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Entrar com e-mail institucional
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/auth"
                search={{ modo: "cadastro" }}
                className="inline-flex items-center rounded-md border border-border-strong bg-surface px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                Solicitar acesso institucional
              </Link>
            </div>

            <p className="mt-6 max-w-xl text-xs text-muted-foreground">
              Somente servidores com e-mail institucional válido e vínculo
              funcional aprovado podem operar o sistema. Todo acesso é
              registrado em auditoria.
            </p>
          </section>

          <aside className="surface-panel p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Fase 1 · Fundação
            </p>
            <h2 className="mt-2 text-lg font-semibold">O que já está ativo</h2>
            <ul className="mt-4 space-y-4 text-sm">
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-institutional" aria-hidden />
                <div>
                  <p className="font-medium">Autenticação institucional</p>
                  <p className="text-muted-foreground">
                    E-mail e senha, confirmação de e-mail, recuperação, MFA
                    obrigatório para administradores.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <Users className="mt-0.5 h-5 w-5 text-institutional" aria-hidden />
                <div>
                  <p className="font-medium">Aprovação institucional</p>
                  <p className="text-muted-foreground">
                    Novos usuários passam por revisão do Administrador
                    Institucional antes de operar o sistema.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <LayoutDashboard className="mt-0.5 h-5 w-5 text-institutional" aria-hidden />
                <div>
                  <p className="font-medium">Prévia do centro de comando</p>
                  <p className="text-muted-foreground">
                    Quadro Kanban estrutural pronto para receber os módulos
                    operacionais nas próximas fases.
                  </p>
                </div>
              </li>
            </ul>
          </aside>
        </div>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} Defensoria Pública do Estado do Rio
            Grande do Sul.
          </p>
          <p className="font-mono uppercase tracking-[0.18em]">
            Dados fictícios · homologação institucional
          </p>
        </div>
      </footer>
    </div>
  );
}
