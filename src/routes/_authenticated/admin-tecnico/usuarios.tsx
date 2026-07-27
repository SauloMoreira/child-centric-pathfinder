import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal, ShieldCheck, Search, UserRound, Copy } from "lucide-react";
import { toast } from "sonner";
import { TecnicoPage } from "@/components/tecnico-guard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AssignDefensorDialog,
  type AssignDefensorTarget,
} from "@/components/assign-defensor-dialog";
import { useEstadoInstitucional } from "@/hooks/use-estado-institucional";

export const Route = createFileRoute("/_authenticated/admin-tecnico/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Administração Técnica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UsuariosTecnico,
});

type UsuarioRow = {
  user_id: string;
  email: string | null;
  email_confirmado: boolean;
  nome_completo: string | null;
  matricula: string | null;
  cargo: string | null;
  funcao_interna: string | null;
  outra_funcao: string | null;
  telefone: string | null;
  status: string;
  ativo: boolean;
  role_atual: string | null;
  orgao_id: string | null;
  orgao_nome: string | null;
  orgao_comarca: string | null;
  membership_id: string | null;
  vinculado_em: string | null;
  created_at: string;
  updated_at: string;
};

const ROLE_LABEL: Record<string, string> = {
  admin_tecnico: "Admin. Técnico",
  admin_institucional: "Admin. Institucional",
  defensor_publico: "Defensor Público",
  membro_equipe: "Membro de Equipe",
};

const STATUS_LABEL: Record<string, string> = {
  aguardando_dados: "Aguardando dados",
  aguardando_aprovacao: "Aguardando aprovação",
  ativo: "Ativo",
  suspenso: "Suspenso",
  inativo: "Inativo",
};

function RoleBadge({ role }: { role: string | null }) {
  if (!role) {
    return (
      <Badge variant="outline" className="font-mono text-[10px]">
        sem papel
      </Badge>
    );
  }
  const isAdmin = role.startsWith("admin_");
  return (
    <Badge variant={isAdmin ? "default" : "secondary"} className="font-mono text-[10px]">
      {ROLE_LABEL[role] ?? role}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ativo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    aguardando_dados: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    aguardando_aprovacao: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    suspenso: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    inativo: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono ${map[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function UsuariosTecnico() {
  const { data: estado } = useEstadoInstitucional();
  const currentUserId = estado?.user_id;

  const [filtroPapel, setFiltroPapel] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [target, setTarget] = useState<AssignDefensorTarget | null>(null);
  const [drawerUser, setDrawerUser] = useState<UsuarioRow | null>(null);

  const q = useQuery({
    queryKey: ["admin-tecnico", "usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_listar_usuarios", {
        p_limit: 500,
      });
      if (error) throw error;
      return (data ?? []) as UsuarioRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!q.data) return [];
    const b = busca.trim().toLowerCase();
    return q.data.filter((u) => {
      if (filtroPapel === "sem_papel" && u.role_atual) return false;
      if (filtroPapel !== "todos" && filtroPapel !== "sem_papel" && u.role_atual !== filtroPapel)
        return false;
      if (filtroStatus !== "todos" && u.status !== filtroStatus) return false;
      if (!b) return true;
      return (
        (u.nome_completo ?? "").toLowerCase().includes(b) ||
        (u.email ?? "").toLowerCase().includes(b) ||
        (u.matricula ?? "").toLowerCase().includes(b) ||
        (u.orgao_nome ?? "").toLowerCase().includes(b) ||
        (u.orgao_comarca ?? "").toLowerCase().includes(b)
      );
    });
  }, [q.data, filtroPapel, filtroStatus, busca]);

  const openAssignAsDefensor = (u: UsuarioRow) => {
    setTarget({
      user_id: u.user_id,
      nome_completo: u.nome_completo,
      email: u.email,
      matricula: u.matricula,
      status: u.status,
      role_atual: u.role_atual,
      orgao_nome: u.orgao_nome,
      orgao_comarca: u.orgao_comarca,
      email_confirmado: u.email_confirmado,
    });
  };

  return (
    <TecnicoPage
      title="Usuários"
      description="Gestão institucional de perfis, papéis e vínculos com órgãos de execução."
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail, matrícula, órgão…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filtroPapel} onValueChange={setFiltroPapel}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Papel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os papéis</SelectItem>
            <SelectItem value="sem_papel">Sem papel</SelectItem>
            <SelectItem value="admin_tecnico">Admin. Técnico</SelectItem>
            <SelectItem value="admin_institucional">Admin. Institucional</SelectItem>
            <SelectItem value="defensor_publico">Defensor Público</SelectItem>
            <SelectItem value="membro_equipe">Membro de Equipe</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="aguardando_dados">Aguardando dados</SelectItem>
            <SelectItem value="aguardando_aprovacao">Aguardando aprovação</SelectItem>
            <SelectItem value="suspenso">Suspenso</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFiltroPapel("sem_papel");
            setFiltroStatus("todos");
          }}
        >
          Aguardando definição de papel
        </Button>
      </div>

      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {q.error && (
        <p className="text-sm text-destructive">
          Falha ao consultar usuários: {(q.error as Error).message}
        </p>
      )}

      {q.data && (
        <div className="surface-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-mono">Nome</th>
                  <th className="px-4 py-2 text-left font-mono">E-mail</th>
                  <th className="px-4 py-2 text-left font-mono">Matrícula</th>
                  <th className="px-4 py-2 text-left font-mono">Papel</th>
                  <th className="px-4 py-2 text-left font-mono">Órgão</th>
                  <th className="px-4 py-2 text-left font-mono">Status</th>
                  <th className="px-4 py-2 text-right font-mono w-10">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Nenhum usuário corresponde aos filtros.
                    </td>
                  </tr>
                )}
                {filtered.map((u) => {
                  const isSelf = u.user_id === currentUserId;
                  const semPapel = !u.role_atual;
                  const podePromover =
                    !isSelf &&
                    u.role_atual !== "defensor_publico" &&
                    u.role_atual !== "admin_tecnico" &&
                    u.role_atual !== "admin_institucional";
                  return (
                    <tr key={u.user_id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-4 py-2">
                        <button
                          className="text-left hover:underline"
                          onClick={() => setDrawerUser(u)}
                        >
                          {u.nome_completo ?? "—"}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{u.email ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{u.matricula ?? "—"}</td>
                      <td className="px-4 py-2">
                        <RoleBadge role={u.role_atual} />
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {u.orgao_nome ? (
                          <div>
                            <div>{u.orgao_nome}</div>
                            {u.orgao_comarca && (
                              <div className="text-muted-foreground">{u.orgao_comarca}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel className="text-xs">Ações</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setDrawerUser(u)}>
                              <UserRound className="h-4 w-4 mr-2" /> Visualizar usuário
                            </DropdownMenuItem>
                            {podePromover && (
                              <DropdownMenuItem
                                onClick={() => openAssignAsDefensor(u)}
                                className={semPapel ? "text-primary font-medium" : undefined}
                              >
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Definir como Defensor Público
                              </DropdownMenuItem>
                            )}
                            {!podePromover && !isSelf && (
                              <DropdownMenuItem disabled>
                                Papel incompatível com promoção
                              </DropdownMenuItem>
                            )}
                            {isSelf && (
                              <DropdownMenuItem disabled>
                                Você não pode alterar seu próprio papel
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                navigator.clipboard.writeText(u.user_id);
                                toast.success("UUID copiado.");
                              }}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copiar UUID
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground font-mono">
            {filtered.length} de {q.data.length} usuários
          </div>
        </div>
      )}

      <AssignDefensorDialog
        open={!!target}
        onOpenChange={(v) => !v && setTarget(null)}
        target={target}
      />

      <UsuarioDrawer user={drawerUser} onClose={() => setDrawerUser(null)} />
    </TecnicoPage>
  );
}

type UsuarioRolHistorico = {
  role: string;
  granted_at: string;
  revoked_at: string | null;
};

type UsuarioMembership = {
  id: string;
  orgao_nome: string | null;
  orgao_comarca: string | null;
  ativo: boolean;
  since: string;
  until: string | null;
};

type UsuarioAuditEntry = {
  action: string;
  result: string;
  at: string;
};

type UsuarioDetalhe = {
  roles?: UsuarioRolHistorico[];
  memberships?: UsuarioMembership[];
  audit?: UsuarioAuditEntry[];
};

function UsuarioDrawer({ user, onClose }: { user: UsuarioRow | null; onClose: () => void }) {
  const detalhesQ = useQuery({
    queryKey: ["admin-tecnico", "usuario-detalhe", user?.user_id],
    enabled: !!user,
    queryFn: async (): Promise<UsuarioDetalhe> => {
      const { data, error } = await supabase.rpc("admin_detalhar_usuario", {
        p_user_id: user!.user_id,
      });
      if (error) throw error;
      return (data as UsuarioDetalhe) ?? {};
    },
  });

  return (
    <Sheet open={!!user} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>{user?.nome_completo ?? "Usuário"}</SheetTitle>
          <SheetDescription>{user?.email ?? "—"}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
          {user && (
            <div className="space-y-4 text-sm pb-8">
              <section className="space-y-1">
                <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Identificação
                </h4>
                <dl className="grid grid-cols-2 gap-y-1 gap-x-4">
                  <dt className="text-muted-foreground">Papel</dt>
                  <dd>
                    <RoleBadge role={user.role_atual} />
                  </dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge status={user.status} />
                  </dd>
                  <dt className="text-muted-foreground">Matrícula</dt>
                  <dd className="font-mono">{user.matricula ?? "—"}</dd>
                  <dt className="text-muted-foreground">Função interna</dt>
                  <dd>{user.funcao_interna ?? "—"}</dd>
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd>{user.telefone ?? "—"}</dd>
                  <dt className="text-muted-foreground">Órgão atual</dt>
                  <dd>
                    {user.orgao_nome ?? "—"}
                    {user.orgao_comarca ? ` — ${user.orgao_comarca}` : ""}
                  </dd>
                  <dt className="text-muted-foreground">UUID</dt>
                  <dd className="font-mono text-[10px] break-all">{user.user_id}</dd>
                </dl>
              </section>

              {detalhesQ.data?.roles && detalhesQ.data.roles.length > 0 && (
                <section className="space-y-1">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Histórico de papéis
                  </h4>
                  <ul className="space-y-1">
                    {detalhesQ.data.roles.map((r, i) => (
                      <li key={i} className="rounded border border-border bg-muted/30 p-2 text-xs">
                        <div className="flex justify-between">
                          <span className="font-mono">{r.role}</span>
                          <span className="text-muted-foreground">
                            {r.revoked_at ? "revogado" : "ativo"}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          Concedido em {new Date(r.granted_at).toLocaleString("pt-BR")}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detalhesQ.data?.memberships && detalhesQ.data.memberships.length > 0 && (
                <section className="space-y-1">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Histórico de vínculos
                  </h4>
                  <ul className="space-y-1">
                    {detalhesQ.data.memberships.map((m) => (
                      <li
                        key={m.id}
                        className="rounded border border-border bg-muted/30 p-2 text-xs"
                      >
                        <div className="flex justify-between">
                          <span>{m.orgao_nome ?? "—"}</span>
                          <span className="text-muted-foreground">
                            {m.ativo ? "ativo" : "encerrado"}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          {m.orgao_comarca ?? "—"}
                          {" · desde "}
                          {new Date(m.since).toLocaleDateString("pt-BR")}
                          {m.until && ` até ${new Date(m.until).toLocaleDateString("pt-BR")}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detalhesQ.data?.audit && detalhesQ.data.audit.length > 0 && (
                <section className="space-y-1">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Auditoria recente
                  </h4>
                  <ul className="space-y-1">
                    {detalhesQ.data.audit.slice(0, 10).map((a, i) => (
                      <li key={i} className="rounded border border-border bg-muted/30 p-2 text-xs">
                        <div className="flex justify-between font-mono">
                          <span>{a.action}</span>
                          <span
                            className={
                              a.result === "sucesso" ? "text-emerald-600" : "text-destructive"
                            }
                          >
                            {a.result}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          {new Date(a.at).toLocaleString("pt-BR")}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
