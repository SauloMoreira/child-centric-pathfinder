#!/usr/bin/env bun
/**
 * Prepara o ambiente E2E: valida variáveis, verifica storage states,
 * aplica cleanup + seed via psql (com GUCs externas), sem jamais
 * definir app.environment dentro do seed.
 *
 * Sub-gate 4.1.b · Turno 3.C.3.c.1.a
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function loadEnv(): Record<string, string> {
  const path = resolve(process.cwd(), ".env.e2e.local");
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (!existsSync(path)) return out;
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in out)) out[k] = v;
  }
  return out;
}

const env = loadEnv();

function abort(code: string, msg: string): never {
  console.error(`[prepare-environment] ${code}: ${msg}`);
  process.exit(1);
}

// 1. validação básica
const validate = spawnSync(
  process.execPath,
  ["scripts/e2e/validate-environment.ts"],
  { stdio: "inherit", env: { ...process.env, ...env } },
);
if (validate.status !== 0) {
  abort("E2E_ENV_INVALID", "validate-environment falhou.");
}

// 2. storage state do owner é obrigatório
const OWNER_STATE = ".playwright/.auth/owner.json";
if (!existsSync(OWNER_STATE)) {
  abort(
    "E2E_AUTH_BOOTSTRAP_REQUIRED",
    `storage state ausente: ${OWNER_STATE}. Rode "bun run e2e:mint-sessions" ` +
      `após concluir o bootstrap manual (docs/testing/work-area-e2e-bootstrap.md).`,
  );
}
for (const p of [
  ".playwright/.auth/team-readonly.json",
  ".playwright/.auth/technical-readonly.json",
]) {
  if (!existsSync(p)) {
    console.warn(
      `[prepare-environment] aviso: ${p} ausente. Testes readonly ficarão indisponíveis.`,
    );
  }
}

// 3. checagem de banco não-produtivo
const dbUrl = env.E2E_DATABASE_URL ?? "";
if (!dbUrl) abort("E2E_ENV_INVALID", "E2E_DATABASE_URL ausente.");
if (/dpe-rs\.def\.br/.test(dbUrl)) {
  abort("E2E_PROD_REFUSED", "E2E_DATABASE_URL parece produção.");
}

// 4. GUCs externas — o seed jamais define app.environment por si.
const pgOptions = [
  "-c app.environment=e2e",
  `-c app.e2e_owner_email=${env.E2E_OWNER_EMAIL}`,
  `-c app.e2e_team_email=${env.E2E_TEAM_EMAIL}`,
  `-c app.e2e_tech_email=${env.E2E_TECH_EMAIL}`,
].join(" ");

function runPsql(file: string, label: string): void {
  console.log(`[prepare-environment] aplicando ${label}…`);
  const result = spawnSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-f", file, dbUrl],
    {
      stdio: "inherit",
      env: { ...process.env, PGOPTIONS: pgOptions },
    },
  );
  if (result.status !== 0) abort(`E2E_${label.toUpperCase()}_FAILED`, `${label} retornou ${result.status}`);
}

runPsql("scripts/e2e/cleanup-work-area.sql", "cleanup");
runPsql("scripts/e2e/seed-work-area.sql", "seed");

console.log("[prepare-environment] ambiente E2E pronto.");
