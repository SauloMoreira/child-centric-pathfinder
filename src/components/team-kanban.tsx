import { useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  MoreVertical,
  UserPlus,
  Mail,
  Ban,
  RefreshCw,
  LogOut,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { TeamMember, TeamInvitation } from "@/hooks/use-team";
import {
  useResendInvitation,
  useCancelInvitation,
  useBlockMember,
  useReactivateMember,
  useEndMembership,
} from "@/hooks/use-team";
import { friendlyTeamError } from "@/lib/team-errors";
import { funcoesInternas } from "@/lib/team-schemas";
import { cn } from "@/lib/utils";

function iniciais(nome: string | null | undefined) {
  const src = (nome ?? "US").trim();
  return (
    src
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "US"
  );
}

function labelFuncao(v: string | null | undefined, outra?: string | null) {
  if (!v) return "—";
  if (v === "outro" && outra) return outra;
  return funcoesInternas.find((f) => f.value === v)?.label ?? v;
}

export function MemberCard({ m }: { m: TeamMember }) {
  const [confirm, setConfirm] = useState<null | "block" | "reactivate" | "end">(null);
  const [motivo, setMotivo] = useState("");
  const block = useBlockMember();
  const reactivate = useReactivateMember();
  const end = useEndMembership();

  const bloqueado = m.status === "suspenso" || !m.ativo;
  const ultimoAcesso = m.ultimo_acesso
    ? `há ${formatDistanceToNow(new Date(m.ultimo_acesso), { locale: ptBR })}`
    : "nunca acessou";

  async function confirmar() {
    try {
      if (confirm === "block") {
        await block.mutateAsync({ userId: m.user_id, motivo });
        toast.success("Acesso bloqueado");
      } else if (confirm === "reactivate") {
        await reactivate.mutateAsync({ userId: m.user_id, motivo });
        toast.success("Membro reativado");
      } else if (confirm === "end") {
        await end.mutateAsync({ userId: m.user_id, motivo });
        toast.success("Vínculo encerrado");
      }
      setConfirm(null);
      setMotivo("");
    } catch (err) {
      toast.error("Não foi possível concluir", {
        description: friendlyTeamError(err),
      });
    }
  }

  return (
    <article className="group rounded-md border border-border bg-surface p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
          aria-hidden
        >
          {iniciais(m.nome_completo)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium">{m.nome_completo ?? "Sem nome"}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Ações"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {bloqueado ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setConfirm("reactivate");
                      setMotivo("");
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Reativar acesso
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => {
                      setConfirm("block");
                      setMotivo("");
                    }}
                  >
                    <Ban className="mr-2 h-4 w-4" /> Bloquear acesso
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setConfirm("end");
                    setMotivo("");
                  }}
                  className="text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Encerrar vínculo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {m.email}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="text-[10px]">
              {labelFuncao(m.funcao_interna, m.outra_funcao)}
            </Badge>
            {bloqueado && (
              <Badge variant="destructive" className="text-[10px]">
                Bloqueado
              </Badge>
            )}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            <Clock className="mr-1 inline h-3 w-3" aria-hidden />
            Vínculo em {format(new Date(m.vinculado_em), "dd/MM/yyyy", { locale: ptBR })} · Último
            acesso {ultimoAcesso}
          </p>
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "block" && "Bloquear acesso do membro"}
              {confirm === "reactivate" && "Reativar acesso do membro"}
              {confirm === "end" && "Encerrar vínculo do membro"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "end"
                ? "O vínculo será encerrado e o membro perderá o acesso ao órgão. Os registros permanecerão preservados."
                : "Registre um motivo institucional para a auditoria."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo institucional (mín. 5 caracteres)."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmar();
              }}
              disabled={motivo.trim().length < 5}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

export function InvitationCard({ inv }: { inv: TeamInvitation }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [motivo, setMotivo] = useState("");
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();

  const expirado = new Date(inv.expires_at).getTime() < Date.now();
  const label = useMemo(() => {
    if (inv.status === "cancelado") return "Cancelado";
    if (inv.status === "falhou") return "Falhou";
    if (inv.status === "expirado" || expirado) return "Expirado";
    if (inv.sent_at) return "E-mail enviado";
    return "Preparando";
  }, [inv.status, inv.sent_at, expirado]);

  async function handleResend() {
    try {
      await resend.mutateAsync(inv.id);
      toast.success("Convite reenviado com sucesso");
    } catch (err) {
      toast.error("Não foi possível reenviar", {
        description: friendlyTeamError(err),
      });
    }
  }

  async function handleCancel() {
    try {
      await cancel.mutateAsync({ id: inv.id, motivo });
      toast.success("Convite cancelado");
      setConfirmCancel(false);
      setMotivo("");
    } catch (err) {
      toast.error("Não foi possível cancelar", {
        description: friendlyTeamError(err),
      });
    }
  }

  return (
    <article className="group rounded-md border border-dashed border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning-foreground"
          aria-hidden
        >
          <Mail className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium">{inv.nome_completo}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Ações"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handleResend} disabled={resend.isPending}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Reenviar convite
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setConfirmCancel(true)}
                  className="text-destructive"
                >
                  <Ban className="mr-2 h-4 w-4" /> Cancelar convite
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {inv.email}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="text-[10px]">
              {labelFuncao(inv.funcao_interna, inv.outra_funcao)}
            </Badge>
            <Badge variant={expirado ? "destructive" : "secondary"} className="text-[10px]">
              {label}
            </Badge>
            {inv.resend_count > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {inv.resend_count}× reenviado
              </Badge>
            )}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {expirado ? (
              <>
                <AlertCircle className="mr-1 inline h-3 w-3" aria-hidden />
                Expirou{" "}
                {formatDistanceToNow(new Date(inv.expires_at), {
                  locale: ptBR,
                  addSuffix: true,
                })}
              </>
            ) : (
              <>
                <Clock className="mr-1 inline h-3 w-3" aria-hidden />
                Expira{" "}
                {formatDistanceToNow(new Date(inv.expires_at), {
                  locale: ptBR,
                  addSuffix: true,
                })}
              </>
            )}
          </p>
        </div>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar convite</AlertDialogTitle>
            <AlertDialogDescription>
              O link enviado deixará de ativar o vínculo. O registro permanecerá no histórico
              institucional.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-cancel">Motivo</Label>
            <Textarea
              id="motivo-cancel"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo do cancelamento (mín. 5 caracteres)."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={motivo.trim().length < 5}
            >
              Cancelar convite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

export function KanbanColumn({
  title,
  count,
  tone,
  children,
  emptyState,
}: {
  title: string;
  count: number;
  tone?: "default" | "warning" | "success" | "destructive";
  children: React.ReactNode;
  emptyState?: React.ReactNode;
}) {
  return (
    <section
      className="flex w-[300px] shrink-0 flex-col rounded-md border border-border bg-canvas/40"
      aria-label={title}
    >
      <header
        className={cn(
          "sticky top-0 z-10 flex items-center justify-between rounded-t-md border-b border-border bg-surface px-3 py-2",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              tone === "warning" && "bg-warning",
              tone === "success" && "bg-success",
              tone === "destructive" && "bg-destructive",
              (!tone || tone === "default") && "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{count}</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {count === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            {emptyState ?? "Nenhum item"}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted" aria-hidden>
        <UserPlus className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
