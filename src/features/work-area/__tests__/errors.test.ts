import { describe, it, expect } from "vitest";
import {
  isConcurrentChangeError,
  panelErrorFromUnknown,
  panelErrorMessage,
  parsePanelErrorCode,
} from "../errors";
import { PANEL_ERROR_CODES } from "../types";

const CODES_ESPERADOS = [
  "PANEL_LIMIT_REACHED",
  "PANEL_NAME_ALREADY_EXISTS",
  "PANEL_NOT_EMPTY",
  "LAST_PANEL_CANNOT_BE_DELETED",
  "PANEL_ORDER_INVALID",
  "CONCURRENT_CHANGE",
  "FORBIDDEN",
  "PROFILE_INACTIVE",
  "PANEL_NOT_FOUND",
  "DUPLICATE_PANEL_ITEM",
  "WORK_AREA_NOT_INITIALIZED",
] as const;

describe("parsePanelErrorCode", () => {
  for (const code of CODES_ESPERADOS) {
    it(`reconhece ${code} em Error.message`, () => {
      expect(parsePanelErrorCode(new Error(code))).toBe(code);
    });
  }

  it("reconhece PostgREST 42501 como FORBIDDEN", () => {
    expect(parsePanelErrorCode(new Error("42501: permission denied"))).toBe(
      "FORBIDDEN",
    );
  });

  it("reconhece ITEM_ALREADY_IN_WORKSPACE como DUPLICATE_PANEL_ITEM", () => {
    expect(
      parsePanelErrorCode(new Error("ITEM_ALREADY_IN_WORKSPACE")),
    ).toBe("DUPLICATE_PANEL_ITEM");
  });

  it("retorna UNKNOWN para código não mapeado", () => {
    expect(parsePanelErrorCode(new Error("XYZ_UNRELATED"))).toBe("UNKNOWN");
  });

  it("aceita valores não-Error convertendo para string", () => {
    expect(parsePanelErrorCode("PANEL_LIMIT_REACHED")).toBe(
      "PANEL_LIMIT_REACHED",
    );
    expect(parsePanelErrorCode(null)).toBe("UNKNOWN");
    expect(parsePanelErrorCode(undefined)).toBe("UNKNOWN");
  });
});

describe("panelErrorMessage", () => {
  it("cobre todos os códigos declarados no tipo", () => {
    for (const code of PANEL_ERROR_CODES) {
      const msg = panelErrorMessage(code);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("mensagens em português (sem vazar código bruto)", () => {
    const msg = panelErrorMessage("PANEL_LIMIT_REACHED");
    expect(msg).toMatch(/Painéis|Painel/);
    expect(msg).not.toMatch(/PANEL_LIMIT_REACHED/);
  });

  it("mensagens não expõem SQLSTATE nem nome de índice", () => {
    for (const code of PANEL_ERROR_CODES) {
      const msg = panelErrorMessage(code);
      expect(msg).not.toMatch(/\b\d{5}\b/); // SQLSTATE (5 dígitos)
      expect(msg).not.toMatch(/uq_|idx_|pkey/i);
      expect(msg).not.toMatch(/duplicate key value|violates/i);
    }
  });
});

describe("panelErrorFromUnknown", () => {
  it("retorna {code, message} coerentes", () => {
    const { code, message } = panelErrorFromUnknown(
      new Error("CONCURRENT_CHANGE"),
    );
    expect(code).toBe("CONCURRENT_CHANGE");
    expect(message).toBe(panelErrorMessage("CONCURRENT_CHANGE"));
  });

  it("fallback seguro para desconhecido", () => {
    const { code, message } = panelErrorFromUnknown("wtf");
    expect(code).toBe("UNKNOWN");
    expect(message).toBe(panelErrorMessage("UNKNOWN"));
  });
});

describe("isConcurrentChangeError", () => {
  it("true para CONCURRENT_CHANGE", () => {
    expect(isConcurrentChangeError(new Error("CONCURRENT_CHANGE"))).toBe(true);
  });

  it("false para outros códigos", () => {
    expect(isConcurrentChangeError(new Error("FORBIDDEN"))).toBe(false);
    expect(isConcurrentChangeError(new Error("PANEL_LIMIT_REACHED"))).toBe(
      false,
    );
  });
});
