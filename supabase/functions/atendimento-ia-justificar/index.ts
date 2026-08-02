// Edge Function: atendimento-ia-justificar
// Ajuste doc (AJUSTE 14 — "Justificativa de perguntas no Atendimento
// IA") — a pedido do usuário (botão ao lado do "+" de inserir campo,
// entre uma pergunta e outra), gera uma explicação da IA sobre POR QUE
// aquela pergunta específica foi formulada: fundamento (referenciando o
// documento quando possível), relevância/pertinência (grau de
// importância considerando o contexto) e propósito (o que se busca
// descobrir com a resposta). Mesmo padrão de infraestrutura da
// atendimento-ia-gerar (mesmo conector de IA embutido do Lovable).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const MAX_FILE_BYTES = 60 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Payload = {
  personName: string;
  context: string;
  files?: { base64: string; mimeType: string }[];
  fileBase64?: string;
  fileMimeType?: string;
  /** Rótulo da pergunta a justificar. */
  pergunta: string;
};

const SYSTEM_PROMPT = `Você ajuda Defensores Públicos e suas equipes a entender formulários de atendimento elaborados por você mesma (uma IA) na Defensoria Pública do Estado do Rio Grande do Sul.

Você já formulou perguntas para um formulário de atendimento a partir de um ou mais documentos de referência (pode não haver nenhum) e de um contexto informado pelo usuário. Agora, o usuário quer entender por que UMA pergunta específica foi feita.

Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem markdown, sem crases, no formato exato: {"justificativa": "..."}.

O texto de "justificativa" deve ser curto e direto (no máximo 4-5 frases), reunindo em prosa corrida:
- o fundamento da pergunta, mencionando trechos ou referências do(s) documento(s) de referência sempre que possível, quando houver algum;
- a relevância/pertinência da pergunta, indicando o grau de importância dela considerando o contexto informado pelo usuário;
- o propósito da pergunta — para que ela serve, o que se busca descobrir com a resposta.

Escreva em português do Brasil, em tom técnico mas acessível, dirigido ao próprio Defensor Público ou à sua equipe (não à pessoa atendida).`;

function montarPromptUsuario(personName: string, context: string, pergunta: string): string {
  return [
    `Pessoa a ser atendida: ${personName}`,
    `Contexto informado pelo usuário: ${context}`,
    `Pergunta a justificar: "${pergunta}"`,
    "",
    "Analise o(s) documento(s) de referência, se houver, e explique por que essa pergunta específica foi formulada.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "UNAUTHENTICATED" }, 401);
  }
  const jwt = authHeader.slice(7);

  const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return json({ error: "UNAUTHENTICATED" }, 401);
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const personName = (payload.personName ?? "").trim();
  const context = (payload.context ?? "").trim();
  const pergunta = (payload.pergunta ?? "").trim();
  const files: { base64: string; mimeType: string }[] = Array.isArray(payload.files)
    ? payload.files.filter(
        (f): f is { base64: string; mimeType: string } =>
          !!f && typeof f.base64 === "string" && f.base64.length > 0,
      )
    : payload.fileBase64
      ? [{ base64: payload.fileBase64, mimeType: payload.fileMimeType || "application/pdf" }]
      : [];

  if (!personName || !context || !pergunta) {
    return json({ error: "INVALID_PAYLOAD" }, 400);
  }
  if (files.some((f) => f.mimeType !== "application/pdf")) {
    return json({ error: "INVALID_FILE_TYPE" }, 400);
  }
  const approxBytesTotal = files.reduce((acc, f) => acc + Math.floor((f.base64.length * 3) / 4), 0);
  if (approxBytesTotal > MAX_FILE_BYTES) {
    return json({ error: "FILE_TOO_LARGE" }, 400);
  }

  let aiRes: Response;
  try {
    aiRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: montarPromptUsuario(personName, context, pergunta) },
              ...files.map((f) => ({
                type: "image_url" as const,
                image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
              })),
            ],
          },
        ],
      }),
    });
  } catch (e) {
    return json({ error: "AI_GATEWAY_UNREACHABLE", message: String(e) }, 502);
  }

  if (aiRes.status === 429) return json({ error: "RATE_LIMITED" }, 429);
  if (aiRes.status === 402) return json({ error: "AI_CREDITS_EXHAUSTED" }, 402);
  if (!aiRes.ok) {
    const detail = await aiRes.text().catch(() => "");
    return json({ error: "AI_GATEWAY_ERROR", message: detail.slice(0, 500) }, 502);
  }

  const aiJson = await aiRes.json().catch(() => null);
  const conteudo: string | undefined = aiJson?.choices?.[0]?.message?.content;
  if (!conteudo || !conteudo.trim()) {
    return json({ error: "EMPTY_AI_RESPONSE" }, 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(conteudo);
  } catch {
    const inicio = conteudo.indexOf("{");
    const fim = conteudo.lastIndexOf("}");
    if (inicio === -1 || fim === -1 || fim <= inicio) {
      return json({ error: "INVALID_AI_JSON" }, 502);
    }
    try {
      parsed = JSON.parse(conteudo.slice(inicio, fim + 1));
    } catch {
      return json({ error: "INVALID_AI_JSON" }, 502);
    }
  }

  const justificativa = (parsed as Record<string, unknown>)?.justificativa;
  if (typeof justificativa !== "string" || !justificativa.trim()) {
    return json({ error: "EMPTY_AI_RESPONSE" }, 502);
  }

  return json({ ok: true, justificativa: justificativa.trim().slice(0, 800) });
});
