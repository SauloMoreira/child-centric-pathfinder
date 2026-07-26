import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { AssistidoCard } from "@/hooks/use-workspace";
import { Baby, Calendar, Home, Pencil, Scale, Users, UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssistidoFull } from "@/hooks/use-assistido-full";
import { useAtualizarAnotacoes } from "@/hooks/use-cadastro-assistido";
import { CadastrarCriancaSheet } from "@/components/assistidos/cadastrar-crianca-sheet";
import { CadastrarAdultoSheet } from "@/components/assistidos/cadastrar-adulto-sheet";

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

const VINCULO_LABEL: Record<string, string> = {
  pai: "Pai",
  mae: "Mãe",
  familia_extensa: "Família extensa",
  irmao: "Irmão(ã)",
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
  onOpenCard,
}: {
  card: AssistidoCard | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenCard?: (assistidoId: string) => void;
}) {
  const { data, isLoading } = useAssistidoDetalhe(card?.id ?? null);
  const full = useAssistidoFull(card?.id ?? null, open);
  const atualizarAnot = useAtualizarAnotacoes();

  const [editOpen, setEditOpen] = useState(false);
  const [anotacoes, setAnotacoes] = useState("");
  const [anotacoesLoaded, setAnotacoesLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    if (!open) {
      setAnotacoes("");
      setAnotacoesLoaded(false);
      setSavedAt(null);
      lastSavedRef.current = "";
      return;
    }
  }, [open, card?.id]);

  useEffect(() => {
    if (!open || anotacoesLoaded) return;
    if (full.data?.record) {
      const v = full.data.record.observacoes ?? "";
      setAnotacoes(v);
      lastSavedRef.current = v;
      setAnotacoesLoaded(true);
    }
  }, [open, full.data, anotacoesLoaded]);

  useEffect(() => {
    if (!anotacoesLoaded || !card?.id) return;
    if (anotacoes === lastSavedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await atualizarAnot.mutateAsync({ assistidoId: card.id, observacoes: anotacoes });
        lastSavedRef.current = anotacoes;
        setSavedAt(new Date());
      } catch {
        /* silencioso; usuário pode tentar novamente ao continuar digitando */
      }
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [anotacoes, anotacoesLoaded, card?.id, atualizarAnot]);

  const idade = card?.idade ?? 0;

  const adultosVinculados = useMemo(() => {
    return (full.data?.vinculos ?? []).filter(
      (v) => v.outro_categoria === "adulto",
    );
  }, [full.data]);

  const categoriaCard = full.data?.record?.categoria ?? "crianca_adolescente";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {!card ? (
            <SheetHeader>
              <SheetTitle>Selecione um cadastro</SheetTitle>
            </SheetHeader>
          ) : (
            <>
              <SheetHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SheetTitle className="text-xl truncate">
                      {card.nome_social || card.nome_completo}
                    </SheetTitle>
                    <SheetDescription>
                      <span className="inline-flex items-center gap-1">
                        <Baby className="h-3 w-3" aria-hidden />
                        {idade} anos ·{" "}
                        {card.faixa_etaria === "crianca" ? "Criança" : card.faixa_etaria === "adolescente" ? "Adolescente" : "—"}
                      </span>
                    </SheetDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditOpen(true)}
                    disabled={!full.data?.record}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Button>
                </div>
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
                      {card.entidade_acolhimento} · {card.tempo_acolhimento_dias ?? 0} dias
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
                          <div key={p.id} className="rounded-md border border-border bg-surface p-3 text-sm">
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
                          <p className="text-xs text-muted-foreground">Nenhum processo cadastrado.</p>
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
                          <div key={f.id} className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm">
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
                          <p className="text-xs text-muted-foreground">Nenhum vínculo familiar cadastrado.</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" aria-hidden />
                          Adultos vinculados ({adultosVinculados.length})
                        </span>
                      </h3>
                      <div className="mt-2 space-y-1.5">
                        {full.isLoading ? (
                          <Skeleton className="h-10 w-full" />
                        ) : adultosVinculados.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Nenhum adulto vinculado a este cadastro.
                          </p>
                        ) : (
                          adultosVinculados.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => onOpenCard?.(v.outro_id)}
                              className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-left text-sm transition hover:border-institutional/40 hover:bg-institutional/5"
                            >
                              <div className="min-w-0">
                                <p className="truncate">{v.outro_nome}</p>
                                <p className="text-xs text-muted-foreground">
                                  {VINCULO_LABEL[v.tipo] ?? v.tipo}
                                </p>
                              </div>
                              <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                                abrir
                              </span>
                            </button>
                          ))
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
                            <div key={p.id} className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
                              <p>{p.descricao}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Prioridade {p.prioridade}
                                {p.prazo && ` · prazo ${p.prazo}`}
                              </p>
                            </div>
                          ))}
                        {(data?.providencias ?? []).filter((p) => !p.concluida_em).length === 0 && (
                          <p className="text-xs text-muted-foreground">Nenhuma providência pendente.</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground">
                          Anotações
                        </h3>
                        <span className="text-[10px] text-muted-foreground">
                          {atualizarAnot.isPending
                            ? "Salvando…"
                            : savedAt
                              ? `Salvo às ${savedAt.toLocaleTimeString()}`
                              : ""}
                        </span>
                      </div>
                      <Textarea
                        value={anotacoes}
                        onChange={(e) => setAnotacoes(e.target.value)}
                        placeholder="Registre observações internas sobre este cadastro…"
                        className="mt-2 min-h-32 text-sm"
                        maxLength={8000}
                        disabled={!anotacoesLoaded}
                      />
                    </section>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {card && categoriaCard === "crianca_adolescente" && (
        <CadastrarCriancaSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          orgaoId={full.data?.record?.orgao_execucao_id ?? null}
          assistidoId={card.id}
        />
      )}
      {card && categoriaCard === "adulto" && (
        <CadastrarAdultoSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          orgaoId={full.data?.record?.orgao_execucao_id ?? null}
          assistidoId={card.id}
        />
      )}
    </>
  );
}
