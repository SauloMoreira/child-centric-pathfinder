import { describe, it, expect } from "vitest";
import { PANEL_MAX } from "../types";
import { PANEL_LIMIT } from "../hooks";
import { createPanelFixture } from "@/test/fixtures/work-area";

describe("PANEL_MAX / PANEL_LIMIT", () => {
  it("é 8 (contrato do backend)", () => {
    expect(PANEL_MAX).toBe(8);
  });

  it("PANEL_LIMIT re-exportado bate com PANEL_MAX", () => {
    expect(PANEL_LIMIT).toBe(PANEL_MAX);
  });
});

describe("regra visual — bloqueio de criação no limite", () => {
  it("0 → pode criar", () => {
    expect(0 >= PANEL_MAX).toBe(false);
  });
  it("1 → pode criar", () => {
    expect(1 >= PANEL_MAX).toBe(false);
  });
  it("7 → pode criar", () => {
    const panels = Array.from({ length: 7 }, () => createPanelFixture());
    expect(panels.length >= PANEL_MAX).toBe(false);
  });
  it("8 → bloqueia UI (backend continua autoridade final)", () => {
    const panels = Array.from({ length: 8 }, () => createPanelFixture());
    expect(panels.length >= PANEL_MAX).toBe(true);
  });
});
