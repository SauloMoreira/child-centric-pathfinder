import type { PanelErrorCode } from "./types";

const CODE_PATTERNS: Array<[PanelErrorCode, RegExp]> = [
  ["PANEL_LIMIT_REACHED", /PANEL_LIMIT_REACHED/i],
  ["PANEL_NAME_ALREADY_EXISTS", /PANEL_NAME_ALREADY_EXISTS/i],
  ["PANEL_NOT_EMPTY", /PANEL_NOT_EMPTY/i],
  ["LAST_PANEL_CANNOT_BE_DELETED", /LAST_PANEL_CANNOT_BE_DELETED/i],
  ["PANEL_ORDER_INVALID", /PANEL_ORDER_INVALID/i],
  ["CONCURRENT_CHANGE", /CONCURRENT_CHANGE/i],
  ["PROFILE_INACTIVE", /PROFILE_INACTIVE/i],
  ["FORBIDDEN", /FORBIDDEN|permission|denied|not allowed|42501/i],
  ["PANEL_NOT_FOUND", /PANEL_NOT_FOUND/i],
  ["DUPLICATE_PANEL_ITEM", /DUPLICATE_PANEL_ITEM|ITEM_ALREADY_IN_WORKSPACE/i],
  ["WORK_AREA_NOT_INITIALIZED", /WORK_AREA_NOT_INITIALIZED/i],
];

export function parsePanelErrorCode(err: unknown): PanelErrorCode {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message ?? "")
      : String(err ?? "");
  for (const [code, re] of CODE_PATTERNS) if (re.test(msg)) return code;
  return "UNKNOWN";
}

const PT_MESSAGES: Record<PanelErrorCode, string> = {
  PANEL_LIMIT_REACHED: "O limite máximo de 8 Painéis foi atingido.",
  PANEL_NAME_ALREADY_EXISTS: "Já existe um Painel com esse nome.",
  PANEL_NOT_EMPTY: "Este Painel possui Atendimentos ou Cotas. Remova os cards antes de excluí-lo.",
  LAST_PANEL_CANNOT_BE_DELETED: "A Área de Trabalho precisa possuir ao menos um Painel.",
  PANEL_ORDER_INVALID:
    "Não foi possível atualizar a ordem dos Painéis. Atualize a página e tente novamente.",
  CONCURRENT_CHANGE: "A Área de Trabalho foi alterada em outra sessão.",
  FORBIDDEN: "Você não possui permissão para realizar esta ação.",
  PROFILE_INACTIVE: "Seu acesso está inativo. Entre em contato com a administração.",
  PANEL_NOT_FOUND: "O Painel solicitado não foi encontrado.",
  DUPLICATE_PANEL_ITEM: "Este conteúdo já está no Painel selecionado.",
  WORK_AREA_NOT_INITIALIZED: "A Área de Trabalho ainda não foi inicializada pelo Defensor.",
  UNKNOWN: "Não foi possível concluir a operação. Tente novamente.",
};

export function panelErrorMessage(code: PanelErrorCode): string {
  return PT_MESSAGES[code];
}

export function panelErrorFromUnknown(err: unknown): {
  code: PanelErrorCode;
  message: string;
} {
  const code = parsePanelErrorCode(err);
  return { code, message: panelErrorMessage(code) };
}

/** Mantido para compat com hooks legados. */
export function isConcurrentChangeError(err: unknown): boolean {
  return parsePanelErrorCode(err) === "CONCURRENT_CHANGE";
}
