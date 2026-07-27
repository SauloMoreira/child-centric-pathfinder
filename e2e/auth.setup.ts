/**
 * Placeholder de setup autenticado.
 *
 * A geração real do storage state é feita fora do Playwright, por
 * `bun run e2e:mint-sessions`. Este arquivo existe para documentar o fluxo
 * e para permitir hooks futuros (ex.: refresh de token quando o storage
 * state estiver próximo do vencimento).
 *
 * NÃO reimplemente aqui um login mockado — o objetivo do c.1.a é que a
 * ausência de sessão real seja um erro visível, não uma falsa aprovação.
 */
import { test as setup } from "@playwright/test";
import { requireOwnerSession } from "./helpers/environment";

setup("verifica storage state do owner", () => {
  requireOwnerSession();
});
