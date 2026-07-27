import { createFileRoute, Link } from "@tanstack/react-router";
import { TecnicoPage } from "@/components/tecnico-guard";
import {
  Users,
  Building2,
  ScrollText,
  Siren,
  ShieldCheck,
  Activity,
  Lock,
  Sliders,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-tecnico/painel")({
  head: () => ({
    meta: [
      { title: "Central técnica — Ágora" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PainelTecnico,
});

const modulos = [
  { to: "/admin-tecnico/usuarios", label: "Usuários", icon: Users, desc: "Consultar, bloquear e reativar contas." },
  { to: "/admin-tecnico/administradores", label: "Administradores", icon: ShieldCheck, desc: "Promoções técnicas e institucionais." },
  { to: "/admin-tecnico/orgaos", label: "Órgãos", icon: Building2, desc: "Criar, editar, ativar e inativar órgãos." },
  { to: "/admin-tecnico/vinculos", label: "Vínculos", icon: Users, desc: "Corrigir vínculos institucionais." },
  { to: "/admin-tecnico/seguranca", label: "Segurança", icon: Lock, desc: "MFA, sessões, políticas técnicas." },
  { to: "/admin-tecnico/auditoria", label: "Auditoria", icon: ScrollText, desc: "Consulta global append-only." },
  { to: "/admin-tecnico/configuracoes", label: "Configurações", icon: Sliders, desc: "Políticas funcionais da aplicação." },
  { to: "/admin-tecnico/diagnosticos", label: "Diagnósticos", icon: Activity, desc: "Saúde do backend e integridade." },
  { to: "/admin-tecnico/acesso-emergencial", label: "Acesso emergencial", icon: Siren, desc: "Break-glass com auditoria obrigatória." },
] as const;

function PainelTecnico() {
  return (
    <TecnicoPage
      title="Central técnica"
      description="Ponto único de operação técnica do Ágora. Acesso global, ações auditadas, MFA obrigatório para operações sensíveis."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modulos.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.to}
              to={m.to}
              className="surface-panel group flex flex-col gap-2 p-4 transition-colors hover:border-institutional/60"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-institutional" aria-hidden />
                <p className="text-sm font-medium">{m.label}</p>
              </div>
              <p className="text-xs text-muted-foreground">{m.desc}</p>
            </Link>
          );
        })}
      </div>
    </TecnicoPage>
  );
}
