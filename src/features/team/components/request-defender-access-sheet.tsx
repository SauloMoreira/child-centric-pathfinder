import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, ShieldQuestion } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useDefenderCandidates,
  useRequestDefenderAccess,
  type DefenderCandidate,
} from "@/features/team/defender-access-requests";
import { friendlyTeamError } from "@/lib/team-errors";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const MSG_MAX = 300;

export function RequestDefenderAccessSheet({ open, onOpenChange }: Props) {
  const [termo, setTermo] = useState("");
  const debounced = useDebounced(termo, 300);
  const [selected, setSelected] = useState<DefenderCandidate | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setTermo("");
      setSelected(null);
      setMessage("");
    }
  }, [open]);

  const search = useDefenderCandidates(debounced, open);
  const submit = useRequestDefenderAccess();

  const items = useMemo(() => search.data ?? [], [search.data]);
  const overLimit = message.length > MSG_MAX;

  async function handleSubmit() {
    if (!selected) return;
    if (overLimit) {
      toast.error("A mensagem excede 300 caracteres.");
      return;
    }
    try {
      await submit.mutateAsync({
        defensorUserId: selected.defensorUserId,
        message: message.trim() || null,
      });
      toast.success("Solicitação enviada. O Defensor precisa aprová-la para liberar o acesso.");
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyTeamError(err, "Não foi possível enviar a solicitação."));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldQuestion className="h-4 w-4 text-institutional" aria-hidden />
            Solicitar acesso a um Defensor
          </SheetTitle>
          <SheetDescription>
            Escolha o Defensor Público responsável. Ele receberá sua solicitação e precisa aprovar
            antes de liberar o acesso somente leitura à Área de Trabalho.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="def-search">Defensor Público</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="def-search"
                value={termo}
                onChange={(e) => {
                  setTermo(e.target.value);
                  setSelected(null);
                }}
                placeholder="Buscar por nome…"
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-[280px] min-h-[80px] overflow-y-auto rounded-md border border-border">
              {search.isLoading && (
                <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Carregando…
                </div>
              )}
              {!search.isLoading && items.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground">
                  Nenhum Defensor ativo encontrado.
                </p>
              )}
              {items.map((d) => {
                const isSel = selected?.defensorUserId === d.defensorUserId;
                const disabled = d.hasActiveBond || d.hasPendingRequest;
                return (
                  <button
                    key={d.defensorUserId}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSelected(d)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0",
                      disabled
                        ? "opacity-60"
                        : "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                      isSel && "bg-institutional/10",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.displayName}</p>
                      {d.institutionalLabel && (
                        <p className="truncate text-xs text-muted-foreground">
                          {d.institutionalLabel}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {d.hasActiveBond && (
                        <Badge
                          variant="outline"
                          className="border-success/40 bg-success/10 text-[10px] font-mono uppercase tracking-[0.14em] text-success"
                        >
                          Vinculado
                        </Badge>
                      )}
                      {d.hasPendingRequest && !d.hasActiveBond && (
                        <Badge
                          variant="outline"
                          className="border-warning/40 bg-warning/10 text-[10px] font-mono uppercase tracking-[0.14em] text-warning"
                        >
                          Pendente
                        </Badge>
                      )}
                      {isSel && !disabled && (
                        <Check className="h-4 w-4 text-institutional" aria-hidden />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="msg">Mensagem (opcional)</Label>
            <Textarea
              id="msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={MSG_MAX + 50}
              placeholder="Ex.: sou da equipe de apoio deste órgão."
            />
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">
                Não inclua nome de assistido, CPF, número de processo ou dados pessoais.
              </span>
              <span className={cn(overLimit && "text-destructive")}>
                {message.length}/{MSG_MAX}
              </span>
            </div>
          </div>
        </div>

        <SheetFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!selected || submit.isPending || overLimit}>
            {submit.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />}
            Enviar solicitação
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
