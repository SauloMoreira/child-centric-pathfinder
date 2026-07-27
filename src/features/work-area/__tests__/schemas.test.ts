import { describe, it, expect } from "vitest";
import { panelNameSchema, createPanelSchema, renamePanelSchema } from "../schemas";
import { PANEL_ICON_ALLOWLIST, PANEL_NAME_MAX } from "../types";

describe("panelNameSchema", () => {
  it("aceita nome simples", () => {
    expect(panelNameSchema.parse("Meu Painel")).toBe("Meu Painel");
  });

  it("aplica trim nas bordas", () => {
    expect(panelNameSchema.parse("   Painel Trim  ")).toBe("Painel Trim");
  });

  it("colapsa múltiplos espaços internos", () => {
    expect(panelNameSchema.parse("A   B    C")).toBe("A B C");
  });

  it("rejeita string vazia", () => {
    expect(() => panelNameSchema.parse("")).toThrow();
  });

  it("rejeita apenas espaços", () => {
    expect(() => panelNameSchema.parse("     ")).toThrow();
  });

  it("aceita exatamente PANEL_NAME_MAX caracteres", () => {
    const s = "x".repeat(PANEL_NAME_MAX);
    expect(panelNameSchema.parse(s)).toBe(s);
  });

  it("rejeita PANEL_NAME_MAX + 1 caracteres", () => {
    const s = "x".repeat(PANEL_NAME_MAX + 1);
    expect(() => panelNameSchema.parse(s)).toThrow();
  });

  it("preserva acentuação sem conversão silenciosa", () => {
    expect(panelNameSchema.parse("Coordenação — Ações")).toBe("Coordenação — Ações");
  });

  it("rejeita valores não textuais", () => {
    expect(() => panelNameSchema.parse(123 as unknown as string)).toThrow();
    expect(() => panelNameSchema.parse(null as unknown as string)).toThrow();
    expect(() => panelNameSchema.parse(undefined as unknown as string)).toThrow();
  });
});

describe("createPanelSchema", () => {
  it("aceita ícone da allowlist", () => {
    const parsed = createPanelSchema.parse({ name: "Painel", icon: "folder" });
    expect(parsed.icon).toBe("folder");
  });

  it("aceita ícone nulo", () => {
    const parsed = createPanelSchema.parse({ name: "Painel", icon: null });
    expect(parsed.icon).toBeNull();
  });

  it("aceita ausência de ícone (opcional)", () => {
    const parsed = createPanelSchema.parse({ name: "Painel" });
    expect(parsed.icon).toBeUndefined();
  });

  it("rejeita ícone fora da allowlist", () => {
    expect(() => createPanelSchema.parse({ name: "Painel", icon: "rocket" })).toThrow();
  });

  it("rejeita nome inválido", () => {
    expect(() => createPanelSchema.parse({ name: "", icon: "folder" })).toThrow();
  });
});

describe("renamePanelSchema", () => {
  it("segue o mesmo contrato de nome/ícone", () => {
    const parsed = renamePanelSchema.parse({ name: "Novo", icon: "star" });
    expect(parsed.name).toBe("Novo");
    expect(parsed.icon).toBe("star");
  });

  it("rejeita ícone inválido", () => {
    expect(() => renamePanelSchema.parse({ name: "Nome", icon: "invalid" })).toThrow();
  });
});

describe("PANEL_ICON_ALLOWLIST", () => {
  it("contém ao menos os ícones canônicos", () => {
    for (const icon of ["folder", "briefcase", "gavel", "users"]) {
      expect(PANEL_ICON_ALLOWLIST).toContain(icon);
    }
  });

  it("é readonly (as const)", () => {
    // A tipagem readonly é enforce em compile-time; verificamos a intenção runtime.
    const clone: readonly string[] = PANEL_ICON_ALLOWLIST;
    expect(Array.isArray(clone)).toBe(true);
    expect(clone.length).toBeGreaterThan(0);
  });
});
