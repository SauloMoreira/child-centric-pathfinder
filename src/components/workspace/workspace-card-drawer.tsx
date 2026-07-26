import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { AssistidoCard } from "@/hooks/use-workspace";
import { Baby, Calendar, Home, Scale, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const SITUACAO_LABEL: Record<string, string> = {
  familia_natural: "Família natural",
  familia_extensa: "Família extensa",
  familia_substituta: "Família substituta",
  acolhimento_institucional: "Acolhimento institucional",
  acolhimento_familiar: "Acolhimento familiar",
  guarda_provisoria: "Guarda provisória",
  adocao_acompanhamento: "Adoção acompanhada",
  situacao_rua: "Situação de rua",
  nao_informado: "Não informado",
  outro: "Outro",
};

function useAssistidoDetalhe(id: string | null) {
  return useQuery({
    queryKey: ["assistido-detalhe", id],
    queryFn: async () => {
      if (!id) return null;
      const [{ data: acolh }, { data: proc }, { data: fam }, { data: prov }] =
        await Promise.all([
          supabase
            .from("assistido_acolhimentos")
            .select("id, tipo, entidade_nome, data_ingresso, data_saida, data_reavaliacao")
            .eq("assistido_id", id)
            .order("data_ingresso", { ascending: false }),
          supabase
            .from("assistido_processos")
            .select("id, numero_processo, tipo, situacao, prioridade, prazo_proximo, extrajudicial")
            .eq("assistido_id", id)
            .order("prazo_proximo", { ascending: true, nullsFirst: false }),
          supabase
            .from("assistido_familiares")
            .select("id, nome, parentesco, responsavel, assistido_pela_dpe")
            .eq("assistido_id", id),
          supabase
            .from("assistido_providencias")
            .select("id, descricao, prazo, prioridade, concluida_em")
            .eq("assistido_id", id)
            .order("prazo", { ascending: true, nullsFirst: false }),
        ]);
      return {
        acolhimentos: acolh ?? [],
        processos: proc ?? [],
        familiares: fam ?? [],
        providencias: prov ?? [],
      };
    },
    enabled: !!id,
  });
}

export function WorkspaceCardDrawer({
  card,
  open,
  onOpenChange,
}: {
  card: AssistidoCard | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useAssistidoDetalhe(card?.id ?? null);

  const idade = card?.idade ?? 0;
  const nascimento = useMemo(() => {
    if (!card) return null;
    // idade já derivada; poderíamos exibir data se disponível — omite por privacidade neste drawer
    return null;
  }, [card]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {!card ? (
          <SheetHeader>
            <SheetTitle>Selecione um cadastro</SheetTitle>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="text-xl">
                {card.nome_social || card.nome_completo}
              </SheetTitle>
              <SheetDescription>
                <span className="inline-flex items-center gap-1">
                  <Baby className="h-3 w-3" aria-hidden />
                  {idade} anos ·{" "}
                  {card.faixa_etaria === "crianca" ? "Criança" : "Adolescente"}
                </span>
                {nascimento && <span> · Nascimento: {nascimento}</span>}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6 pb-8">
              <section>
                <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground">
                  Situação atual
                </h3>
                <p className="mt-2 text-sm">
                  {SITUACAO_LABEL[card.situacao_atual] ?? card.situacao_atual}
                </p>
                {card.entidade_acolhimento && (
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <Home className="h-3 w-3" aria-hidden />
                    {card.entidade_acolhimento} ·{" "}
                    {card.tempo_acolhimento_dias ?? 0} dias
                  </p>
                )}
              </section>

              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <>
                  <section>
                    <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground">
                      Processos ({data?.processos.length ?? 0})
                    </h3>
                    <div className="mt-2 space-y-2">
                      {(data?.processos ?? []).map((p) => (
                        <div
                          key={p.id}
                          className="rounded-md border border-border bg-surface p-3 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs">
                              {p.numero_processo || "Sem número"}
                            </span>
                            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                              {p.situacao}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {p.tipo || "—"} · prioridade {p.prioridade}
                            {p.extrajudicial && " · extrajudicial"}
                          </p>
                          {p.prazo_proximo && (
                            <p className="mt-1 flex items-center gap-1 text-xs">
                              <Calendar className="h-3 w-3" aria-hidden />
                              Prazo: {p.prazo_proximo}
                            </p>
                          )}
                        </div>
                      ))}
                      {(!data?.processos || data.processos.length === 0) && (
                        <p className="text-xs text-muted-foreground">
                          Nenhum processo cadastrado.
                        </p>
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" aria-hidden />
                        Familiares ({data?.familiares.length ?? 0})
                      </span>
                    </h3>
                    <div className="mt-2 space-y-1.5">
                      {(data?.familiares ?? []).map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm"
                        >
                          <div>
                            <p>{f.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.parentesco}
                              {f.responsavel && " · responsável"}
                            </p>
                          </div>
                          {f.assistido_pela_dpe && (
                            <span className="rounded border border-institutional/30 bg-institutional/10 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-institutional">
                              DPE
                            </span>
                          )}
                        </div>
                      ))}
                      {(!data?.familiares || data.familiares.length === 0) && (
                        <p className="text-xs text-muted-foreground">
                          Nenhum vínculo familiar cadastrado.
                        </p>
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Scale className="h-3 w-3" aria-hidden />
                        Providências pendentes
                      </span>
                    </h3>
                    <div className="mt-2 space-y-1.5">
                      {(data?.providencias ?? [])
                        .filter((p) => !p.concluida_em)
                        .map((p) => (
                          <div
                            key={p.id}
                            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                          >
                            <p>{p.descricao}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Prioridade {p.prioridade}
                              {p.prazo && ` · prazo ${p.prazo}`}
                            </p>
                          </div>
                        ))}
                      {(data?.providencias ?? []).filter((p) => !p.concluida_em).length ===
                        0 && (
                        <p className="text-xs text-muted-foreground">
                          Nenhuma providência pendente.
                        </p>
                      )}
                    </div>
                  </section>
                </>
              )}

              <div className="border-t border-border pt-4">
                <Button variant="outline" disabled className="w-full">
                  Abrir perfil completo (disponível em fase futura)
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
