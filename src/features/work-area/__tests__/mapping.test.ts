import { describe, it, expect } from "vitest";
import { mapPanelRow, mapWorkArea } from "../mapping";
import {
  SYN_DEFENDER_A,
  SYN_DEFENDER_B,
  SYN_PANEL_1,
  SYN_PANEL_2,
} from "@/test/fixtures/work-area";

describe("mapPanelRow", () => {
  it("converte snake_case para o DTO camelCase", () => {
    const dto = mapPanelRow(SYN_DEFENDER_A, {
      id: SYN_PANEL_1,
      nome: "Painel 1",
      icone: "folder",
      order_position: 3,
      optimistic_version: 7,
      archived_at: null,
    });
    expect(dto).toEqual({
      id: SYN_PANEL_1,
      defenderUserId: SYN_DEFENDER_A,
      name: "Painel 1",
      icon: "folder",
      position: 3,
      optimisticVersion: 7,
      archivedAt: null,
    });
  });

  it("aceita chaves camelCase (retorno do ensure)", () => {
    const dto = mapPanelRow(SYN_DEFENDER_A, {
      id: SYN_PANEL_1,
      name: "Camel",
      icon: "briefcase",
      orderPosition: 2,
      optimisticVersion: 4,
      archivedAt: "2026-01-01T00:00:00Z",
    });
    expect(dto.name).toBe("Camel");
    expect(dto.icon).toBe("briefcase");
    expect(dto.position).toBe(2);
    expect(dto.optimisticVersion).toBe(4);
    expect(dto.archivedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("preserva o id exato", () => {
    const dto = mapPanelRow(SYN_DEFENDER_A, { id: SYN_PANEL_2 });
    expect(dto.id).toBe(SYN_PANEL_2);
  });

  it("propaga o defensor recebido como parâmetro", () => {
    const dto = mapPanelRow(SYN_DEFENDER_B, { id: SYN_PANEL_1 });
    expect(dto.defenderUserId).toBe(SYN_DEFENDER_B);
  });

  it("trata ícone nulo/omitido preservando null", () => {
    const nullo = mapPanelRow(SYN_DEFENDER_A, { id: SYN_PANEL_1, icone: null });
    const omitido = mapPanelRow(SYN_DEFENDER_A, { id: SYN_PANEL_1 });
    expect(nullo.icon).toBeNull();
    expect(omitido.icon).toBeNull();
  });

  it("trata archived_at ausente como null", () => {
    const dto = mapPanelRow(SYN_DEFENDER_A, { id: SYN_PANEL_1 });
    expect(dto.archivedAt).toBeNull();
  });

  it("aceita optimistic_version chegando como string numérica", () => {
    const dto = mapPanelRow(SYN_DEFENDER_A, {
      id: SYN_PANEL_1,
      optimistic_version: "9",
    });
    expect(dto.optimisticVersion).toBe(9);
    expect(typeof dto.optimisticVersion).toBe("number");
  });

  it("não invade propriedades não declaradas no DTO", () => {
    const dto = mapPanelRow(SYN_DEFENDER_A, { id: SYN_PANEL_1 });
    expect(Object.keys(dto).sort()).toEqual(
      [
        "archivedAt",
        "defenderUserId",
        "icon",
        "id",
        "name",
        "optimisticVersion",
        "position",
      ].sort(),
    );
    // Órgão não faz parte da identidade do Painel.
    expect(Object.keys(dto)).not.toContain("orgaoId");
    expect(Object.keys(dto)).not.toContain("orgao_id");
  });

  it("default de posição = 0 quando não informada", () => {
    const dto = mapPanelRow(SYN_DEFENDER_A, { id: SYN_PANEL_1 });
    expect(dto.position).toBe(0);
  });

  it("default de optimisticVersion = 1 quando ausente", () => {
    const dto = mapPanelRow(SYN_DEFENDER_A, { id: SYN_PANEL_1 });
    expect(dto.optimisticVersion).toBe(1);
  });
});

describe("mapWorkArea", () => {
  it("ordena Painéis por posição", () => {
    const wa = mapWorkArea({
      defenderUserId: SYN_DEFENDER_A,
      panelCount: 3,
      panels: [
        { id: "p-b", nome: "B", order_position: 2 },
        { id: "p-a", nome: "A", order_position: 0 },
        { id: "p-c", nome: "C", order_position: 1 },
      ],
      access: { accessMode: "owner" },
    });
    expect(wa.panels.map((p) => p.id)).toEqual(["p-a", "p-c", "p-b"]);
  });

  it("preserva activePanelId quando informado", () => {
    const wa = mapWorkArea({
      defenderUserId: SYN_DEFENDER_A,
      activePanelId: SYN_PANEL_2,
      panelCount: 2,
      panels: [
        { id: SYN_PANEL_1, nome: "P1", order_position: 0 },
        { id: SYN_PANEL_2, nome: "P2", order_position: 1 },
      ],
      access: { accessMode: "owner" },
    });
    expect(wa.activePanelId).toBe(SYN_PANEL_2);
  });

  it("faz fallback para o primeiro Painel quando activePanelId ausente", () => {
    const wa = mapWorkArea({
      defenderUserId: SYN_DEFENDER_A,
      panels: [
        { id: SYN_PANEL_2, order_position: 1 },
        { id: SYN_PANEL_1, order_position: 0 },
      ],
      access: { accessMode: "owner" },
    });
    expect(wa.activePanelId).toBe(SYN_PANEL_1);
  });

  it("panelCount reflete a lista quando ausente da resposta", () => {
    const wa = mapWorkArea({
      defenderUserId: SYN_DEFENDER_A,
      panels: [{ id: SYN_PANEL_1 }, { id: SYN_PANEL_2 }],
      access: { accessMode: "owner" },
    });
    expect(wa.panelCount).toBe(2);
  });

  it("access owner libera todas as capabilities", () => {
    const wa = mapWorkArea({
      defenderUserId: SYN_DEFENDER_A,
      panels: [],
      access: { accessMode: "owner" },
    });
    expect(wa.access.canManagePanels).toBe(true);
    expect(wa.access.canManageColumns).toBe(true);
    expect(wa.access.canMoveCards).toBe(true);
    expect(wa.access.canAddItems).toBe(true);
    expect(wa.access.canView).toBe(true);
  });

  it("access team_readonly bloqueia todas as mutações", () => {
    const wa = mapWorkArea({
      defenderUserId: SYN_DEFENDER_A,
      panels: [],
      access: { accessMode: "team_readonly" },
    });
    expect(wa.access.canView).toBe(true);
    expect(wa.access.canManagePanels).toBe(false);
    expect(wa.access.canManageColumns).toBe(false);
    expect(wa.access.canMoveCards).toBe(false);
    expect(wa.access.canAddItems).toBe(false);
  });

  it("access technical_readonly bloqueia todas as mutações", () => {
    const wa = mapWorkArea({
      defenderUserId: SYN_DEFENDER_A,
      panels: [],
      access: { accessMode: "technical_readonly" },
    });
    expect(wa.access.canView).toBe(true);
    expect(wa.access.canManagePanels).toBe(false);
  });

  it("access none bloqueia inclusive leitura", () => {
    const wa = mapWorkArea({
      defenderUserId: SYN_DEFENDER_A,
      panels: [],
      access: { accessMode: "none" },
    });
    expect(wa.access.canView).toBe(false);
    expect(wa.access.canManagePanels).toBe(false);
  });

  it("aceita defensor via snake_case", () => {
    const wa = mapWorkArea({
      defensor_user_id: SYN_DEFENDER_B,
      panels: [{ id: SYN_PANEL_1, order_position: 0 }],
      access: { accessMode: "owner" },
    });
    expect(wa.defenderUserId).toBe(SYN_DEFENDER_B);
    expect(wa.panels[0].defenderUserId).toBe(SYN_DEFENDER_B);
  });

  it("Painéis diferentes de Defensores diferentes não se misturam", () => {
    const a = mapWorkArea({
      defenderUserId: SYN_DEFENDER_A,
      panels: [{ id: SYN_PANEL_1, order_position: 0 }],
      access: { accessMode: "owner" },
    });
    const b = mapWorkArea({
      defenderUserId: SYN_DEFENDER_B,
      panels: [{ id: SYN_PANEL_2, order_position: 0 }],
      access: { accessMode: "owner" },
    });
    expect(a.panels[0].defenderUserId).toBe(SYN_DEFENDER_A);
    expect(b.panels[0].defenderUserId).toBe(SYN_DEFENDER_B);
    expect(a.panels[0].id).not.toBe(b.panels[0].id);
  });
});
