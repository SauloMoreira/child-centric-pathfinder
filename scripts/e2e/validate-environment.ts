#!/usr/bin/env bun
/**
 * Valida .env.e2e.local sem imprimir nenhum valor secreto.
 * Sub-gate 4.1.b · Turno 3.C.3.c.1.a
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

type Check = { name: string; ok: boolean; detail?: string };

const REQUIRED = [
  "E2E_BASE_URL",
  "E2E_DATABASE_URL",
  "E2E_OWNER_EMAIL",
  "E2E_OWNER_PASSWORD",
  "E2E_OWNER_TOTP_SECRET",
  "E2E_TEAM_EMAIL",
  "E2E_TEAM_PASSWORD",
  "E2E_TEAM_TOTP_SECRET",
  "E2E_TECH_EMAIL",
  "E2E_TECH_PASSWORD",
  "E2E_TECH_TOTP_SECRET",
] as const;

const PROD_DOMAINS = ["dpe-rs.def.br", "reintegra.dpe-rs.def.br"];

function loadEnvFile(): Record<string, string> {
  const path = resolve(process.cwd(), ".env.e2e.local");
  if (!existsSync(path)) return {};
  const raw = Bun.file(path).text();
  const out: Record<string, string> = {};
  for (const line of (Bun.file(path).existsSync ? [] : [])) void line;
  // Usa importação síncrona simples
  const text = require("node:fs").readFileSync(path, "utf8") as string;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[k] = v;
  }
  void raw;
  return out;
}

function looksLikeE2eEmail(email: string): boolean {
  return /(^|[.\-_])e2e([.\-_@]|$)/i.test(email) || /@teste\./i.test(email);
}

function looksLikeProdUrl(url: string): boolean {
  return PROD_DOMAINS.some((d) => url.includes(d));
}

function main(): void {
  const env = { ...loadEnvFile(), ...process.env };
  const checks: Check[] = [];

  for (const key of REQUIRED) {
    const has = typeof env[key] === "string" && env[key]!.length > 0;
    checks.push({ name: key, ok: has, detail: has ? "configurado" : "AUSENTE" });
  }

  const emails = [env.E2E_OWNER_EMAIL, env.E2E_TEAM_EMAIL, env.E2E_TECH_EMAIL]
    .filter(Boolean) as string[];

  const distinct = new Set(emails).size === emails.length && emails.length === 3;
  checks.push({
    name: "emails distintos",
    ok: distinct,
    detail: distinct ? "ok" : "e-mails duplicados ou ausentes",
  });

  const allE2e = emails.every(looksLikeE2eEmail);
  checks.push({
    name: "emails marcados como E2E",
    ok: allE2e,
    detail: allE2e ? "ok" : "e-mails sem marcador e2e claro",
  });

  const baseUrl = env.E2E_BASE_URL ?? "";
  const localOk =
    baseUrl.startsWith("http://localhost") ||
    baseUrl.startsWith("http://127.0.0.1") ||
    /^https:\/\/[^/]*e2e[^/]*\./i.test(baseUrl);
  checks.push({
    name: "E2E_BASE_URL local ou homologada",
    ok: localOk,
    detail: localOk ? "ok" : "URL não parece local nem homologada",
  });

  const dbUrl = env.E2E_DATABASE_URL ?? "";
  const dbProd = looksLikeProdUrl(dbUrl);
  checks.push({
    name: "banco não parece produção",
    ok: !dbProd,
    detail: dbProd ? "URL parece de produção — recusado" : "ok",
  });

  const hasServiceRole =
    !!env.SUPABASE_SERVICE_ROLE_KEY || !!env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  checks.push({
    name: "sem service role",
    ok: !hasServiceRole,
    detail: hasServiceRole ? "service role detectada — remova" : "ok",
  });

  const gitignoredPaths = [".env.e2e.local", ".playwright/.auth/"];
  const gitignore = existsSync(".gitignore")
    ? require("node:fs").readFileSync(".gitignore", "utf8")
    : "";
  const ignoredOk = gitignoredPaths.every((p) => gitignore.includes(p));
  checks.push({
    name: ".gitignore inclui .env.e2e.local e .playwright/.auth/",
    ok: ignoredOk,
  });

  const maxName = Math.max(...checks.map((c) => c.name.length));
  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    if (!c.ok) failed += 1;
    console.log(
      `${mark}  ${c.name.padEnd(maxName)}  ${c.detail ?? (c.ok ? "ok" : "FALHOU")}`,
    );
  }

  if (failed > 0) {
    console.error(`\n[validate-environment] ${failed} verificação(ões) falharam.`);
    process.exit(2);
  }
  console.log("\n[validate-environment] ambiente E2E ok.");
}

main();
