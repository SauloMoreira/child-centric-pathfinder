import { test as base, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { requireOwnerSession } from "./helpers/environment";

type Fixtures = {
  axe: (selector?: string) => Promise<{ violations: unknown[] }>;
};

/**
 * Base test com validação de bootstrap. Nenhum teste é marcado como skip:
 * quando o storage state está ausente, o setup lança erro para deixar o
 * relatório do Playwright explícito.
 */
export const test = base.extend<Fixtures>({
  axe: async ({ page }, use) => {
    await use(async (selector) => {
      const builder = new AxeBuilder({ page });
      if (selector) builder.include(selector);
      return builder.analyze();
    });
  },
});

test.beforeAll(() => {
  requireOwnerSession();
});

export { expect };
