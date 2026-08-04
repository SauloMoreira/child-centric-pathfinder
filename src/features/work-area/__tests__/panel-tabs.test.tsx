import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PanelTabs } from "../components/PanelTabs";
import { createTestQueryClient } from "@/test/test-utils";
import {
  SYN_DEFENDER_A,
  SYN_PANEL_1,
  SYN_PANEL_2,
  createAccessFixture,
  createPanelFixture,
} from "@/test/fixtures/work-area";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    reorderPanels: vi.fn(async () => ({ ok: true, count: 0 })),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = createTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const owner = createAccessFixture("owner");
const teamReadonly = createAccessFixture("team_readonly");

function panelsFactory() {
  return [
    createPanelFixture({
      id: SYN_PANEL_1,
      defenderUserId: SYN_DEFENDER_A,
      name: "Um",
      position: 0,
    }),
    createPanelFixture({
      id: SYN_PANEL_2,
      defenderUserId: SYN_DEFENDER_A,
      name: "Dois",
      position: 1,
    }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PanelTabs — renderização", () => {
  it("renderiza cada Painel com seu nome", () => {
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panelsFactory()}
        selectedId={SYN_PANEL_1}
        onSelect={() => {}}
        access={owner}
        onCreate={() => {}}
        onRename={() => {}}
        onArchive={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByText("Um")).toBeInTheDocument();
    expect(screen.getByText("Dois")).toBeInTheDocument();
  });

  it("marca aba selecionada com aria-current='page'", () => {
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panelsFactory()}
        selectedId={SYN_PANEL_2}
        onSelect={() => {}}
        access={owner}
        onCreate={() => {}}
        onRename={() => {}}
        onArchive={() => {}}
      />,
      { wrapper },
    );
    const current = screen.getByText("Dois").closest("button");
    expect(current).toHaveAttribute("aria-current", "page");
    const other = screen.getByText("Um").closest("button");
    expect(other).not.toHaveAttribute("aria-current", "page");
  });

  it("chama onSelect ao clicar em uma aba", () => {
    const onSelect = vi.fn();
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panelsFactory()}
        selectedId={SYN_PANEL_1}
        onSelect={onSelect}
        access={owner}
        onCreate={() => {}}
        onRename={() => {}}
        onArchive={() => {}}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByText("Dois"));
    expect(onSelect).toHaveBeenCalledWith(SYN_PANEL_2);
  });
});

describe("PanelTabs — permissões", () => {
  it("owner vê botão 'Criar painel'", () => {
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panelsFactory()}
        selectedId={SYN_PANEL_1}
        onSelect={() => {}}
        access={owner}
        onCreate={() => {}}
        onRename={() => {}}
        onArchive={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByRole("button", { name: /criar painel/i })).toBeInTheDocument();
  });

  it("team_readonly não vê botão 'Criar painel' nem menu de ações", () => {
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panelsFactory()}
        selectedId={SYN_PANEL_1}
        onSelect={() => {}}
        access={teamReadonly}
        onCreate={() => {}}
        onRename={() => {}}
        onArchive={() => {}}
      />,
      { wrapper },
    );
    expect(screen.queryByRole("button", { name: /criar painel/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Ações do Painel/i)).not.toBeInTheDocument();
  });
});

describe("PanelTabs — sem limite de Painéis (AJUSTE 13)", () => {
  it("com 8 painéis o botão de criação continua habilitado", () => {
    const panels = Array.from({ length: 8 }, (_, i) =>
      createPanelFixture({
        id: `00000000-1111-4000-8000-00000000000${i}`,
        defenderUserId: SYN_DEFENDER_A,
        position: i,
        name: `P${i}`,
      }),
    );
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panels}
        selectedId={panels[0].id}
        onSelect={() => {}}
        access={owner}
        onCreate={() => {}}
        onRename={() => {}}
        onArchive={() => {}}
      />,
      { wrapper },
    );
    const btn = screen.getByRole("button", { name: /criar painel/i });
    expect(btn).not.toBeDisabled();
  });

  it("com 12 painéis (acima do antigo limite de 8) o botão de criação continua habilitado", () => {
    const panels = Array.from({ length: 12 }, (_, i) =>
      createPanelFixture({
        id: `00000000-1111-4000-8000-${String(i).padStart(12, "0")}`,
        defenderUserId: SYN_DEFENDER_A,
        position: i,
        name: `P${i}`,
      }),
    );
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panels}
        selectedId={panels[0].id}
        onSelect={() => {}}
        access={owner}
        onCreate={() => {}}
        onRename={() => {}}
        onArchive={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getAllByText(/^P\d+$/).length).toBe(12);
    const btn = screen.getByRole("button", { name: /criar painel/i });
    expect(btn).not.toBeDisabled();
  });
});

describe("PanelTabs — menu de ações do owner", () => {
  it("abre menu por Painel e dispara onRename / onArchive", async () => {
    const onRename = vi.fn();
    const onArchive = vi.fn();
    const panels = panelsFactory();
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panels}
        selectedId={SYN_PANEL_1}
        onSelect={() => {}}
        access={owner}
        onCreate={() => {}}
        onRename={onRename}
        onArchive={onArchive}
      />,
      { wrapper },
    );
    const trigger = screen.getByLabelText(`Ações do Painel ${panels[0].name}`);
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByText(/renomear/i));
    expect(onRename).toHaveBeenCalledWith(panels[0]);

    const trigger2 = screen.getByLabelText(`Ações do Painel ${panels[1].name}`);
    fireEvent.pointerDown(trigger2, { button: 0 });
    fireEvent.click(trigger2);
    const menu2 = await screen.findByRole("menu");
    fireEvent.click(within(menu2).getByText(/excluir/i));
    expect(onArchive).toHaveBeenCalledWith(panels[1]);
  });
});

describe("PanelTabs — acessibilidade DnD (limites do jsdom)", () => {
  it("owner produz atributos de sortable (role/tabindex) nas abas", () => {
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panelsFactory()}
        selectedId={SYN_PANEL_1}
        onSelect={() => {}}
        access={owner}
        onCreate={() => {}}
        onRename={() => {}}
        onArchive={() => {}}
      />,
      { wrapper },
    );
    // @dnd-kit anexa role="button" + aria-roledescription="sortable" quando o
    // KeyboardSensor está ativo. Confirmamos a presença desses atributos como
    // proxy testável em jsdom da configuração acessível.
    const sortables = document.querySelectorAll('[aria-roledescription="sortable"]');
    expect(sortables.length).toBe(2);
  });

  it("readonly não expõe atributos sortable (DnD desativado)", () => {
    render(
      <PanelTabs
        defenderUserId={SYN_DEFENDER_A}
        panels={panelsFactory()}
        selectedId={SYN_PANEL_1}
        onSelect={() => {}}
        access={teamReadonly}
        onCreate={() => {}}
        onRename={() => {}}
        onArchive={() => {}}
      />,
      { wrapper },
    );
    const sortables = document.querySelectorAll('[aria-roledescription="sortable"]');
    expect(sortables.length).toBe(0);
  });
});
