import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Search, ShieldAlert, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useAvailableDefenders,
  useSelectDefenderContext,
  type AvailableDefender,
} from "@/features/team/defender-bonds";
import { friendlyTeamError } from "@/lib/team-errors";

type Props = {
  collapsed: boolean;
};

/**
 * Seletor de contexto de Defensor exibido na Sidebar.
 * - Membro: título "Trabalhando com", apenas Defensores vinculados.
 * - Técnico: título "Contexto técnico", todos os Defensores ativos + badge somente leitura.
 * - Defensor (owner puro): não renderiza.
 */
export function DefenderContextSwitcher({ collapsed }: Props) {
  const [open, setOpen] = useState(false);
  const [termo, setTermo] = useState("");
  const q = useAvailableDefenders();
  const selecionar = useSelectDefenderContext();

  const mode = q.data?.mode ?? "none";
  const items = useMemo<AvailableDefender[]>(() => {
    const list = q.data?.items ?? [];
    const t = termo.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (d) =>
        d.displayName.toLowerCase().includes(t) ||
        (d.institutionalLabel ?? "").toLowerCase().includes(t),
    );
  }, [q.data, termo]);

  const current = q.data?.items.find((d) => d.isCurrentContext) ?? null;

  // Defensor puro (owner): seletor não é necessário.
  if (mode === "owner" || mode === "none") return null;
  if (q.isLoading) return null;

  const isTechnical = mode === "technical";
  const emptyMember = mode === "member" && (q.data?.items.length ?? 0) === 0;

  async function escolher(defenderUserId: string) {
    if (defenderUserId === current?.defenderUserId) {
      setOpen(false);
      return;
    }
    try {
      await selecionar.mutateAsync(defenderUserId);
      setOpen(false);
    } catch (err) {
      toast.error(friendlyTeamError(err, "Não foi possível selecionar o Defensor."));
    }
  }

  if (collapsed) {
    return (
      <div className="border-b border-sidebar-border p-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Selecionar Defensor de contexto"
          className="mx-auto flex h-9 w-9 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {isTechnical ? (
            <ShieldAlert className="h-4 w-4 text-institutional" aria-hidden />
          ) : (
            <User className="h-4 w-4 text-institutional" aria-hidden />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-sidebar-border px-3 py-3">
      <p className="px-1 pb-1.5 font-mono text-[9px] uppercase tracking-[0.24em] text-sidebar-muted">
        {isTechnical ? "Contexto técnico" : "Trabalhando com"}
      </p>

      {isTechnical && (
        <Badge
          variant="outline"
          className="mb-2 gap-1.5 border-institutional/50 bg-institutional/10 font-mono text-[9px] uppercase tracking-[0.16em] text-institutional"
        >
          <ShieldAlert className="h-3 w-3" aria-hidden />
          Modo técnico · somente leitura
        </Badge>
      )}

      {emptyMember ? (
        <p className="rounded-md border border-dashed border-sidebar-border/70 bg-sidebar-accent/20 px-2 py-2 text-[11px] text-sidebar-muted">
          Aguardando vínculo com um Defensor Público.
        </p>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full justify-start gap-2 border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Selecionar Defensor de contexto"
            >
              <User className="h-4 w-4 shrink-0 text-institutional" aria-hidden />
              <span className="flex-1 truncate text-left">
                {current?.displayName ??
                  (isTechnical ? "Selecionar Defensor" : "Selecionar Defensor vinculado")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[320px] p-0">
            <div className="border-b border-border p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {isTechnical ? "Todos os Defensores ativos" : "Seus Defensores vinculados"}
              </p>
              {isTechnical && (
                <div className="relative mt-2">
                  <Search
                    className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    placeholder="Buscar Defensor…"
                    className="h-8 pl-7 text-sm"
                    aria-label="Buscar Defensor"
                  />
                </div>
              )}
            </div>
            <div className="max-h-[340px] overflow-y-auto py-1">
              {items.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground">Nenhum resultado.</p>
              )}
              {items.map((d) => {
                const atual = d.defenderUserId === current?.defenderUserId;
                return (
                  <button
                    key={d.defenderUserId}
                    type="button"
                    onClick={() => escolher(d.defenderUserId)}
                    disabled={selecionar.isPending}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                      atual && "bg-institutional/5",
                    )}
                  >
                    <div className="mt-0.5 h-4 w-4 shrink-0">
                      {atual ? (
                        <Check className="h-4 w-4 text-institutional" aria-hidden />
                      ) : (
                        <span className="block h-3 w-3 rounded-full border border-border" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.displayName}</p>
                      {d.institutionalLabel && (
                        <p className="truncate text-xs text-muted-foreground">
                          {d.institutionalLabel}
                        </p>
                      )}
                    </div>
                    {atual && (
                      <Badge
                        variant="outline"
                        className="border-institutional/40 text-[10px] font-mono uppercase tracking-[0.14em] text-institutional"
                      >
                        Em uso
                      </Badge>
                    )}
                    {selecionar.isPending && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
