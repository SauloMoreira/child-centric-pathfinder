import { test, expect } from "./fixtures";
import { gotoWorkArea } from "./helpers/auth";
import { PANEL_NAMES } from "./helpers/seed";
import {
  newPanelButton,
  panelActionsButton,
  panelNameInput,
  submitCreatePanel,
  submitRenamePanel,
} from "./helpers/selectors";

test.describe("Owner · Painéis", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkArea(page);
  });

  test("carrega Área de Trabalho e o Painel Principal seedado", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: PANEL_NAMES.principal }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: PANEL_NAMES.urgencias }),
    ).toBeVisible();

    // Indicação acessível de aba selecionada
    const selected = page.locator('[aria-current="page"]').first();
    await expect(selected).toBeVisible();

    // Colunas seedadas do painel principal
    await expect(page.getByText("[E2E] Entrada")).toBeVisible();
    await expect(page.getByText("[E2E] Análise")).toBeVisible();
    await expect(page.getByText("[E2E] Finalizados")).toBeVisible();

    // Cards seedados
    await expect(page.getByText("[E2E] Atendimento Sintético A")).toBeVisible();
    await expect(page.getByText("[E2E] Cota Sintética B")).toBeVisible();

    // Owner enxerga controles de gestão
    await expect(newPanelButton(page)).toBeEnabled();
  });

  test("valida nome vazio ao criar Painel", async ({ page }) => {
    await newPanelButton(page).click();
    await submitCreatePanel(page).click();
    await expect(page.getByText(/informe o nome do painel/i)).toBeVisible();
  });

  test("cria Painel com nome válido e persiste após reload", async ({ page }) => {
    const nome = `[E2E] Painel Efêmero ${Date.now()}`;
    await newPanelButton(page).click();
    await panelNameInput(page).fill(nome);
    await submitCreatePanel(page).click();

    await expect(page.getByRole("button", { name: nome })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: nome })).toBeVisible();

    // limpeza — arquiva para não vazar entre execuções
    await panelActionsButton(page, nome).click();
    await page.getByRole("menuitem", { name: /arquivar/i }).click();
    await page.getByRole("button", { name: /arquivar$/i }).click();
  });

  test("rejeita nome duplicado", async ({ page }) => {
    await newPanelButton(page).click();
    await panelNameInput(page).fill(PANEL_NAMES.principal);
    await submitCreatePanel(page).click();
    await expect(
      page.getByText(/já existe|nome.*existe/i),
    ).toBeVisible();
  });

  test("renomeia Painel e persiste", async ({ page }) => {
    const original = `[E2E] Painel Rename ${Date.now()}`;
    const renomeado = `${original} · v2`;

    await newPanelButton(page).click();
    await panelNameInput(page).fill(original);
    await submitCreatePanel(page).click();
    await expect(page.getByRole("button", { name: original })).toBeVisible();

    await panelActionsButton(page, original).click();
    await page.getByRole("menuitem", { name: /renomear/i }).click();
    await panelNameInput(page).fill(renomeado);
    await submitRenamePanel(page).click();

    await expect(page.getByRole("button", { name: renomeado })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: renomeado })).toBeVisible();

    // limpeza
    await panelActionsButton(page, renomeado).click();
    await page.getByRole("menuitem", { name: /arquivar/i }).click();
    await page.getByRole("button", { name: /arquivar$/i }).click();
  });

  test("bloqueia arquivamento de Painel com cards", async ({ page }) => {
    await panelActionsButton(page, PANEL_NAMES.principal).click();
    await page.getByRole("menuitem", { name: /arquivar/i }).click();
    await page.getByRole("button", { name: /arquivar$/i }).click();
    await expect(
      page.getByText(/colunas ou cards|não pode ser arquivado/i),
    ).toBeVisible();
  });
});
