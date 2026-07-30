// Edge Function: atendimento-ia-gerar
// Bloco doc "IMPLEMENTAÇÃO DO ATENDIMENTO IA" — a partir de um documento
// (peça processual, minuta, ofício, e-mail etc., em PDF), do nome completo
// da pessoa a ser atendida e de um contexto em texto livre, a IA elabora um
// formulário de atendimento (perguntas) pertinente ao caso. Usa o mesmo
// conector de IA embutido do Lovable (Lovable AI Gateway) já usado por
// atendimento-resumo-ia — a chave LOVABLE_API_KEY é provisionada
// automaticamente pelo Lovable como secret do projeto.
//
// IMPORTANTE (verificar ao publicar no Lovable, não testável neste sandbox):
// 1) O documento é enviado como conteúdo multimodal (`image_url` com uma
//    data URL `data:application/pdf;base64,...`) na mesma mensagem do
//    usuário. Isso é o mecanismo padrão de bibliotecas de IA compatíveis
//    com a Chat Completions API para anexar arquivos/imagens, e o modelo
//    (Gemini 2.5 Flash) sabe interpretar PDFs — inclusive páginas
//    digitalizadas sem camada de texto — sem precisar de um motor de OCR
//    separado, já que o próprio modelo "lê" a página como imagem. Se o
//    gateway não repassar arquivos PDF dessa forma, é necessário ajustar
//    este trecho (ex.: usar um campo `file`/`document` específico, se o
//    Lovable AI Gateway expuser um).
// 2) Documentos grandes (o limite de entrada aceito no frontend é 60MB)
//    podem esbarrar em limites de tamanho de payload do próprio gateway/
//    modelo, que costumam ser bem menores (a ordem de grandeza usual para
//    anexos inline em APIs multimodais é ~20MB). Não há como validar isso
//    sem acesso ao ambiente publicado — se o upload de arquivos grandes
//    falhar em produção, o payload pode precisar ser reduzido/comprimido
//    antes do envio.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // 60MB, conforme o doc de especificação
const MAX_CAMPOS = 40;
const MAX_SUGESTOES_POR_CAMPO = 3;

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

type CampoGeradoTipo = "text_short" | "text_long";

type CampoGerado = {
  id: string;
  type: CampoGeradoTipo;
  label: string;
  required: boolean;
  sugestoesResposta: string[] | null;
};

type Payload = {
  personName: string;
  context: string;
  fileBase64: string;
  fileMimeType?: string;
};

const SYSTEM_PROMPT = `Você ajuda Defensores Públicos e suas equipes a montar formulários de atendimento ao público na Defensoria Pública do Estado do Rio Grande do Sul.

A partir de um documento anexado (peça processual, minuta, ofício, e-mail etc.), do nome da pessoa que será atendida e de um contexto informado pelo usuário, elabore uma lista de perguntas relevantes e pertinentes para orientar o atendimento presencial dessa pessoa.

Regras estritas:
- Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem markdown, sem crases.
- Formato exato: {"campos": [{"label": "...", "type": "text_short" | "text_long", "required": true | false, "sugestoesResposta": ["...", "..."] }]}.
- Todas as perguntas devem ser do tipo "text_short" (respostas curtas: nomes, datas, valores, números) ou "text_long" (relatos ou explicações mais longas). Não existe mais tipo de múltipla escolha neste formulário.
- "sugestoesResposta" é OPCIONAL: preencha apenas quando a pergunta tiver respostas prováveis e de escolha praticamente única (ex.: "Sim, fui encontrada e o estudo foi feito.", "Sim, fui procurada, mas o estudo não foi feito.", "Não, não houve tentativa de contato."). São sugestões de PREENCHIMENTO RÁPIDO por um clique — não uma escolha obrigatória —, então omita ou deixe null quando a resposta for genuinamente aberta/variável (nomes, datas, valores, relatos livres). No máximo 3 sugestões por pergunta.
- Gere entre 5 e 20 perguntas, cobrindo os pontos realmente relevantes ao caso descrito no documento e no contexto. Não gere perguntas genéricas demais nem redundantes.
- As perguntas devem ser dirigidas à pessoa atendida (quem responde é a equipe, com base no que a pessoa relatar), em português do Brasil, claras e objetivas.
- Não inclua perguntas sobre dados que já constam obviamente do documento anexado, a menos que seja importante confirmá-los com a pessoa atendida.`;

function montarPromptUsuario(personName: string, context: string): string {
  return [
    `Pessoa a ser atendida: ${personName}`,
    `Contexto informado pelo usuário: ${context}`,
    "",
    "Analise o documento anexado e formule as perguntas do formulário de atendimento conforme as regras do sistema.",
  ].join("\n");
}

function normalizarCampo(raw: unknown): CampoGerado | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim().slice(0, 300) : "";
  if (!label) return null;
  const tipoRaw = typeof r.type === "string" ? r.type : "text_short";
  const type: CampoGeradoTipo = tipoRaw === "text_long" ? "text_long" : "text_short";
  const required = r.required === true;
  const rawSugestoes = Array.isArray(r.sugestoesResposta) ? r.sugestoesResposta : [];
  const sugestoesResposta = rawSugestoes
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    .map((o) => o.trim().slice(0, 200))
    .slice(0, MAX_SUGESTOES_POR_CAMPO);
  return {
    id: crypto.randomUUID(),
    type,
    label,
    required,
    sugestoesResposta: sugestoesResposta.length > 0 ? sugestoesResposta : null,
  };
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
  const fileBase64 = payload.fileBase64 ?? "";
  const fileMimeType = payload.fileMimeType || "application/pdf";

  if (!personName || !context || !fileBase64) {
    return json({ error: "INVALID_PAYLOAD" }, 400);
  }
  if (fileMimeType !== "application/pdf") {
    return json({ error: "INVALID_FILE_TYPE" }, 400);
  }
  // Tamanho aproximado do arquivo original a partir do comprimento base64.
  const approxBytes = Math.floor((fileBase64.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
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
              { type: "text", text: montarPromptUsuario(personName, context) },
              {
                type: "image_url",
                image_url: { url: `data:${fileMimeType};base64,${fileBase64}` },
              },
            ],
          },
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
  const conteudo: string | undefined = aiJson?.choices?.[0]?.message?.content;
  if (!conteudo || !conteudo.trim()) {
    return json({ error: "EMPTY_AI_RESPONSE" }, 502);
  }

  // Extrai o JSON mesmo que o modelo tenha embrulhado em crases/markdown,
  // apesar de response_format:json_object pedir JSON puro.
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

  const rawCampos = Array.isArray((parsed as Record<string, unknown>)?.campos)
    ? ((parsed as Record<string, unknown>).campos as unknown[])
    : [];
  const campos = rawCampos
    .map(normalizarCampo)
    .filter((c): c is CampoGerado => c !== null)
    .slice(0, MAX_CAMPOS);

  if (campos.length === 0) {
    return json({ error: "EMPTY_AI_RESPONSE" }, 502);
  }

  return json({ ok: true, campos });
});
