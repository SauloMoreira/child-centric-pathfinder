import { describe, it, expect } from "vitest";
import { workAreaKeys } from "@/lib/workspace-keys";
import {
  SYN_COLUMN_1,
  SYN_DEFENDER_A,
  SYN_DEFENDER_B,
  SYN_PANEL_1,
  SYN_PANEL_2,
} from "@/test/fixtures/work-area";

describe("workAreaKeys", () => {
  it("all é a raiz estável", () => {
    expect(workAreaKeys.all).toEqual(["work-area"]);
  });

  it("byDefender inclui o defensor na chave", () => {
    const k = workAreaKeys.byDefender(SYN_DEFENDER_A);
    expect(k).toContain(SYN_DEFENDER_A);
    expect(k[0]).toBe("work-area");
    expect(k).toContain("defender");
  });

  it("panels() ancorado em byDefender()", () => {
    const key = workAreaKeys.panels(SYN_DEFENDER_A);
    expect(key.slice(0, workAreaKeys.byDefender(SYN_DEFENDER_A).length)).toEqual(
      workAreaKeys.byDefender(SYN_DEFENDER_A),
    );
    expect(key[key.length - 1]).toBe("panels");
  });

  it("panel() inclui panelId ancorado em byDefender()", () => {
    const key = workAreaKeys.panel(SYN_DEFENDER_A, SYN_PANEL_1);
    expect(key).toContain(SYN_PANEL_1);
  });

  it("columns() inclui panelId + segmento columns", () => {
    const key = workAreaKeys.columns(SYN_DEFENDER_A, SYN_PANEL_1);
    expect(key).toContain(SYN_PANEL_1);
    expect(key[key.length - 1]).toBe("columns");
  });

  it("cards() inclui panelId, columnId e segmento cards", () => {
    const key = workAreaKeys.cards(SYN_DEFENDER_A, SYN_PANEL_1, SYN_COLUMN_1);
    expect(key).toContain(SYN_PANEL_1);
    expect(key).toContain(SYN_COLUMN_1);
    expect(key[key.length - 1]).toBe("cards");
  });

  it("isolamento por Defensor (mesmo panelId, defensor diferente ⇒ chave diferente)", () => {
    const a = workAreaKeys.panel(SYN_DEFENDER_A, SYN_PANEL_1);
    const b = workAreaKeys.panel(SYN_DEFENDER_B, SYN_PANEL_1);
    expect(a).not.toEqual(b);
  });

  it("isolamento por Painel (mesmo defensor, painel diferente ⇒ chave diferente)", () => {
    const a = workAreaKeys.panel(SYN_DEFENDER_A, SYN_PANEL_1);
    const b = workAreaKeys.panel(SYN_DEFENDER_A, SYN_PANEL_2);
    expect(a).not.toEqual(b);
  });

  it("nenhuma chave menciona órgão", () => {
    const keys = [
      workAreaKeys.all,
      workAreaKeys.byDefender(SYN_DEFENDER_A),
      workAreaKeys.panels(SYN_DEFENDER_A),
      workAreaKeys.panel(SYN_DEFENDER_A, SYN_PANEL_1),
      workAreaKeys.columns(SYN_DEFENDER_A, SYN_PANEL_1),
      workAreaKeys.cards(SYN_DEFENDER_A, SYN_PANEL_1, SYN_COLUMN_1),
    ];
    for (const k of keys) {
      const joined = k.join("|").toLowerCase();
      expect(joined).not.toContain("orgao");
      expect(joined).not.toContain("orgao_id");
      expect(joined).not.toContain("orgaoid");
    }
  });

  it("estabilidade — chamadas idempotentes produzem valores estruturalmente iguais", () => {
    expect(workAreaKeys.panels(SYN_DEFENDER_A)).toEqual(workAreaKeys.panels(SYN_DEFENDER_A));
  });
});
