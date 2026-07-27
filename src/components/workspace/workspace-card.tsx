import { useEffect, useState } from "react";
import { AlertCircle, Baby, Clock, Home, Scale, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { AssistidoCard } from "@/hooks/use-workspace";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function useAssistidoFotoUrl(
  fotoUrl: string | null | undefined,
  fotoPath: string | null | undefined,
) {
  const [url, setUrl] = useState<string | null>(fotoUrl ?? null);
  useEffect(() => {
    if (fotoUrl) {
      setUrl(fotoUrl);
      return;
    }
    if (!fotoPath) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("assistidos-fotos")
      .createSignedUrl(fotoPath, 60 * 60, {
        transform: { width: 192, height: 192, resize: "cover", quality: 75 },
      })
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [fotoUrl, fotoPath]);
  return url;
}

const SITUACAO_LABEL: Record<string, string> = {
  familia_natural: "Família natural",
  familia_extensa: "Família extensa",
  familia_substituta: "Família substituta",
  acolhimento_institucional: "Acolh. institucional",
  acolhimento_familiar: "Acolh. familiar",
  guarda_provisoria: "Guarda provisória",
  adocao_acompanhamento: "Adoção acompanhada",
  situacao_rua: "Situação de rua",
  nao_informado: "Não informado",
  outro: "Outro",
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const now = new Date();
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function WorkspaceCard({
  data,
  onClick,
}: {
  data: AssistidoCard;
  onClick?: () => void;
}) {
  const prazoDias = daysUntil(
    data.prazo_processo_mais_proximo ?? data.prazo_providencia_mais_proximo,
  );
  const prazoVencido = prazoDias != null && prazoDias < 0;
  const prazoProximo = prazoDias != null && prazoDias >= 0 && prazoDias <= 7;
  const fotoUrl = useAssistidoFotoUrl(data.foto_url, data.foto_path);

  return (
    <TooltipProvider delayDuration={300}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group flex w-full rounded-md border border-border bg-canvas p-3 text-left text-sm transition",
          "hover:border-institutional/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-institutional/50",
        )}
      >
        {/* Foto/iniciais: quadrada, preenchendo toda a altura disponível do card.
            Conteúdo absoluto para não interferir no sizing do container
            (evita feedback de tamanho intrínseco do <img>). */}
        <div className="relative flex aspect-square shrink-0 self-stretch items-center justify-center overflow-hidden rounded-md bg-muted font-mono text-base font-semibold text-muted-foreground">
          {fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fotoUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-1 text-center leading-tight">
              {initials(data.nome_completo)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 pl-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {data.nome_social || data.nome_completo}
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Baby className="h-3 w-3" aria-hidden />
                    <span className="cursor-help">
                      {data.idade} anos · {data.faixa_etaria === "crianca" ? "Criança" : "Adolescente"}
                    </span>
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  {data.data_nascimento
                    ? `Nascimento: ${new Date(data.data_nascimento + "T00:00:00").toLocaleDateString("pt-BR")}`
                    : "Data de nascimento não informada"}
                </TooltipContent>
              </Tooltip>
            </div>
            {(prazoVencido || prazoProximo) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      prazoVencido
                        ? "bg-destructive/15 text-destructive"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                    )}
                    aria-label={prazoVencido ? "Prazo vencido" : "Prazo próximo"}
                  >
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {prazoVencido
                    ? `Prazo vencido há ${Math.abs(prazoDias!)} dias`
                    : `Prazo em ${prazoDias} dias`}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center rounded border border-border bg-surface px-1.5 py-0.5">
              {SITUACAO_LABEL[data.situacao_atual] ?? data.situacao_atual}
            </span>
            {data.entidade_acolhimento && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5">
                    <Home className="h-3 w-3" aria-hidden />
                    {data.tempo_acolhimento_dias ?? 0}d
                  </span>
                </TooltipTrigger>
                <TooltipContent>{data.entidade_acolhimento}</TooltipContent>
              </Tooltip>
            )}
            {data.processos_ativos > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5">
                    <Scale className="h-3 w-3" aria-hidden />
                    {data.processos_ativos}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {data.processos_ativos} processo(s) ativo(s)
                </TooltipContent>
              </Tooltip>
            )}
            {data.providencias_pendentes > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5">
                    <Clock className="h-3 w-3" aria-hidden />
                    {data.providencias_pendentes}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {data.providencias_pendentes} providência(s) pendente(s)
                </TooltipContent>
              </Tooltip>
            )}
            {data.total_irmaos > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5">
                    <Users className="h-3 w-3" aria-hidden />
                    {data.total_irmaos}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{data.total_irmaos} irmão(s) cadastrado(s)</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </button>
    </TooltipProvider>
  );
}

export function WorkspaceCardSkeleton() {
  return (
    <div className="animate-pulse rounded-md border border-border bg-canvas p-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-muted" />
          <div className="h-2 w-1/2 rounded bg-muted" />
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-4 w-10 rounded bg-muted" />
      </div>
    </div>
  );
}
