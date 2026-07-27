import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSelectedPanel } from "../hooks";
import {
  SYN_DEFENDER_A,
  SYN_DEFENDER_B,
  SYN_PANEL_1,
  SYN_PANEL_2,
  createPanelFixture,
} from "@/test/fixtures/work-area";

const STORAGE_KEY = (uid: string) => `orienta-dpe:selected-panel:${uid}`;

beforeEach(() => {
  window.localStorage.clear();
});

describe("useSelectedPanel", () => {
  const panelsA = [
    createPanelFixture({ id: SYN_PANEL_1, defenderUserId: SYN_DEFENDER_A, position: 0 }),
    createPanelFixture({ id: SYN_PANEL_2, defenderUserId: SYN_DEFENDER_A, position: 1 }),
  ];

  it("seleciona o primeiro Painel quando não há preferência salva", () => {
    const { result } = renderHook(() =>
      useSelectedPanel(SYN_DEFENDER_A, panelsA),
    );
    expect(result.current.selectedId).toBe(SYN_PANEL_1);
    expect(result.current.selectedPanel?.id).toBe(SYN_PANEL_1);
  });

  it("recupera preferência válida do localStorage", () => {
    window.localStorage.setItem(STORAGE_KEY(SYN_DEFENDER_A), SYN_PANEL_2);
    const { result } = renderHook(() =>
      useSelectedPanel(SYN_DEFENDER_A, panelsA),
    );
    expect(result.current.selectedId).toBe(SYN_PANEL_2);
  });

  it("ignora preferência inexistente e volta para o primeiro Painel", () => {
    window.localStorage.setItem(STORAGE_KEY(SYN_DEFENDER_A), "id-inexistente");
    const { result } = renderHook(() =>
      useSelectedPanel(SYN_DEFENDER_A, panelsA),
    );
    expect(result.current.selectedId).toBe(SYN_PANEL_1);
    // Substituiu a preferência inválida.
    expect(window.localStorage.getItem(STORAGE_KEY(SYN_DEFENDER_A))).toBe(
      SYN_PANEL_1,
    );
  });

  it("select() persiste no storage", () => {
    const { result } = renderHook(() =>
      useSelectedPanel(SYN_DEFENDER_A, panelsA),
    );
    act(() => result.current.select(SYN_PANEL_2));
    expect(result.current.selectedId).toBe(SYN_PANEL_2);
    expect(window.localStorage.getItem(STORAGE_KEY(SYN_DEFENDER_A))).toBe(
      SYN_PANEL_2,
    );
  });

  it("isola preferência por Defensor", () => {
    window.localStorage.setItem(STORAGE_KEY(SYN_DEFENDER_A), SYN_PANEL_2);
    const { result: a } = renderHook(() =>
      useSelectedPanel(SYN_DEFENDER_A, panelsA),
    );
    const panelsB = [
      createPanelFixture({
        id: "00000000-1111-4000-8000-0000000000B0",
        defenderUserId: SYN_DEFENDER_B,
        position: 0,
      }),
    ];
    const { result: b } = renderHook(() =>
      useSelectedPanel(SYN_DEFENDER_B, panelsB),
    );
    expect(a.current.selectedId).toBe(SYN_PANEL_2);
    expect(b.current.selectedId).not.toBe(SYN_PANEL_2);
  });

  it("mudança de Defensor troca o painel selecionado", () => {
    const panelsB = [
      createPanelFixture({
        id: "00000000-1111-4000-8000-0000000000B1",
        defenderUserId: SYN_DEFENDER_B,
        position: 0,
      }),
    ];
    const { result, rerender } = renderHook(
      ({ uid, panels }) => useSelectedPanel(uid, panels),
      { initialProps: { uid: SYN_DEFENDER_A, panels: panelsA } },
    );
    expect(result.current.selectedId).toBe(SYN_PANEL_1);
    rerender({ uid: SYN_DEFENDER_B, panels: panelsB });
    expect(result.current.selectedId).toBe(panelsB[0].id);
  });

  it("lista vazia → selectedId null", () => {
    const { result } = renderHook(() => useSelectedPanel(SYN_DEFENDER_A, []));
    expect(result.current.selectedId).toBeNull();
    expect(result.current.selectedPanel).toBeNull();
  });

  it("defenderUserId null → selectedId null e nenhuma escrita no storage", () => {
    const { result } = renderHook(() => useSelectedPanel(null, panelsA));
    expect(result.current.selectedId).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("armazena apenas o ID (nunca o DTO completo)", () => {
    const { result } = renderHook(() =>
      useSelectedPanel(SYN_DEFENDER_A, panelsA),
    );
    act(() => result.current.select(SYN_PANEL_2));
    const stored = window.localStorage.getItem(STORAGE_KEY(SYN_DEFENDER_A));
    expect(stored).toBe(SYN_PANEL_2);
    expect(stored).not.toContain("{");
    expect(stored).not.toContain("name");
  });
});
