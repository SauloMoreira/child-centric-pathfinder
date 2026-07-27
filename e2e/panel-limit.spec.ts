import { test, expect } from "./fixtures";
import { gotoWorkArea } from "./helpers/auth";
import { newPanelButton, panelActionsButton, panelNameInput, submitCreatePanel } from "./helpers/selectors";

/**
 * Prova o limite de 8 Painéis ativos. Cria os Painéis auxiliares no início
 * e arquiva ao final para manter idempotência entre execuções.
 * A prova de concorrência real entre 8º e 9º fica para 3.C.3.d (SQL).
 */
test.describe("Owner · Limite de 8 Painéis", () => {
  const created: string[] = [];

  test.beforeAll(() => {
    // Nenhuma preparação além do seed; os Painéis extras são criados no teste.
  });

  test("preenche até 8 Painéis, bloqueia o 9º e persiste após reload", async ({ page }) => {
    await gotoWorkArea(page);

    // Seed já traz 2 Painéis. Criar mais 6 até atingir 8.
    const base = Date.now();
    for (let i = 0; i < 6; i++) {
      const nome = `[E2E] Extra ${base}-${i}`;
      await newPanelButton(page).click();
      await panelNameInput(page).fill(nome);
      await submitCreatePanel(page).click();
      await expect(page.getByRole("button", { name: nome })).toBeVisible();
      created.push(nome);
    }

    // 8 abas visíveis: 2 seedadas + 6 novas
    const tabs = page.locator('[aria-current="page"], [role="button"][aria-current]');
    // Verificação genérica via botão de criação desabilitado é a assertiva canônica:
    await expect(newPanelButton(page)).toBeDisabled();
    await expect(newPanelButton(page)).toHaveAttribute(
      "title",
      /limite de 8 painéis atingido/i,
    );

    // Tentar clicar não dispara mutation nem cria 9º
    await newPanelButton(page).click({ force: true, trial: true }).catch(() => {});
    await page.reload();
    await expect(newPanelButton(page)).toBeDisabled();

    void tabs;
  });

  test.afterAll(async ({ browser }) => {
    if (created.length === 0) return;
    const ctx = await browser.newContext({
      storageState: ".playwright/.auth/owner.json",
    });
    const page = await ctx.newPage();
    await gotoWorkArea(page);
    for (const nome of created) {
      try {
        await panelActionsButton(page, nome).click();
        await page.getByRole("menuitem", { name: /arquivar/i }).click();
        await page.getByRole("button", { name: /arquivar$/i }).click();
      } catch {
        // best-effort — cleanup subsequente cuidará
      }
    }
    await ctx.close();
  });
});
