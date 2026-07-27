import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — Sub-gate 4.1.b · Turno 3.C.3.c.1.a
 *
 * Autenticação real: cada projeto de testes usa um storageState gerado
 * por scripts/e2e/mint-sessions.ts a partir de credenciais e segredos TOTP
 * mantidos em .env.e2e.local ou no cofre do CI. Nenhum valor secreto
 * é resolvido em tempo de config: se o arquivo não existe, o teste falha
 * de forma explícita no setup.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const IS_CI = !!process.env.CI;

const AUTH_DIR = ".playwright/.auth";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // seed compartilhado — evita corridas entre workers
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  workers: 1,
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  webServer: process.env.E2E_SKIP_WEB_SERVER
    ? undefined
    : {
        command: "bun run dev",
        url: BASE_URL,
        reuseExistingServer: !IS_CI,
        timeout: 60_000,
        stdout: "ignore",
        stderr: "pipe",
      },
  projects: [
    {
      name: "chromium-desktop-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: `${AUTH_DIR}/owner.json`,
      },
    },
    {
      name: "chromium-mobile-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        storageState: `${AUTH_DIR}/owner.json`,
      },
    },
    {
      name: "chromium-reduced-motion",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
        storageState: `${AUTH_DIR}/owner.json`,
      },
    },
  ],
});
