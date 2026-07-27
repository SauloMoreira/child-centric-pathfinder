import type { Page } from "@playwright/test";
import { routes } from "./selectors";

/**
 * Navega para a Área de Trabalho e aguarda a shell autenticada.
 * Assume storageState já carregado pelo projeto Playwright.
 */
export async function gotoWorkArea(page: Page): Promise<void> {
  await page.goto(routes.workArea, { waitUntil: "domcontentloaded" });
  // Se a sessão expirou, seremos redirecionados para /auth — falha explícita.
  if (page.url().includes("/auth")) {
    throw new Error(
      "E2E_AUTH_BOOTSTRAP_REQUIRED: sessão inválida ou expirada. Regenere storage state.",
    );
  }
}
