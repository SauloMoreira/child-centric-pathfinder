import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Cleanup DOM entre testes (Testing Library não faz isso automaticamente com globals:false).
afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* ambientes sem storage */
  }
});
