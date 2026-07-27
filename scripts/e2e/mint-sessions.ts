#!/usr/bin/env bun
/**
 * Gera storage states autenticados para cada perfil E2E.
 * Sub-gate 4.1.b · Turno 3.C.3.c.1.a
 *
 * IMPORTANTE
 *   - Nunca imprime tokens, cookies, senhas ou segredos TOTP.
 *   - Nunca cria usuários, jamais toca auth.users diretamente.
 *   - Se o usuário não existe ou não tem MFA matriculado, aborta com
 *     código de erro E2E_AUTH_BOOTSTRAP_REQUIRED e instruções.
 *
 * Requer que .env.e2e.local esteja preenchido e validado.
 */
import { chromium, type BrowserContext } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Profile = "owner" | "team-readonly" | "technical-readonly";

const AUTH_DIR = ".playwright/.auth";

function loadEnv(): Record<string, string> {
  const path = resolve(process.cwd(), ".env.e2e.local");
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (!existsSync(path)) return out;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(k in out)) out[k] = v;
  }
  return out;
}

const env = loadEnv();

function required(name: string): string {
  const v = env[name];
  if (!v) {
    console.error(
      `[mint-sessions] variável ausente: ${name}\n` +
        `E2E_AUTH_BOOTSTRAP_REQUIRED — ver docs/testing/work-area-e2e-bootstrap.md`,
    );
    process.exit(3);
  }
  return v;
}

const BASE_URL = required("E2E_BASE_URL");

const PROFILES: Record<
  Profile,
  { email: string; password: string; totpSecret: string; storagePath: string }
> = {
  owner: {
    email: required("E2E_OWNER_EMAIL"),
    password: required("E2E_OWNER_PASSWORD"),
    totpSecret: required("E2E_OWNER_TOTP_SECRET"),
    storagePath: `${AUTH_DIR}/owner.json`,
  },
  "team-readonly": {
    email: required("E2E_TEAM_EMAIL"),
    password: required("E2E_TEAM_PASSWORD"),
    totpSecret: required("E2E_TEAM_TOTP_SECRET"),
    storagePath: `${AUTH_DIR}/team-readonly.json`,
  },
  "technical-readonly": {
    email: required("E2E_TECH_EMAIL"),
    password: required("E2E_TECH_PASSWORD"),
    totpSecret: required("E2E_TECH_TOTP_SECRET"),
    storagePath: `${AUTH_DIR}/technical-readonly.json`,
  },
};

// -------- TOTP RFC 6238 (SHA-1, 6 dígitos, janela de 30s) ---------------
function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error("segredo TOTP inválido");
    buffer = (buffer << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

async function totp(secret: string): Promise<string> {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(4, counter);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

async function mint(profile: Profile): Promise<void> {
  const cfg = PROFILES[profile];
  mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });

    // Login e-mail/senha — usa labels reais da tela /auth.
    await page.getByLabel(/e-?mail/i).fill(cfg.email);
    await page.getByLabel(/senha/i).fill(cfg.password);
    await page.getByRole("button", { name: /entrar|login/i }).click();

    // Desafio MFA — insere código TOTP.
    const otpLocator = page.getByLabel(/código|otp|verificação/i).first();
    await otpLocator.waitFor({ timeout: 10_000 }).catch(() => {
      throw new Error(
        `E2E_AUTH_BOOTSTRAP_REQUIRED: MFA não solicitado para ${profile}. ` +
          `Confirme que o usuário existe e está matriculado.`,
      );
    });
    await otpLocator.fill(await totp(cfg.totpSecret));
    await page.getByRole("button", { name: /verificar|confirmar|entrar/i }).click();

    // Aguarda transição para rota autenticada.
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
      timeout: 15_000,
    });

    await context.storageState({ path: cfg.storagePath });
    console.log(`[mint-sessions] ${profile}: storage state salvo.`);
  } catch (err) {
    // Sanitiza — nunca imprime segredo.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mint-sessions] ${profile}: ${msg}`);
    process.exitCode = 4;
  } finally {
    await context?.close();
    await browser.close();
  }
}

async function main(): Promise<void> {
  const only = process.argv.slice(2)[0] as Profile | undefined;
  const targets = only ? [only] : (Object.keys(PROFILES) as Profile[]);
  for (const p of targets) await mint(p);
  if (process.exitCode && process.exitCode !== 0) {
    console.error(
      "\n[mint-sessions] pelo menos um perfil falhou. Bootstrap manual pode ser necessário.",
    );
  }
}

main();
