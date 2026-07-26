import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import {
  LayoutDashboard,
  UserCircle2,
  ShieldCheck,
  Building2,
  ClipboardList,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  useEstadoInstitucional,
  isAdmin,
  isAtivo,
} from "@/hooks/use-estado-institucional";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  visible: boolean;
};

export function AppShell({ children }: { children: ReactNode }) {
  const { data: estado } = useEstadoInstitucional();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const router = useRouterState();
  const pathname = router.location.pathname;

  const nav = useMemo<NavItem[]>(
    () => [
      {
        to: "/painel",
        label: "Painel",
        icon: LayoutDashboard,
        visible: true,
      },
      {
        to: "/solicitar-acesso",
        label: "Solicitar acesso",
        icon: ClipboardList,
        visible: !isAtivo(estado),
      },
      {
        to: "/conta",
        label: "Minha conta",
        icon: UserCircle2,
        visible: true,
      },
      {
        to: "/admin/solicitacoes",
        label: "Solicitações",
        icon: ShieldCheck,
        visible: isAdmin(estado),
      },
      {
        to: "/admin/orgaos",
        label: "Órgãos de execução",
        icon: Building2,
        visible: isAdmin(estado),
      },
    ],
    [estado],
  );

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nome =
    estado?.profile?.nome_completo ??
    (estado?.user_id ? "Usuário institucional" : "");
  const initials = (nome || "US")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside
        className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex"
        aria-label="Navegação principal"
      >
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <Link to="/painel" className="flex items-center gap-3">
            <div
              aria-hidden
              className="h-7 w-7 rounded-md bg-sidebar-accent"
              style={{ boxShadow: "inset 0 0 0 2px var(--color-institutional)" }}
            />
            <div className="leading-tight">
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-sidebar-muted">
                DPE-RS
              </p>
              <p className="text-sm font-semibold">Reintegra Infância</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {nav
            .filter((n) => n.visible)
            .map((item) => {
              const active =
                pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="flex-1 truncate">{item.label}</span>
                  {active && <ChevronRight className="h-4 w-4" aria-hidden />}
                </Link>
              );
            })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{nome || "—"}</p>
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-muted">
                {estado?.orgao_ativo?.sigla ?? "sem vínculo ativo"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="mt-1 w-full justify-start gap-2 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Encerrar sessão
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 lg:px-8">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Defensoria Pública do RS
            </p>
            <p className="truncate text-sm font-medium text-foreground">
              {estado?.orgao_ativo
                ? `${estado.orgao_ativo.nome} · ${estado.orgao_ativo.sigla}`
                : "Vínculo institucional pendente"}
            </p>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <StatusChip estado={estado} />
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function StatusChip({
  estado,
}: {
  estado: ReturnType<typeof useEstadoInstitucional>["data"];
}) {
  const status = estado?.profile?.status ?? "aguardando_dados";
  const label: Record<string, string> = {
    aguardando_dados: "Aguardando dados funcionais",
    aguardando_aprovacao: "Aguardando aprovação institucional",
    ativo: "Ativo",
    suspenso: "Suspenso",
    inativo: "Inativo",
  };
  const tone: Record<string, string> = {
    aguardando_dados: "bg-muted text-muted-foreground border-border",
    aguardando_aprovacao: "bg-warning/10 text-warning-foreground border-warning/40",
    ativo: "bg-success/10 text-success-foreground border-success/40",
    suspenso: "bg-destructive/10 text-destructive-foreground border-destructive/40",
    inativo: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
        tone[status],
      )}
    >
      {label[status] ?? status}
    </span>
  );
}
