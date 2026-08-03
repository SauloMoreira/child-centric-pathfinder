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
  /** Ajuste doc (AJUSTE 26) — agora opcional (o formulário pode ser
   *  gerado só com contexto) e em lista (mais de um documento). Mantidos
   *  fileBase64/fileMimeType (singular) só por compatibilidade com
   *  chamadas antigas eventualmente em cache no navegador do usuário. */
  files?: { base64: string; mimeType: string }[];
  fileBase64?: string;
  fileMimeType?: string;
  /** Ajuste doc (AJUSTE 13) — preferências opcionais do usuário. */
  campoTipo?: "curto" | "longo" | "ambos";
  gerarSugestoes?: boolean;
  /** Ajuste doc (AJUSTE 15) — "Gerar mais perguntas": rótulos das
   *  perguntas já existentes (para não duplicar) e o teto de novas
   *  perguntas (nunca maior que a quantidade já realizada). */
  perguntasExistentes?: string[];
  maxNovas?: number;
};

const SYSTEM_PROMPT = `Você ajuda Defensores Públicos e suas equipes a montar formulários de atendimento ao público na Defensoria Pública do Estado do Rio Grande do Sul.

A partir de um ou mais documentos de referência anexados (peça processual, minuta, ofício, e-mail etc. — pode não haver nenhum, trabalhando só com o contexto), do nome da pessoa que será atendida e de um contexto informado pelo usuário, elabore uma lista de perguntas relevantes e pertinentes para orientar o atendimento presencial dessa pessoa.

Regras estritas:
- Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem markdown, sem crases.
- Formato exato: {"campos": [{"label": "...", "type": "text_short" | "text_long", "required": true | false, "sugestoesResposta": ["...", "..."] }]}.
- Todas as perguntas devem ser do tipo "text_short" (respostas curtas: nomes, datas, valores, números) ou "text_long" (relatos ou explicações mais longas). Não existe mais tipo de múltipla escolha neste formulário.
- "sugestoesResposta": sempre que possível, proponha respostas prováveis/possíveis para a pergunta — inclusive para perguntas de texto longo, não só as de escolha praticamente única. São sugestões de PREENCHIMENTO RÁPIDO por um clique, não uma escolha obrigatória; a pessoa que preenche pode ignorá-las ou editar livremente depois. Sempre que houver alguma probabilidade razoável de resposta, tente sugerir pelo menos 3 opções distintas e plausíveis. Só omita ou deixe null quando a resposta for genuinamente imprevisível/única (ex.: nomes próprios, datas específicas, valores exatos, números de processo).
- Sempre que alguma pergunta mencionar o nome da pessoa atendida ou de terceiros, escreva o nome em LETRAS MAIÚSCULAS dentro do texto da pergunta.
- Gere entre 5 e 20 perguntas, cobrindo os pontos realmente relevantes ao caso descrito no(s) documento(s) (quando houver) e no contexto. Não gere perguntas genéricas demais nem redundantes.
- As perguntas devem ser dirigidas à pessoa atendida (quem responde é a equipe, com base no que a pessoa relatar), em português do Brasil, claras e objetivas.
- Não inclua perguntas sobre dados que já constam obviamente do(s) documento(s) anexado(s), a menos que seja importante confirmá-los com a pessoa atendida.`;

// Ajuste doc (AJUSTE 13) — "Configurações opcionais": ajusta o prompt do
// sistema conforme as preferências do usuário (tipo de campo e geração
// de sugestões de resposta). Ajuste doc (AJUSTE 15) — modo "gerar mais
// perguntas".
function montarSystemPrompt(
  campoTipo: "curto" | "longo" | "ambos",
  gerarSugestoes: boolean,
  modoMaisPerguntas: boolean,
): string {
  let prompt = SYSTEM_PROMPT;
  if (campoTipo === "curto") {
    prompt += `\n- Preferência do usuário: use SOMENTE o tipo "text_short" para todas as perguntas, mesmo para relatos mais longos (nunca "text_long").`;
  } else if (campoTipo === "longo") {
    prompt += `\n- Preferência do usuário: use SOMENTE o tipo "text_long" para todas as perguntas (nunca "text_short").`;
  }
  if (!gerarSugestoes) {
    prompt += `\n- Preferência do usuário: NÃO gere "sugestoesResposta" para nenhuma pergunta — deixe sempre null.`;
  }
  if (modoMaisPerguntas) {
    prompt += `\n- Modo "gerar mais perguntas": o usuário já respondeu/recebeu um conjunto de perguntas (listadas a seguir no prompt do usuário). Gere APENAS perguntas NOVAS, relevantes e pertinentes, que não dupliquem nem sejam próximas demais das já existentes. Gere o máximo de perguntas adicionais realmente pertinentes, mas NUNCA mais do que o limite indicado no prompt do usuário. Se o conteúdo de referência e o contexto já estiverem esgotados — ou seja, não houver nenhuma pergunta nova genuinamente relevante a acrescentar — retorne "campos": [] e preencha "esgotado": true com uma "justificativa" curta (1-3 frases) explicando por que não há mais perguntas pertinentes a fazer. Caso ainda haja perguntas pertinentes a acrescentar, retorne "esgotado": false e "justificativa": null. Formato de resposta neste modo: {"campos": [...], "esgotado": true|false, "justificativa": "..." | null}.`;
  }
  return prompt;
}

function montarPromptUsuario(
  personName: string,
  context: string,
  perguntasExistentes?: string[],
  maxNovas?: number,
): string {
  const linhas = [
    `Pessoa a ser atendida: ${personName}`,
    `Contexto informado pelo usuário: ${context}`,
    "",
  ];
  if (perguntasExistentes && perguntasExistentes.length > 0) {
    linhas.push(
      "Perguntas JÁ EXISTENTES no formulário (não repita nem gere perguntas muito parecidas com estas):",
      ...perguntasExistentes.map((p, i) => `${i + 1}. ${p}`),
      "",
      `Gere no máximo ${maxNovas ?? perguntasExistentes.length} pergunta(s) NOVA(s), relevantes e pertinentes ao caso e ao contexto.`,
    );
  } else {
    linhas.push(
      "Analise o(s) documento(s) anexado(s), se houver, e o contexto informado, e formule as perguntas do formulário de atendimento conforme as regras do sistema.",
    );
  }
  return linhas.join("\n");
}

function normalizarCampo(
  raw: unknown,
  campoTipo: "curto" | "longo" | "ambos",
  gerarSugestoes: boolean,
): CampoGerado | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim().slice(0, 300) : "";
  if (!label) return null;
  const tipoRaw = typeof r.type === "string" ? r.type : "text_short";
  // Reforço da preferência do usuário (o prompt já instrui a IA, isso é
  // só uma rede de segurança caso ela não obedeça 100%).
  const type: CampoGeradoTipo =
    campoTipo === "curto"
      ? "text_short"
      : campoTipo === "longo"
        ? "text_long"
        : tipoRaw === "text_long"
          ? "text_long"
          : "text_short";
  const required = r.required === true;
  const rawSugestoes = gerarSugestoes && Array.isArray(r.sugestoesResposta) ? r.sugestoesResposta : [];
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
  // Ajuste doc (AJUSTE 26) — normaliza para uma lista, aceitando tanto o
  // novo formato (files[]) quanto o antigo (fileBase64 singular).
  const files: { base64: string; mimeType: string }[] = Array.isArray(payload.files)
    ? payload.files.filter(
        (f): f is { base64: string; mimeType: string } =>
          !!f && typeof f.base64 === "string" && f.base64.length > 0,
      )
    : payload.fileBase64
      ? [{ base64: payload.fileBase64, mimeType: payload.fileMimeType || "application/pdf" }]
      : [];
  const campoTipo: "curto" | "longo" | "ambos" =
    payload.campoTipo === "curto" || payload.campoTipo === "longo" ? payload.campoTipo : "ambos";
  const gerarSugestoes = payload.gerarSugestoes !== false;
  const perguntasExistentes = Array.isArray(payload.perguntasExistentes)
    ? payload.perguntasExistentes.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : [];
  const modoMaisPerguntas = perguntasExistentes.length > 0;
  const maxNovas = modoMaisPerguntas
    ? Math.max(1, Math.min(perguntasExistentes.length, Number(payload.maxNovas) || perguntasExistentes.length))
    : undefined;

  // Ajuste doc (AJUSTE 26) — o documento deixou de ser obrigatório: o
  // formulário pode ser gerado só com o contexto.
  if (!personName || !context) {
    return json({ error: "INVALID_PAYLOAD" }, 400);
  }
  if (files.some((f) => f.mimeType !== "application/pdf")) {
    return json({ error: "INVALID_FILE_TYPE" }, 400);
  }
  // Tamanho aproximado (soma de todos os arquivos) a partir do comprimento base64.
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
          { role: "system", content: montarSystemPrompt(campoTipo, gerarSugestoes, modoMaisPerguntas) },
          {
            role: "user",
            content: [
              { type: "text", text: montarPromptUsuario(personName, context, perguntasExistentes, maxNovas) },
              // Ajuste doc (AJUSTE 26) — um bloco image_url por documento
              // anexado; se nenhum documento foi anexado, a IA trabalha
              // só com o contexto informado.
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
  const camposLimite = modoMaisPerguntas ? (maxNovas ?? MAX_CAMPOS) : MAX_CAMPOS;
  const campos = rawCampos
    .map((raw) => normalizarCampo(raw, campoTipo, gerarSugestoes))
    .filter((c): c is CampoGerado => c !== null)
    .slice(0, camposLimite);

  const parsedObj = parsed as Record<string, unknown>;
  const esgotado = modoMaisPerguntas && parsedObj?.esgotado === true;
  const justificativa =
    modoMaisPerguntas && typeof parsedObj?.justificativa === "string" && parsedObj.justificativa.trim()
      ? parsedObj.justificativa.trim().slice(0, 600)
      : null;

  if (campos.length === 0 && !(modoMaisPerguntas && (esgotado || justificativa))) {
    return json({ error: "EMPTY_AI_RESPONSE" }, 502);
  }

  return json({ ok: true, campos, esgotado, justificativa });
});
