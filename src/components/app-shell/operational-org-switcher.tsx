import { useMemo, useState } from "react";
import { Building2, Check, ChevronDown, Globe2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  isAdminTecnico,
  useEstadoInstitucional,
} from "@/hooks/use-estado-institucional";
import { useOrgaosAcessiveis } from "@/hooks/use-orgaos-acessiveis";
import { useSelecionarContextoOrgao } from "@/hooks/use-selecionar-contexto-orgao";

export function OperationalOrgSwitcher() {
  const { data: estado } = useEstadoInstitucional();
  const [open, setOpen] = useState(false);
  const [termo, setTermo] = useState("");
  const tecnico = isAdminTecnico(estado);
  const selecionar = useSelecionarContextoOrgao();

  const orgaosQ = useOrgaosAcessiveis(termo, open);

  const contexto = estado?.contextoAtual ?? null;
  const disponiveisLocal = estado?.orgaosDisponiveis ?? null;

  const items = useMemo(() => {
    if (tecnico) {
      return (orgaosQ.data?.pages ?? []).flatMap((p) => p.items);
    }
    const base = (disponiveisLocal ?? []).map((o) => ({
      orgaoId: o.orgaoId,
      nome: o.nome,
      comarcas: [{ nome: o.comarca, principal: true }],
      membershipId: o.membershipId,
      selecionado: o.selecionado,
    }));
    if (!termo.trim()) return base;
    const t = termo.trim().toLowerCase();
    return base.filter(
      (o) =>
        o.nome.toLowerCase().includes(t) ||
        (o.comarcas[0]?.nome ?? "").toLowerCase().includes(t),
    );
  }, [tecnico, orgaosQ.data, disponiveisLocal, termo]);

  const semVinculos = !tecnico && (disponiveisLocal?.length ?? 0) === 0;

  async function escolher(orgaoId: string) {
    if (orgaoId === contexto?.orgaoId) {
      setOpen(false);
      return;
    }
    await selecionar.mutateAsync({
      orgaoId,
      expectedVersion: estado?.contextVersion ?? null,
    });
    setOpen(false);
  }

  // Membro/Defensor com 1 vínculo apenas: sem seletor, apenas badge estático.
  if (!tecnico && disponiveisLocal && disponiveisLocal.length <= 1) {
    if (!contexto) return null;
    return (
      <div className="hidden items-center gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-1.5 text-xs md:flex">
        <Building2 className="h-3.5 w-3.5 text-institutional" aria-hidden />
        <span className="max-w-[220px] truncate font-medium">{contexto.nome}</span>
        {contexto.comarca && (
          <span className="text-muted-foreground"> · {contexto.comarca}</span>
        )}
      </div>
    );
  }


  return (
    <div className="flex w-full flex-col gap-2">
      {tecnico && (
        <Badge
          variant="outline"
          className="hidden gap-1.5 border-institutional/50 bg-institutional/10 font-mono text-[10px] uppercase tracking-[0.16em] text-institutional md:inline-flex"
        >
          <Globe2 className="h-3 w-3" aria-hidden />
          Acesso global
        </Badge>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full justify-start gap-2 border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Selecionar órgão de trabalho"
          >
            <Building2 className="h-4 w-4 shrink-0 text-institutional" aria-hidden />
            <span className="flex-1 truncate text-left">
              {contexto?.nome ??
                (tecnico
                  ? "Selecionar órgão"
                  : semVinculos
                    ? "Sem vínculo"
                    : "Selecionar órgão")}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[360px] p-0">
          <div className="border-b border-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Órgão de trabalho
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A seleção altera apenas o contexto em uso. Vínculos permanecem
              ativos.
            </p>
            <div className="relative mt-3">
              <Search
                className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Buscar por órgão ou comarca…"
                className="h-8 pl-7 text-sm"
                aria-label="Buscar órgão"
              />
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto py-1">
            {semVinculos && (
              <p className="p-4 text-xs text-muted-foreground">
                Nenhum órgão de execução está vinculado à sua conta. Contate a
                administração institucional.
              </p>
            )}

            {tecnico && orgaosQ.isLoading && (
              <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Carregando órgãos…
              </div>
            )}

            {items.map((o) => {
              const atual = o.orgaoId === contexto?.orgaoId;
              const comarca = o.comarcas?.[0]?.nome ?? null;
              return (
                <button
                  key={o.orgaoId}
                  type="button"
                  onClick={() => escolher(o.orgaoId)}
                  disabled={selecionar.isPending}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                    atual && "bg-institutional/5",
                  )}
                >
                  <div className="mt-0.5 h-4 w-4 shrink-0">
                    {atual ? (
                      <Check
                        className="h-4 w-4 text-institutional"
                        aria-hidden
                      />
                    ) : (
                      <span className="block h-3 w-3 rounded-full border border-border" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.nome}</p>
                    {comarca && (
                      <p className="truncate text-xs text-muted-foreground">
                        Comarca: {comarca}
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
                </button>
              );
            })}

            {tecnico && orgaosQ.hasNextPage && (
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => orgaosQ.fetchNextPage()}
                  disabled={orgaosQ.isFetchingNextPage}
                >
                  {orgaosQ.isFetchingNextPage && (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
                  )}
                  Carregar mais
                </Button>
              </div>
            )}

            {!semVinculos && !tecnico && items.length === 0 && (
              <p className="p-4 text-xs text-muted-foreground">
                Nenhum órgão encontrado para "{termo}".
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
