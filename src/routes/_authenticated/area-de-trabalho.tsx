import { createFileRoute } from "@tanstack/react-router";
import { Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated/area-de-trabalho")({
  head: () => ({
    meta: [
      { title: "Área de trabalho — Reintegra" },
      {
        name: "description",
        content:
          "Área de trabalho colaborativa para atendimentos e cotas reutilizáveis.",
      },
    ],
  }),
  component: AreaDeTrabalhoPlaceholder,
});

function AreaDeTrabalhoPlaceholder() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="surface-panel p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Reintegra · Nova experiência
        </p>
        <div className="mt-3 flex items-start gap-4">
          <div
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-institutional"
          >
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Área de trabalho em remodelagem
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Em razão da determinação institucional de que o sistema não
              armazene dados de assistidos ou processos concretos, o Reintegra
              está sendo remodelado para uma plataforma colaborativa de{" "}
              <strong className="text-foreground">atendimentos</strong> e{" "}
              <strong className="text-foreground">cotas</strong> reutilizáveis.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Todas as funcionalidades anteriores baseadas em assistidos,
              crianças, adolescentes, processos, acolhimentos, familiares,
              providências e fotografias estão temporariamente indisponíveis e
              serão substituídas pela nova experiência nas próximas atualizações
              desta fase.
            </p>
          </div>
        </div>
      </div>

      <div className="surface-panel p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          O que vem a seguir
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Biblioteca institucional</strong> de
            atendimentos e cotas publicados por Defensores.
          </li>
          <li>
            <strong className="text-foreground">Área de trabalho por Defensor</strong>,
            organizada em colunas manuais, com importação e cópia editável.
          </li>
          <li>
            <strong className="text-foreground">Utilização temporária</strong> dos
            atendimentos, com geração local de texto, impressão e PDF, sem
            persistir nenhuma resposta preenchida.
          </li>
        </ul>
      </div>
    </div>
  );
}
