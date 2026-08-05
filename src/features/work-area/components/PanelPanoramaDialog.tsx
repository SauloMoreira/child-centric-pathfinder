import { useEffect, useState } from "react";
import { Loader2, Search, Shield, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  panelErrorFromUnknown,
  useCollaboratorCandidates,
  useLeavePanelCollaboration,
  usePanelPanorama,
  useRemovePanelCollaborator,
  useSetPanelCollaborator,
  type PanelMemberSummary,
} from "@/features/work-area";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

function MemberRow({
  member,
  onRemove,
  removing,
}: {
  member: PanelMemberSummary;
  onRemove?: () => void;
  removing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
      <p className="min-w-0 truncate text-sm">{member.name}</p>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remover ${member.name}`}
        >
          {removing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserMinus className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}

/**
 * Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — "caixa/página compacta com um
 * panorama a respeito daquele painel", acessível pelo botão de status
 * abaixo do título "Área de Trabalho". Mostra descrição, gestor,
 * colaboradores e visitantes; permite ao gestor definir/remover
 * colaboradores, e ao colaborador sair da função.
 */
export function PanelPanoramaDialog({
  open,
  onOpenChange,
  panelId,
  defenderUserId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  panelId: string | null;
  defenderUserId: string;
}) {
  const panorama = usePanelPanorama(panelId, open);
  const setCollaborator = useSetPanelCollaborator(panelId ?? "");
  const removeCollaborator = useRemovePanelCollaborator(panelId ?? "");
  const leaveCollaboration = useLeavePanelCollaboration(defenderUserId);

  const [termo, setTermo] = useState("");
  const debounced = useDebouncedValue(termo, 300);
  const candidates = useCollaboratorCandidates(
    panelId ?? "",
    debounced,
    open && !!panorama.data?.canManageCollaborators,
  );
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setTermo("");
  }, [open]);

  async function handleAdd(userId: string) {
    if (!panelId) return;
    try {
      await setCollaborator.mutateAsync({ panelId, memberUserId: userId });
      toast.success("Colaborador definido");
      setTermo("");
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    }
  }

  async function handleRemove(userId: string) {
    if (!panelId) return;
    setRemovingId(userId);
    try {
      await removeCollaborator.mutateAsync({ panelId, memberUserId: userId });
      toast.success("Colaborador removido");
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    } finally {
      setRemovingId(null);
    }
  }

  async function handleLeave() {
    if (!panelId) return;
    try {
      await leaveCollaboration.mutateAsync({ panelId });
      toast.success("Você saiu da colaboração deste Painel");
      onOpenChange(false);
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    }
  }

  const data = panorama.data;
  const isCollaboratorCaller = data?.callerAccessMode === "collaborator";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-institutional" aria-hidden />
            {data?.name ?? "Painel"}
          </DialogTitle>
          <DialogDescription>
            {data?.description || "Este Painel não possui descrição."}
          </DialogDescription>
        </DialogHeader>

        {panorama.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Gestor
              </p>
              {data.manager ? (
                <MemberRow member={data.manager} />
              ) : (
                <p className="text-xs text-muted-foreground">—</p>
              )}
            </div>

            {data.isPublic && (
              <>
                <div>
                  <p className="mb-1.5 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                    Colaboradores
                    <Badge variant="outline" className="text-[10px]">
                      {data.collaborators.length}
                    </Badge>
                  </p>
                  <div className="space-y-1.5">
                    {data.collaborators.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum colaborador definido.</p>
                    )}
                    {data.collaborators.map((c) => (
                      <MemberRow
                        key={c.userId}
                        member={c}
                        removing={removingId === c.userId}
                        onRemove={
                          data.canManageCollaborators ? () => handleRemove(c.userId) : undefined
                        }
                      />
                    ))}
                  </div>
                </div>

                {data.canManageCollaborators && (
                  <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <UserPlus className="h-3.5 w-3.5" aria-hidden /> Definir colaborador
                    </p>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        value={termo}
                        onChange={(e) => setTermo(e.target.value)}
                        placeholder="Buscar por nome ou e-mail…"
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    {debounced.trim().length >= 2 && (
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {candidates.isFetching && (
                          <p className="p-1 text-xs text-muted-foreground">Buscando…</p>
                        )}
                        {!candidates.isFetching && (candidates.data?.length ?? 0) === 0 && (
                          <p className="p-1 text-xs text-muted-foreground">
                            Nenhum usuário encontrado.
                          </p>
                        )}
                        {candidates.data?.map((cand) => (
                          <button
                            key={cand.userId}
                            type="button"
                            disabled={cand.currentRole === "colaborador" || setCollaborator.isPending}
                            onClick={() => handleAdd(cand.userId)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                              cand.currentRole === "colaborador"
                                ? "opacity-60"
                                : "hover:bg-muted/60",
                            )}
                          >
                            <span className="min-w-0 truncate">{cand.displayName}</span>
                            {cand.currentRole === "colaborador" ? (
                              <Badge variant="outline" className="shrink-0 text-[10px]">
                                Já é colaborador
                              </Badge>
                            ) : cand.currentRole === "visitante" ? (
                              <Badge variant="outline" className="shrink-0 text-[10px]">
                                Visitante
                              </Badge>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <p className="mb-1.5 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                    Visitantes
                    <Badge variant="outline" className="text-[10px]">
                      {data.visitors.length}
                    </Badge>
                  </p>
                  <div className="space-y-1.5">
                    {data.visitors.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum visitante ainda.</p>
                    )}
                    {data.visitors.map((v) => (
                      <MemberRow key={v.userId} member={v} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}

        {isCollaboratorCaller && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleLeave}
              disabled={leaveCollaboration.isPending}
            >
              <X className="mr-2 h-3.5 w-3.5" aria-hidden />
              {leaveCollaboration.isPending ? "Saindo…" : "Sair da colaboração"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
