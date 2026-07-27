import { existsSync } from "node:fs";

/**
 * Falha de forma explícita quando o bootstrap E2E não foi executado.
 * Nunca marcar specs como skip — o objetivo é que uma execução
 * sem bootstrap seja imediatamente visível no relatório.
 */
export function requireOwnerSession(): string {
  const path = ".playwright/.auth/owner.json";
  if (!existsSync(path)) {
    throw new Error(
      "E2E_AUTH_BOOTSTRAP_REQUIRED: storage state ausente (.playwright/.auth/owner.json). " +
        "Rode `bun run e2e:mint-sessions` após o bootstrap manual.",
    );
  }
  return path;
}
