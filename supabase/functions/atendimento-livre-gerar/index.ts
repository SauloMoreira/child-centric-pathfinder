// Edge Function: atendimento-livre-gerar
// Reformulação das modalidades de atendimento — "Atendimento livre": o
// usuário narra livremente o atendimento (sem se preocupar com
// organização, grafia ou gramática, informações fora de ordem etc.) e a
// IA organiza um relato limpo, claro e coeso, sem prejudicar a
// completude das informações. Quando há incongruências, inconsistências
// ou lacunas/omissões que poderiam ser sanadas com novas perguntas à
// pessoa atendida, a IA também gera uma Orientação (a ser exibida ACIMA
// do relato) explicando o que pode ser esclarecido/complementado, com
// sugestões de perguntas. Mesmo conector de IA embutido do Lovable
// (Lovable AI Gateway) já usado nas demais funções do Atendimento IA.
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

type Payload = {
  personName?: string;
  narrativa: string;
};

const SYSTEM_PROMPT = `Você organiza relatos de atendimentos da Defensoria Pública para registro institucional, a partir de uma narrativa livre escrita apressadamente pela equipe durante o atendimento.

A narrativa pode ter erros de grafia/gramática, informações fora de ordem, repetições ou trechos truncados — isso é normal e esperado, já que foi escrita durante o atendimento em tempo real.

Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem markdown, sem crases, no formato exato: {"relato": "...", "orientacao": "..." | null}.

Regras para "relato":
- Escreva em português do Brasil, em terceira pessoa do singular (ex.: "A assistida declarou que...", "O requerente informou...").
- Organize a narrativa num texto corrido (prosa), limpo, claro e coeso — corrija apenas grafia/gramática e a ordem/organização das informações, SEM PERDER nenhuma informação relevante que constava na narrativa original. Não resuma a ponto de omitir detalhes importantes.
- Não invente, não deduza além do que foi narrado, e não inclua opinião ou recomendação jurídica.
- Não inclua saudação, introdução ("Segue o relato:") ou qualquer comentário fora do relato em si.
- Não use markdown, listas ou títulos — apenas parágrafos de texto simples.

Regras para "orientacao":
- Se a narrativa tiver incongruências, inconsistências, ou lacunas/omissões que poderiam ser sanadas com novas perguntas à pessoa atendida, explique brevemente o que pode ser esclarecido, complementado ou questionado — inclusive sugerindo possíveis perguntas a fazer.
- Se a narrativa estiver completa e coerente, sem nada relevante a esclarecer, retorne null.
- Quando presente, escreva em português do Brasil, tom técnico e direto, dirigido à equipe/Defensor Público (não à pessoa atendida), no máximo 4-6 frases.`;

function montarPromptUsuario(payload: Payload): string {
  const partes: string[] = [];
  if (payload.personName?.trim()) partes.push(`Pessoa atendida: ${payload.personName.trim()}`);
  partes.push("", "Narrativa livre do atendimento:", payload.narrativa.trim());
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

  const narrativa = (payload.narrativa ?? "").trim();
  if (!narrativa) {
    return json({ error: "NO_NARRATIVE" }, 400);
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
          { role: "user", content: montarPromptUsuario({ ...payload, narrativa }) },
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

  const obj = parsed as Record<string, unknown>;
  const relato = typeof obj?.relato === "string" ? obj.relato.trim() : "";
  if (!relato) {
    return json({ error: "EMPTY_AI_RESPONSE" }, 502);
  }
  const orientacao =
    typeof obj?.orientacao === "string" && obj.orientacao.trim() ? obj.orientacao.trim().slice(0, 1000) : null;

  return json({ ok: true, relato, orientacao });
});
