// Ajuste doc (AJUSTE 21) — caixinha flutuante de estatísticas ao passar o
// mouse no ícone de favoritar de um Atendimento ou Cota: inserções em
// painéis e itens criados a partir deste(a) como referência.
// Ajuste doc (PÁGINA BIBLIOTECA) — a contagem de acessos foi retirada de
// toda e qualquer exibição do sistema Ágora; o valor ainda existe na base
// (obterEstatisticasBiblioteca continua retornando access_count), só não é
// mais mostrado aqui.
// Consulta é preguiçosa (só dispara quando o tooltip realmente abre), para
// não gerar uma rajada de requisições ao renderizar uma lista inteira de
// cards da Biblioteca.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { obterEstatisticasBiblioteca } from "@/lib/reintegra-api";

export function FavoritoEstatisticasTooltip({
  itemId,
  kind,
  children,
}: {
  itemId: string | null | undefined;
  kind: "atendimento" | "cota";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const stats = useQuery({
    queryKey: ["biblioteca-estatisticas", itemId],
    queryFn: () => obterEstatisticasBiblioteca(itemId as string),
    enabled: open && !!itemId,
    staleTime: 15_000,
  });

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="text-[11px] leading-relaxed">
        {stats.isLoading ? (
          <span>Carregando estatísticas…</span>
        ) : stats.isError ? (
          <span>Não foi possível carregar as estatísticas.</span>
        ) : (
          <div className="space-y-0.5">
            <p>{stats.data?.panel_insert_count ?? 0} inserções em painéis</p>
            <p>
              {stats.data?.criados_a_partir_count ?? 0} criados a partir de{kind === "cota" ? "sta" : "ste"}
            </p>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
