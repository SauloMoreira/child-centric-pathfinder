import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useLinkMember,
  useSearchCandidateMembers,
  type CandidateMember,
} from "@/features/team/defender-bonds";
import { friendlyTeamError } from "@/lib/team-errors";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defenderUserId: string;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

export function LinkMemberSheet({ open, onOpenChange, defenderUserId }: Props) {
  const [termo, setTermo] = useState("");
  const debounced = useDebouncedValue(termo, 300);
  const [selected, setSelected] = useState<CandidateMember | null>(null);

  useEffect(() => {
    if (!open) {
      setTermo("");
      setSelected(null);
    }
  }, [open]);

  const search = useSearchCandidateMembers(debounced, open);
  const link = useLinkMember(defenderUserId);

  const items = useMemo(() => search.data ?? [], [search.data]);

  async function handleSubmit() {
    if (!selected) return;
    try {
      await link.mutateAsync(selected.userId);
      toast.success(`${selected.displayName} vinculado(a) à sua equipe.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyTeamError(err, "Não foi possível vincular o membro."));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-institutional" aria-hidden />
            Vincular membro à sua equipe
          </SheetTitle>
          <SheetDescription>
            Busque um membro de equipe ativo por nome ou e-mail. O vínculo dá acesso à sua Área de
            Trabalho em modo somente leitura.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value);
                setSelected(null);
              }}
              placeholder="Digite ao menos 2 caracteres…"
              className="pl-8"
              autoFocus
              aria-label="Buscar membro por nome ou e-mail"
            />
          </div>

          <div className="max-h-[380px] min-h-[80px] overflow-y-auto rounded-md border border-border">
            {debounced.trim().length < 2 && (
              <p className="p-4 text-xs text-muted-foreground">
                Informe pelo menos 2 caracteres para iniciar a busca.
              </p>
            )}
            {debounced.trim().length >= 2 && search.isFetching && (
              <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Buscando…
              </div>
            )}
            {debounced.trim().length >= 2 && !search.isFetching && items.length === 0 && (
              <p className="p-4 text-xs text-muted-foreground">
                Nenhum membro de equipe ativo corresponde à busca.
              </p>
            )}
            {items.map((m) => {
              const isSel = selected?.userId === m.userId;
              return (
                <button
                  key={m.userId}
                  type="button"
                  disabled={m.alreadyBoundToMe}
                  onClick={() => setSelected(m)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0",
                    m.alreadyBoundToMe
                      ? "opacity-60"
                      : "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                    isSel && "bg-institutional/10",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  {m.alreadyBoundToMe && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-institutional/40 text-[10px] font-mono uppercase tracking-[0.14em] text-institutional"
                    >
                      Já vinculado
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <SheetFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={link.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!selected || link.isPending}>
            {link.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />}
            Vincular
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
