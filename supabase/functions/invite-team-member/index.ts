// Edge Function: invite-team-member
// Fase 2 — Reintegra Infância
// Valida o JWT do solicitante, cria o convite via RPC segura, envia e-mail
// pelo Supabase Auth Admin API (inviteUserByEmail) e registra o resultado.
// Nunca expõe service_role no frontend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Payload = {
  nomeCompleto: string;
  email: string;
  matricula?: string | null;
  funcaoInterna:
    | "assessor"
    | "servidor"
    | "estagiario"
    | "residente"
    | "colaborador"
    | "outro";
  outraFuncao?: string | null;
  telefone?: string | null;
  orgaoId?: string | null; // só usado por admin_tecnico
  justificativa?: string | null; // idem
  idempotencyKey: string;
  redirectTo?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "UNAUTHENTICATED" }, 401);
  }

  const jwt = authHeader.slice(7);

  // Cliente autenticado como o usuário (para chamar as RPCs SECURITY DEFINER
  // com auth.uid() correto)
  const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  // Cliente admin somente para inviteUserByEmail — service role nunca sai daqui
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  // Verifica identidade
  const { data: userData, error: userErr } =
    await userClient.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return json({ error: "UNAUTHENTICATED" }, 401);
  }

  // 1. Cria convite via RPC (valida papéis, duplicidade, órgão)
  const { data: created, error: rpcErr } = await userClient.rpc(
    "criar_convite_equipe",
    {
      p_nome_completo: payload.nomeCompleto,
      p_email: payload.email,
      p_matricula: payload.matricula ?? null,
      p_funcao_interna: payload.funcaoInterna,
      p_outra_funcao: payload.outraFuncao ?? null,
      p_telefone: payload.telefone ?? null,
      p_orgao_id: payload.orgaoId ?? null,
      p_justificativa: payload.justificativa ?? null,
      p_idempotency_key: payload.idempotencyKey,
    },
  );

  if (rpcErr) {
    const msg = rpcErr.message ?? "INTERNAL_ERROR";
    // Mapear códigos de domínio conhecidos
    const code = msg.match(
      /(UNAUTHENTICATED|USER_NOT_ACTIVE|FORBIDDEN|NO_ACTIVE_ORGANIZATION|TEAM_INVITATION_ALREADY_PENDING|USER_ALREADY_MEMBER_OF_ORGANIZATION|USER_ALREADY_LINKED_TO_ANOTHER_ORGANIZATION|USER_HAS_INCOMPATIBLE_ROLE|ORGANIZATION_NOT_FOUND)/,
    )?.[0];
    return json(
      { error: code ?? "RPC_ERROR", message: msg },
      code === "UNAUTHENTICATED" || code === "FORBIDDEN" || code === "USER_NOT_ACTIVE"
        ? 403
        : 400,
    );
  }

  const invitation = created as {
    invitation_id: string;
    email: string;
    orgao_id: string;
    idempotent?: boolean;
  };

  // Se foi idempotente e o convite já foi enviado antes, apenas devolve
  if (invitation.idempotent) {
    return json({ ok: true, invitation_id: invitation.invitation_id, idempotent: true });
  }

  // 2. Enviar convite pelo Supabase Auth
  const redirectTo =
    payload.redirectTo ??
    `${new URL(req.url).origin.replace(/\/functions\/v1.*$/, "")}/ativar-convite`;

  const { data: invited, error: inviteErr } =
    await adminClient.auth.admin.inviteUserByEmail(invitation.email, {
      redirectTo,
      data: {
        invitation_id: invitation.invitation_id,
        orgao_id: invitation.orgao_id,
        nome_completo: payload.nomeCompleto,
      },
    });

  if (inviteErr) {
    // Registrar falha
    await userClient.rpc("registrar_envio_convite", {
      p_invitation_id: invitation.invitation_id,
      p_auth_user_id: null,
      p_status: "falhou",
      p_failure_code: inviteErr.message?.slice(0, 200) ?? "auth_admin_error",
    });
    return json(
      { error: "INVITATION_SEND_FAILED", message: inviteErr.message },
      502,
    );
  }

  await userClient.rpc("registrar_envio_convite", {
    p_invitation_id: invitation.invitation_id,
    p_auth_user_id: invited.user?.id ?? null,
    p_status: "enviado",
    p_failure_code: null,
  });

  return json({
    ok: true,
    invitation_id: invitation.invitation_id,
    auth_user_id: invited.user?.id ?? null,
  });
});
