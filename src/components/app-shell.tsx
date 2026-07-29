import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, type ReactNode } from "react";
import {
  LayoutDashboard,
  UserCircle2,
  ShieldCheck,
  ClipboardList,
  LogOut,
  ChevronRight,
  Terminal,
  UsersRound,
  Siren,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import {
  useEstadoInstitucional,
  isAdmin,
  isAdminTecnico,
  isAdminInstitucionalStrict,
  isDefensor,
  isAtivo,
} from "@/hooks/use-estado-institucional";
import { cn } from "@/lib/utils";
import { SidebarProvider, useSidebarState } from "@/components/app-shell/sidebar-context";
import { DefenderContextSwitcher } from "@/components/app-shell/defender-context-switcher";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  visible: boolean;
};

type NavGroup = {
  id: string;
  label: string | null;
  variant?: "default" | "tecnica";
  items: NavItem[];
};

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <TooltipProvider delayDuration={200}>
        <AppShellInner>{children}</AppShellInner>
      </TooltipProvider>
    </SidebarProvider>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  const { data: estado } = useEstadoInstitucional();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const router = useRouterState();
  const pathname = router.location.pathname;
  const { collapsed, mobileOpen, setMobileOpen, isMobile } = useSidebarState();

  const tecnico = isAdminTecnico(estado);
  const institucional = isAdminInstitucionalStrict(estado);
  const defensor = isDefensor(estado);
  const ativo = isAtivo(estado);

  const groups = useMemo<NavGroup[]>(
    () => [
      {
        id: "operacional",
        label: "Trabalho",
        items: [
          {
            to: "/area-de-trabalho",
            label: "Área de trabalho",
            icon: LayoutDashboard,
            visible: true,
          },
          { to: "/biblioteca", label: "Biblioteca", icon: BookOpen, visible: true },
          {
            to: "/minha-equipe",
            label: "Minha equipe",
            icon: UsersRound,
            visible: (defensor || tecnico) && ativo,
          },
          {
            to: "/solicitar-acesso",
            label: "Solicitar acesso",
            icon: ClipboardList,
            visible: !isAtivo(estado),
          },
          { to: "/conta", label: "Minha conta", icon: UserCircle2, visible: true },
        ],
      },
      {
        id: "institucional",
        label: "Administração Institucional",
        items: [
          {
            to: "/admin/solicitacoes",
            label: "Solicitações",
            icon: ShieldCheck,
            visible: institucional || tecnico,
          },
        ],
      },
      {
        id: "tecnica",
        label: "Administração Técnica",
        variant: "tecnica",
        items: [
          {
            to: "/admin-tecnico/painel",
            label: "Central técnica",
            icon: Terminal,
            visible: tecnico,
          },
        ],
      },
    ],
    [estado, institucional, tecnico, defensor, ativo],
  );

  // Fecha o drawer mobile a cada navegação.
  useEffect(() => {
    if (mobileOpen) setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: {}, replace: true });
  }

  const nome = estado?.profile?.nome_completo ?? (estado?.user_id ? "Usuário institucional" : "");
  const initials = (nome || "US")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const modoTecnicoGlobal = tecnico && pathname.startsWith("/admin-tecnico/");
  const papel = tecnico
    ? "Admin técnico"
    : institucional
      ? "Admin institucional"
      : defensor
        ? "Defensor(a) público(a)"
        : "Membro";

  const sidebarNav = (
    <SidebarNav
      groups={groups}
      pathname={pathname}
      collapsed={collapsed && !isMobile}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  const sidebarUserBlock = (
    <SidebarUserBlock
      collapsed={collapsed && !isMobile}
      nome={nome}
      initials={initials}
      papel={papel}
      comarca={tecnico ? "acesso técnico global" : "Defensoria Pública"}
      onSignOut={handleSignOut}
    />
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Sidebar desktop */}
      <DesktopSidebar>
        <SidebarHeader collapsed={collapsed} />
        <DefenderContextSwitcher collapsed={collapsed && !isMobile} />
        {sidebarNav}
        {sidebarUserBlock}
      </DesktopSidebar>

      {/* Drawer mobile */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-72 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <DialogPrimitive.Title className="sr-only">Navegação principal</DialogPrimitive.Title>

          <div className="flex h-full flex-col">
            <SidebarHeader collapsed={false} mobile />
            <DefenderContextSwitcher collapsed={false} />
            {sidebarNav}
            {sidebarUserBlock}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between gap-3 border-b border-border bg-surface px-4 lg:hidden lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir menu lateral"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
          <StatusChip estado={estado} />
        </header>
        {modoTecnicoGlobal && (
          <div
            role="status"
            className="flex items-center gap-2 border-b border-institutional/40 bg-institutional/10 px-4 py-2 text-xs text-institutional lg:px-8"
          >
            <Siren className="h-3.5 w-3.5" aria-hidden />
            <span className="font-mono uppercase tracking-[0.18em]">
              Acesso técnico global ativo — todas as ações estão sendo auditadas.
            </span>
          </div>
        )}
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function DesktopSidebar({ children }: { children: ReactNode }) {
  const { collapsed, toggleCollapsed } = useSidebarState();
  return (
    <aside
      aria-label="Navegação principal"
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "relative hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex",
        "transition-[width] duration-[160ms] ease-out motion-reduce:transition-none",
        collapsed ? "w-[68px]" : "w-[232px]",
      )}
    >
      {children}
      {/* Ajuste doc — botão de recolher/expandir sobreposto à borda do menu
          lateral, sem tooltip/texto ao passar o mouse. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
        aria-expanded={!collapsed}
        aria-controls="sidebar-nav"
        className="absolute right-0 top-14 z-10 inline-flex h-6 w-6 translate-x-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-muted shadow-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-3 w-3" aria-hidden />
        ) : (
          <PanelLeftClose className="h-3 w-3" aria-hidden />
        )}
      </button>
    </aside>
  );
}

function SidebarHeader({ collapsed }: { collapsed: boolean; mobile?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-16 items-center border-b border-sidebar-border",
        collapsed ? "justify-center px-2" : "gap-2 px-4",
      )}
    >
      <Link
        to="/area-de-trabalho"
        className={cn("flex items-center gap-3 min-w-0", collapsed && "justify-center")}
        aria-label="Ágora"
      >
        <img
          src="/dpe-rs-logo-branco.png"
          alt=""
          aria-hidden
          className="h-7 w-7 shrink-0 object-contain"
        />
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block font-mono text-[9px] uppercase tracking-[0.24em] text-sidebar-muted">
              DPE-RS
            </span>
            <span className="block truncate text-sm font-semibold">Ágora</span>
          </span>
        )}
      </Link>
    </div>
  );
}

function SidebarNav({
  groups,
  pathname,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <nav
      id="sidebar-nav"
      className={cn("flex-1 overflow-y-auto", collapsed ? "space-y-2 p-2" : "space-y-4 p-3")}
    >
      {groups.map((group, groupIdx) => {
        const visibleItems = group.items.filter((n) => n.visible);
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.id} role="group" aria-label={group.label ?? undefined}>
            {group.label && !collapsed && (
              <p
                className={cn(
                  "px-3 pb-2 pt-1 font-mono text-[9px] uppercase tracking-[0.24em]",
                  group.variant === "tecnica" ? "text-institutional" : "text-sidebar-muted",
                )}
              >
                {group.label}
              </p>
            )}
            {group.label && collapsed && groupIdx > 0 && (
              <div className="mx-2 my-2 h-px bg-sidebar-border" aria-hidden />
            )}
            <div className={cn(collapsed ? "space-y-1" : "space-y-0.5")}>
              {visibleItems.map((item) => (
                <SidebarNavItem
                  key={item.to}
                  item={item}
                  active={pathname === item.to || pathname.startsWith(item.to + "/")}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarNavItem({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center rounded-md text-sm transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
        collapsed ? "h-10 w-full justify-center px-0" : "gap-3 px-3 py-2",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-institutional"
        />
      )}
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {active && <ChevronRight className="h-4 w-4" aria-hidden />}
        </>
      )}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarUserBlock({
  collapsed,
  nome,
  initials,
  papel,
  comarca,
  onSignOut,
}: {
  collapsed: boolean;
  nome: string;
  initials: string;
  papel: string;
  comarca: string;
  onSignOut: () => void;
}) {
  if (collapsed) {
    return (
      <div className="border-t border-sidebar-border p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold"
              aria-label={`${nome || "Usuário"} — ${papel}`}
              role="img"
            >
              {initials}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="text-xs">
              <p className="font-medium">{nome || "—"}</p>
              <p className="text-muted-foreground">{papel}</p>
            </div>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Encerrar sessão"
              className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Encerrar sessão</TooltipContent>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{nome || "—"}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-muted">
            {comarca}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSignOut}
        className="mt-1 w-full justify-start gap-2 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <LogOut className="h-4 w-4" aria-hidden /> Encerrar sessão
      </Button>
    </div>
  );
}

function StatusChip({ estado }: { estado: ReturnType<typeof useEstadoInstitucional>["data"] }) {
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
// isAdmin is imported for potential future gates in the shell; keeping helper alive.
void isAdmin;
