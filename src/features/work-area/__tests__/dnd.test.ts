import { describe, it, expect } from "vitest";
import {
  cardDragId,
  columnDragId,
  isPanelDrag,
  panelDragId,
  parseDragId,
} from "../dnd";

describe("*DragId builders", () => {
  it("panelDragId aplica o prefixo panel:", () => {
    expect(panelDragId("abc")).toBe("panel:abc");
  });
  it("columnDragId aplica o prefixo column:", () => {
    expect(columnDragId("abc")).toBe("column:abc");
  });
  it("cardDragId aplica o prefixo card:", () => {
    expect(cardDragId("abc")).toBe("card:abc");
  });
});

describe("parseDragId", () => {
  it("interpreta panel:", () => {
    expect(parseDragId("panel:X")).toEqual({ kind: "panel", id: "X" });
  });
  it("interpreta column:", () => {
    expect(parseDragId("column:X")).toEqual({ kind: "column", id: "X" });
  });
  it("interpreta card:", () => {
    expect(parseDragId("card:X")).toEqual({ kind: "card", id: "X" });
  });
  it("rejeita prefixo desconhecido", () => {
    expect(parseDragId("row:X")).toBeNull();
  });
  it("rejeita string vazia", () => {
    expect(parseDragId("")).toBeNull();
  });
  it("rejeita id sem sufixo", () => {
    expect(parseDragId("panel:")).toBeNull();
  });
  it("cada tipo não é interpretado como outro (roundtrip)", () => {
    const uuid = "12345678-1234-4000-8000-000000000000";
    expect(parseDragId(panelDragId(uuid))).toEqual({ kind: "panel", id: uuid });
    expect(parseDragId(columnDragId(uuid))).toEqual({
      kind: "column",
      id: uuid,
    });
    expect(parseDragId(cardDragId(uuid))).toEqual({ kind: "card", id: uuid });
  });
});

describe("isPanelDrag", () => {
  it("true para dragData de painel", () => {
    expect(isPanelDrag({ type: "panel", panelId: "p1" })).toBe(true);
  });
  it("false para dragData de coluna/card", () => {
    expect(isPanelDrag({ type: "column", panelId: "p", columnId: "c" })).toBe(
      false,
    );
    expect(
      isPanelDrag({ type: "card", panelId: "p", columnId: "c", cardId: "x" }),
    ).toBe(false);
  });
  it("false para valores inválidos", () => {
    expect(isPanelDrag(null)).toBe(false);
    expect(isPanelDrag(undefined)).toBe(false);
    expect(isPanelDrag("panel")).toBe(false);
    expect(isPanelDrag({})).toBe(false);
  });
});
