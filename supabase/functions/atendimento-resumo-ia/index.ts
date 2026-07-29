// Edge Function: atendimento-resumo-ia
// Fase 3 — Atendimentos (execução): gera um resumo narrativo em terceira
// pessoa do singular a partir das respostas preenchidas em um Atendimento,
// para registro no sistema da DPE-RS e para facilitar a explicação ao
// Defensor. Usa o conector de IA embutido do Lovable (Lovable AI Gateway):
// a chave LOVABLE_API_KEY é provisionada automaticamente pelo Lovable como
// secret do projeto — não precisa ser configurada manualmente.
//
// IMPORTANTE (verificar ao publicar no Lovable): a URL do gateway e o
// identificador exato do modelo abaixo seguem a convenção documentada em
// https://docs.lovable.dev/integrations/ai (formato "provedor/modelo",
// endpoint compatível com a Chat Completions API da OpenAI). Esta função
// não pôde ser testada de ponta a ponta neste ambiente (sandbox sem acesso
// ao gateway/à chave) — ao rodar a primeira vez no Lovable, confira se a
// chamada retorna 200; se o endpoint ou o nome do modelo tiverem mudado,
// é só ajustar as constantes LOVABLE_AI_URL / MODEL abaixo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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

type Resposta = { label: string; valor: string };

type Payload = {
  titulo: string;
  descricao?: string | null;
  respostas: Resposta[];
};

const SYSTEM_PROMPT = `Você resume atendimentos da Defensoria Pública para registro institucional.

Regras:
- Escreva em português do Brasil, em terceira pessoa do singular (ex.: "A assistida declarou que...", "O requerente informou...").
- Compile as perguntas e respostas em um texto corrido (prosa), organizado e objetivo — não repita a pergunta literalmente, incorpore a informação na narrativa.
- Foque no que a pessoa assistida declarou. Não invente, não deduza além do que foi respondido, e não inclua nenhuma opinião ou recomendação jurídica.
- Se uma resposta estiver vazia ou não informada, simplesmente não a mencione (não diga "não foi informado").
- Não inclua saudação, introdução ("Segue o resumo:") ou qualquer comentário fora do resumo em si — apenas o texto corrido do resumo.
- Não use markdown, listas ou títulos — apenas parágrafos de texto simples.`;

function montarPromptUsuario(payload: Payload): string {
  const partes = [`Atendimento: ${payload.titulo}`];
  if (payload.descricao) partes.push(`Contexto: ${payload.descricao}`);
  partes.push("", "Respostas do atendimento:");
  for (const r of payload.respostas) {
    if (!r.valor.trim()) continue;
    partes.push(`- ${r.label}: ${r.valor}`);
  }
  return partes.join("\n");
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

  if (!payload.titulo || !Array.isArray(payload.respostas)) {
    return json({ error: "INVALID_PAYLOAD" }, 400);
  }

  const respostasComConteudo = payload.respostas.filter((r) => r.valor.trim().length > 0);
  if (respostasComConteudo.length === 0) {
    return json({ error: "NO_ANSWERS" }, 400);
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
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: montarPromptUsuario(payload) },
        ],
      }),
    });
  } catch (e) {
    return json({ error: "AI_GATEWAY_UNREACHABLE", message: String(e) }, 502);
  }

  if (aiRes.status === 429) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  if (aiRes.status === 402) {
    return json({ error: "AI_CREDITS_EXHAUSTED" }, 402);
  }
  if (!aiRes.ok) {
    const detail = await aiRes.text().catch(() => "");
    return json({ error: "AI_GATEWAY_ERROR", message: detail.slice(0, 500) }, 502);
  }

  const aiJson = await aiRes.json().catch(() => null);
  const resumo: string | undefined = aiJson?.choices?.[0]?.message?.content;
  if (!resumo || !resumo.trim()) {
    return json({ error: "EMPTY_AI_RESPONSE" }, 502);
  }

  return json({ ok: true, resumo: resumo.trim() });
});
