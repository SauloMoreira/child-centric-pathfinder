import { useState } from "react";
import { Check, Loader2, Mail, X, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  usePendingRequestsForDefender,
  useApproveAccessRequest,
  useRejectAccessRequest,
  type PendingRequestForDefender,
} from "@/features/team/defender-access-requests";
import { friendlyTeamError } from "@/lib/team-errors";

/**
 * Seção "Solicitações pendentes" exibida na tela Minha Equipe do Defensor.
 * Só faz sentido quando o próprio Defensor é o destinatário — ou seja,
 * quando `enabled` é true (Defensor logado no seu próprio contexto).
 */
export function PendingAccessRequestsSection({ enabled }: { enabled: boolean }) {
  const q = usePendingRequestsForDefender({ enabled });
  const approve = useApproveAccessRequest();
  const reject = useRejectAccessRequest();
  const [rejectTarget, setRejectTarget] = useState<PendingRequestForDefender | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  if (!enabled) return null;

  const items = q.data ?? [];

  async function handleApprove(req: PendingRequestForDefender) {
    try {
      await approve.mutateAsync({
        requestId: req.requestId,
        expectedVersion: req.optimisticVersion,
      });
      toast.success(`Acesso concedido a ${req.displayName}.`);
    } catch (err) {
      toast.error(friendlyTeamError(err, "Não foi possível aprovar."));
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    try {
      await reject.mutateAsync({
        requestId: rejectTarget.requestId,
        expectedVersion: rejectTarget.optimisticVersion,
        reason: rejectReason.trim() || null,
      });
      toast.success("Solicitação recusada.");
      setRejectTarget(null);
      setRejectReason("");
    } catch (err) {
      toast.error(friendlyTeamError(err, "Não foi possível recusar."));
    }
  }

  return (
    <section className="border-t border-border bg-surface/40 px-4 py-6 lg:px-8">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Solicitações de acesso
          </p>
          <h2 className="text-base font-semibold">Solicitações pendentes</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Membros de equipe pediram para acompanhar sua Área de Trabalho em modo somente leitura.
          </p>
        </div>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : q.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {friendlyTeamError(q.error, "Não foi possível carregar as solicitações.")}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-surface/60 p-4 text-sm text-muted-foreground">
          <Inbox className="h-4 w-4" aria-hidden />
          Nenhuma solicitação pendente no momento.
        </div>
      ) : (
        <ul className="grid gap-2">
          {items.map((r) => (
            <li
              key={r.requestId}
              className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.displayName}</p>
                {r.email && (
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" aria-hidden />
                    {r.email}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Enviada em {new Date(r.createdAt).toLocaleString("pt-BR")}
                </p>
                {r.message && (
                  <p className="mt-2 rounded-md border border-border/60 bg-canvas/60 p-2 text-xs text-foreground/90">
                    “{r.message}”
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRejectReason("");
                    setRejectTarget(r);
                  }}
                  disabled={approve.isPending || reject.isPending}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Recusar
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleApprove(r)}
                  disabled={approve.isPending || reject.isPending}
                >
                  {approve.isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                  )}
                  Aprovar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar solicitação</DialogTitle>
            <DialogDescription>
              Recusar a solicitação de <strong>{rejectTarget?.displayName}</strong>. Você pode
              adicionar um motivo genérico (opcional, máximo de 300 caracteres). O membro poderá
              solicitar novamente no futuro.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Motivo (opcional)"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectTarget(null)}
              disabled={reject.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={reject.isPending}
            >
              {reject.isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
