import type { Page } from "@playwright/test";

/**
 * Seletores compartilhados — sempre priorizam papéis e rótulos.
 * Nenhum seletor depende de classes Tailwind, ordem no DOM ou detalhes
 * internos do DnD Kit.
 */
export const routes = {
  workArea: "/area-de-trabalho",
  auth: "/auth",
} as const;

export function panelTab(page: Page, name: string) {
  return page.getByRole("button", { name, exact: false });
}

export function newPanelButton(page: Page) {
  return page.getByRole("button", { name: /novo painel/i });
}

export function panelNameInput(page: Page) {
  return page.getByLabel(/nome/i).first();
}

export function submitCreatePanel(page: Page) {
  return page.getByRole("button", { name: /criar painel/i });
}

export function submitRenamePanel(page: Page) {
  return page.getByRole("button", { name: /salvar|renomear/i });
}

export function panelActionsButton(page: Page, panelName: string) {
  return page.getByRole("button", { name: new RegExp(`ações do painel ${panelName}`, "i") });
}

export function confirmArchive(page: Page) {
  return page.getByRole("button", { name: /arquivar$/i });
}
