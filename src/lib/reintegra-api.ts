import { supabase } from "@/integrations/supabase/client";

/** Tipos leves para reduzir dependência dos types gerados. */
export type ContentKind = "atendimento" | "cota";
export type ContentStatus = "rascunho" | "publicado" | "arquivado";
export type ContentVisibility = "privado" | "orgao" | "institucional";
export type WorkspaceColor =
  "neutral" | "green" | "blue" | "amber" | "burgundy" | "purple" | "slate" | "rose";

export type BibliotecaItem = {
  id: string;
  kind: ContentKind;
  titulo: string;
  categoria_id: string | null;
  categoria_nome: string | null;
  categorias: { id: string; nome: string }[];
  visibility: ContentVisibility;
  status: ContentStatus;
  owner_user_id: string;
  owner_nome: string;
  updated_at: string;
  favorite_count: number;
  is_favorited: boolean;
  access_count: number;
  // Ajuste doc — PÁGINA BIBLIOTECA: contagens para a tabela (antes só
  // disponíveis via obter_estatisticas_biblioteca, uma a uma).
  panel_insert_count: number;
  criados_a_partir_count: number;
};

export type BibliotecaCategoria = {
  id: string;
  nome: string;
  cor: string | null;
  order_position: number;
};

export type ItemDetalhado = {
  id: string;
  kind: ContentKind;
  status: ContentStatus;
  visibility: ContentVisibility;
  categoria_id: string | null;
  categoria_nome: string | null;
  categorias: { id: string; nome: string }[];
  owner_user_id: string;
  current_version_id: string | null;
  current_published_version_id: string | null;
  optimistic_version: number;
  titulo: string;
  body_json: unknown;
  form_schema: unknown;
  version_number: number;
  updated_at: string;
};

export type MutationResult = {
  version_id?: string;
  version_number?: number;
  optimistic_version: number;
};

// -------- COTA --------
// Modelo de texto reutilizável (negrito/itálico/sublinhado) criado por um
// Defensor Público para uso da sua equipe. Sem rascunho/publicação: toda
// cota já nasce visível para a equipe (visibility "equipe") e cada edição
// gera uma nova versão imutável. Apenas o Defensor autor edita ou exclui.
export type CotaCategoria = { id: string; nome: string };

export type CotaLink = { titulo: string; url: string };

export type CotaDetalhe = {
  id: string;
  titulo: string;
  bodyJson: unknown;
  bodyText: string;
  orientacao: string | null;
  orientacaoNivel: "media" | "alta";
  links: CotaLink[];
  categorias: CotaCategoria[];
  ownerUserId: string;
  ownerDisplayName: string;
  updatedAt: string;
  optimisticVersion: number;
  canEdit: boolean;
};

export async function criarCota(params: {
  titulo: string;
  bodyJson: unknown;
  bodyText: string;
  categoryIds?: string[];
  orientacao?: string;
  orientacaoNivel?: "media" | "alta";
  links?: CotaLink[];
  /** Ajuste doc (AJUSTE 10/21) — id da Cota usada como referência em
   *  "Inspirar nova cota", para contabilizar "criados a partir desta". */
  origemItemId?: string;
}): Promise<{ item_id: string; version_id: string }> {
  const { data, error } = await supabase.rpc("criar_cota", {
    p_titulo: params.titulo,
    p_body_json: params.bodyJson as never,
    p_body_text: params.bodyText,
    p_category_ids: (params.categoryIds ?? null) as never,
    p_orientacao: params.orientacao ?? null,
    p_orientacao_nivel: params.orientacaoNivel ?? "media",
    p_links: (params.links ?? []) as never,
    p_origem_item_id: params.origemItemId ?? null,
  } as never);
  if (error) throw error;
  return data as { item_id: string; version_id: string };
}

export async function atualizarCota(params: {
  itemId: string;
  expectedVersion: number;
  titulo: string;
  bodyJson: unknown;
  bodyText: string;
  categoryIds?: string[];
  orientacao?: string;
  orientacaoNivel?: "media" | "alta";
  links?: CotaLink[];
}): Promise<{ optimisticVersion: number; versionId: string; versionNumber: number }> {
  const { data, error } = await supabase.rpc("atualizar_cota", {
    p_item_id: params.itemId,
    p_expected_version: params.expectedVersion,
    p_idempotency_key: uuid(),
    p_titulo: params.titulo,
    p_body_json: params.bodyJson as never,
    p_body_text: params.bodyText,
    p_category_ids: (params.categoryIds ?? null) as never,
    p_orientacao: params.orientacao ?? null,
    p_orientacao_nivel: params.orientacaoNivel ?? "media",
    p_links: (params.links ?? []) as never,
  } as never);
  if (error) throw error;
  return data as { optimisticVersion: number; versionId: string; versionNumber: number };
}

export async function excluirCota(params: {
  itemId: string;
  expectedVersion: number;
}): Promise<{ deleted: boolean }> {
  const { data, error } = await supabase.rpc("excluir_cota", {
    p_item_id: params.itemId,
    p_expected_version: params.expectedVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return data as { deleted: boolean };
}

export async function obterCotaDetalhe(itemId: string): Promise<CotaDetalhe> {
  const { data, error } = await supabase.rpc("obter_cota_detalhe", { p_item_id: itemId } as never);
  if (error) throw error;
  return data as CotaDetalhe;
}

export async function adminCriarCategoriaBiblioteca(params: { nome: string }): Promise<string> {
  const { data, error } = await supabase.rpc("admin_criar_categoria_biblioteca", {
    p_nome: params.nome,
  } as never);
  if (error) throw error;
  return data as string;
}

export async function adminRenomearCategoriaBiblioteca(params: {
  categoryId: string;
  nome: string;
}): Promise<void> {
  const { error } = await supabase.rpc("admin_renomear_categoria_biblioteca", {
    p_category_id: params.categoryId,
    p_nome: params.nome,
  } as never);
  if (error) throw error;
}

export async function adminExcluirCategoriaBiblioteca(params: { categoryId: string }): Promise<void> {
  const { error } = await supabase.rpc("admin_excluir_categoria_biblioteca", {
    p_category_id: params.categoryId,
  } as never);
  if (error) throw error;
}

// -------- ATENDIMENTO --------
// Modelo de formulário reutilizável criado por um Defensor Público para
// orientar a equipe sobre o que perguntar durante o atendimento presencial.
// Mesmo modelo de publicação imediata da Cota (visibility "equipe", sem
// rascunho separado); cada edição gera uma nova versão imutável. Apenas o
// Defensor autor edita ou exclui. Dados preenchidos durante a execução do
// atendimento NUNCA são enviados/persistidos — apenas o "molde" (form_schema)
// vive no banco.
export type AtendimentoFieldType =
  | "text_short"
  | "text_long"
  | "radio"
  | "checkbox"
  | "dropdown"
  | "email"
  | "phone"
  | "cpf_cnpj"
  | "date"
  | "time"
  | "number"
  /** Fase 7: valor monetário (R$) — texto livre com formatação de exibição. */
  | "currency"
  /** Fase 7: matriz linhas x colunas (uma escolha por linha). */
  | "matrix"
  /** Fase 7: tabela preenchível — colunas fixas, linhas adicionadas
   *  livremente durante o preenchimento. */
  | "table_fillable"
  /** Fase 7: grupo repetível — um sub-schema (campos simples, sem
   *  aninhamento) que o usuário repete quantas vezes precisar. */
  | "repeat_group"
  /** Fase 7: campo calculado — somente leitura, computado a partir de
   *  outros campos (soma ou concatenação) no momento da exibição. */
  | "calculated"
  /** Marcador estrutural (título de seção) — não coleta resposta. Fase 2:
   *  lógica condicional. Pode ter sua própria visibleIf para "pular" a
   *  seção inteira conforme uma escolha anterior. Fase 5: cada seção
   *  também delimita uma etapa quando o formulário usa navegação por
   *  etapas. */
  | "section"
  /** Marcador estrutural (nota orientativa do Defensor Público para quem
   *  preenche) — não coleta resposta. O texto vive em `label`. É exibida
   *  no formulário em destaque (como a antiga descrição), mas é
   *  desconsiderada no resumo por IA, no texto expandido e nos PDFs
   *  gerados (em branco ou preenchido). */
  | "orientation"
  /** Bloco grande (Ajuste 8): checklist de itens marcáveis. Diferente de
   *  "orientation"/"section", coleta resposta (itens marcados) e participa
   *  da obrigatoriedade — quando marcado como obrigatório, exige que TODOS
   *  os itens estejam marcados. Como a orientação, fica de fora do resumo
   *  por IA, do texto expandido e do PDF preenchido (só aparece como
   *  checkboxes no PDF em branco/impressão do formulário vazio). */
  | "checklist";

/** Uma regra individual de condição: campo de escolha (sempre anterior na
 *  lista) e o valor esperado entre as respostas atuais. */
export type AtendimentoConditionRule = {
  fieldId: string;
  value: string;
};

/**
 * Condição (Fase 2 — visibilidade; Fase 4 — robustecida com múltiplas
 * regras combinadas por E/OU). `operator: "AND"` exige todas as regras;
 * `"OR"` exige ao menos uma. Sem condição (null/undefined) = sempre
 * satisfeita. Dados legados (pré-Fase 4) armazenam `{ fieldId, value }`
 * diretamente — o frontend normaliza esse formato ao ler.
 */
export type AtendimentoFieldCondition =
  | { operator: "AND" | "OR"; rules: AtendimentoConditionRule[] }
  | { fieldId: string; value: string };

/** Fase 7: definição de um campo calculado — somente leitura, computado a
 *  partir de outros campos escalares anteriores na lista. */
export type AtendimentoCalc = {
  kind: "sum" | "subtract";
  fieldIds: string[];
  /** Apenas para "sum": formata o resultado como moeda (R$). */
  outputCurrency?: boolean;
};

export type AtendimentoFormField = {
  id: string;
  type: AtendimentoFieldType;
  label: string;
  required: boolean;
  placeholder?: string | null;
  /** Radio/checkbox/dropdown: as opções. Matriz: os rótulos das colunas. */
  options?: string[] | null;
  /** Fase 2/4: visibilidade condicional. */
  visibleIf?: AtendimentoFieldCondition | null;
  /** Fase 4: obrigatoriedade condicional — quando presente, substitui o
   *  `required` estático: o campo só é exigido se esta condição for
   *  satisfeita pelas respostas já dadas. */
  requiredIf?: AtendimentoFieldCondition | null;
  /** Fase 7: para radio/checkbox/dropdown — acrescenta a opção "Outro",
   *  com um campo de texto livre associado à escolha. */
  allowOther?: boolean;
  /** Fase 7 — matriz: rótulos das linhas (colunas reaproveitam `options`). */
  matrixRows?: string[] | null;
  /** Fase 7 — tabela preenchível: rótulos das colunas fixas (linhas são
   *  adicionadas livremente durante o preenchimento). */
  tableColumns?: string[] | null;
  /** Fase 7 — grupo repetível: sub-schema repetido pelo usuário durante o
   *  preenchimento. Sem aninhamento — não pode conter seção, matriz,
   *  tabela, outro grupo repetível ou campo calculado. */
  repeatFields?: AtendimentoFormField[] | null;
  /** Fase 7 — campo calculado: nunca editável pelo usuário. */
  calc?: AtendimentoCalc | null;
  /** Bloco grande (Ajuste 8) — checklist: os itens marcáveis. Título
   *  (`label`) é opcional; quem carrega o conteúdo obrigatório é a lista. */
  checklistItems?: string[] | null;
  /** Ajuste doc — grau de importância de Orientação/Checklist: "media"
   *  (Âmbar, padrão) ou "alta" (Bordô). Ignorado por outros tipos de campo. */
  nivelImportancia?: "media" | "alta" | null;
  /** Ajuste doc — Atendimento IA: até 3 respostas prováveis sugeridas pela
   *  IA para campos de texto curto/longo, exibidas como botões de
   *  preenchimento rápido (não são opções de escolha obrigatória). */
  sugestoesResposta?: string[] | null;
  /** Ajuste doc (AJUSTE 6) — justificativa da IA (fundamento, relevância
   *  e propósito), gerada JUNTO com a pergunta no Atendimento Dinâmico —
   *  não mais sob demanda por clique. Nunca persistida (só existe
   *  durante a sessão do Atendimento IA, como o resto dos seus dados). */
  justificativa?: string | null;
};

export type AtendimentoDetalhe = {
  id: string;
  titulo: string;
  descricao: string | null;
  formSchema: AtendimentoFormField[];
  categorias: CotaCategoria[];
  ownerUserId: string;
  ownerDisplayName: string;
  updatedAt: string;
  optimisticVersion: number;
  canEdit: boolean;
};

export async function criarAtendimento(params: {
  titulo: string;
  descricao?: string;
  formSchema: AtendimentoFormField[];
  categoryIds?: string[];
  /** Ajuste doc (AJUSTE 9/21) — id do Atendimento usado como referência
   *  em "Inspirar novo atendimento", para contabilizar "criados a partir
   *  deste". */
  origemItemId?: string;
}): Promise<{ item_id: string; version_id: string }> {
  const { data, error } = await supabase.rpc("criar_atendimento", {
    p_titulo: params.titulo,
    p_descricao: params.descricao ?? null,
    p_form_schema: params.formSchema as never,
    p_category_ids: (params.categoryIds ?? null) as never,
    p_origem_item_id: params.origemItemId ?? null,
  } as never);
  if (error) throw error;
  return data as { item_id: string; version_id: string };
}

export async function atualizarAtendimento(params: {
  itemId: string;
  expectedVersion: number;
  titulo: string;
  descricao?: string;
  formSchema: AtendimentoFormField[];
  categoryIds?: string[];
}): Promise<{ optimisticVersion: number; versionId: string; versionNumber: number }> {
  const { data, error } = await supabase.rpc("atualizar_atendimento", {
    p_item_id: params.itemId,
    p_expected_version: params.expectedVersion,
    p_idempotency_key: uuid(),
    p_titulo: params.titulo,
    p_descricao: params.descricao ?? null,
    p_form_schema: params.formSchema as never,
    p_category_ids: (params.categoryIds ?? null) as never,
  } as never);
  if (error) throw error;
  return data as { optimisticVersion: number; versionId: string; versionNumber: number };
}

export async function excluirAtendimento(params: {
  itemId: string;
  expectedVersion: number;
}): Promise<{ deleted: boolean }> {
  const { data, error } = await supabase.rpc("excluir_atendimento", {
    p_item_id: params.itemId,
    p_expected_version: params.expectedVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return data as { deleted: boolean };
}

export async function obterAtendimentoDetalhe(itemId: string): Promise<AtendimentoDetalhe> {
  const { data, error } = await supabase.rpc("obter_atendimento_detalhe", {
    p_item_id: itemId,
  } as never);
  if (error) throw error;
  return data as AtendimentoDetalhe;
}

/**
 * Fase 3 (execução): gera o resumo narrativo em terceira pessoa via
 * Edge Function `atendimento-resumo-ia` (conector de IA embutido do
 * Lovable). As respostas preenchidas trafegam só nessa chamada — nunca
 * são salvas em nenhuma tabela.
 */
export async function gerarResumoAtendimentoIA(params: {
  titulo: string;
  descricao?: string | null;
  respostas: { label: string; valor: string }[];
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke("atendimento-resumo-ia", {
    body: {
      titulo: params.titulo,
      descricao: params.descricao ?? null,
      respostas: params.respostas,
    },
  });
  if (error) {
    // Em respostas non-2xx, o supabase-js não repassa o corpo JSON em
    // `data` — o código de erro estruturado (RATE_LIMITED, AI_CREDITS_
    // EXHAUSTED, etc.) precisa ser lido de error.context (o Response cru).
    let code: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = (await ctx.clone().json())?.error;
    } catch {
      // corpo não era JSON (ou já foi consumido) — segue com o fallback abaixo
    }
    throw new Error(code ?? error.message ?? "AI_GATEWAY_ERROR");
  }
  const resumo = (data as { resumo?: string } | null)?.resumo;
  if (!resumo) throw new Error("EMPTY_AI_RESPONSE");
  return resumo;
}

/** Ajuste doc — "Atendimento livre": a partir de uma narrativa livre
 *  (sem preocupação com organização/gramática), gera um relato limpo e
 *  coeso e, quando pertinente, uma Orientação com o que pode ser
 *  esclarecido/complementado/questionado (incluindo sugestões de
 *  perguntas). */
export async function gerarRelatoAtendimentoLivre(params: {
  personName?: string;
  narrativa: string;
}): Promise<{ relato: string; orientacao: string | null }> {
  const { data, error } = await supabase.functions.invoke("atendimento-livre-gerar", {
    body: { personName: params.personName, narrativa: params.narrativa },
  });
  if (error) {
    let code: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = (await ctx.clone().json())?.error;
    } catch {
      // corpo não era JSON (ou já foi consumido) — segue com o fallback abaixo
    }
    throw new Error(code ?? error.message ?? "AI_GATEWAY_ERROR");
  }
  const body = data as { relato?: string; orientacao?: string | null } | null;
  if (!body?.relato) throw new Error("EMPTY_AI_RESPONSE");
  return { relato: body.relato, orientacao: body.orientacao ?? null };
}

/** Limite de tamanho do arquivo anexado no Atendimento IA, conforme o doc
 *  de especificação (60MB). Só PDF é aceito. */
export const ATENDIMENTO_IA_MAX_FILE_BYTES = 60 * 1024 * 1024;

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // O FileReader devolve uma data URL ("data:<mime>;base64,<...>") —
      // a Edge Function só precisa da parte depois da vírgula.
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FILE_READ_ERROR"));
    reader.readAsDataURL(file);
  });
}

/** Ajuste doc (AJUSTE 26) — converte vários arquivos para o formato que a
 *  Edge Function espera. Nunca são salvos em nenhum bucket/tabela —
 *  trafegam só na chamada, convertidos para base64 no navegador. */
async function arquivosParaBase64(
  files: File[],
): Promise<{ base64: string; mimeType: string }[]> {
  return Promise.all(
    files.map(async (file) => ({ base64: await arquivoParaBase64(file), mimeType: file.type })),
  );
}

/**
 * Atendimento IA — a partir de zero, um ou mais documentos (PDF), do nome
 * da pessoa a ser atendida e de um contexto em texto livre, gera as
 * perguntas de um formulário de atendimento via Edge Function
 * `atendimento-ia-gerar`. Os arquivos nunca são salvos em nenhum
 * bucket/tabela — trafegam só nessa chamada, convertidos para base64 no
 * navegador. Ajuste doc (AJUSTE 26) — documento(s) agora são opcionais.
 */
export async function gerarAtendimentoComIA(params: {
  personName: string;
  context: string;
  files: File[];
  /** Ajuste doc (AJUSTE 13) — preferências opcionais do usuário. */
  campoTipo?: "curto" | "longo" | "ambos";
  gerarSugestoes?: boolean;
}): Promise<AtendimentoFormField[]> {
  if (params.files.some((f) => f.type !== "application/pdf")) {
    throw new Error("INVALID_FILE_TYPE");
  }
  const totalBytes = params.files.reduce((acc, f) => acc + f.size, 0);
  if (totalBytes > ATENDIMENTO_IA_MAX_FILE_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
  const files = await arquivosParaBase64(params.files);
  const { data, error } = await supabase.functions.invoke("atendimento-ia-gerar", {
    body: {
      personName: params.personName,
      context: params.context,
      files,
      campoTipo: params.campoTipo ?? "ambos",
      gerarSugestoes: params.gerarSugestoes ?? true,
    },
  });
  if (error) {
    let code: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = (await ctx.clone().json())?.error;
    } catch {
      // corpo não era JSON (ou já foi consumido) — segue com o fallback abaixo
    }
    throw new Error(code ?? error.message ?? "AI_GATEWAY_ERROR");
  }
  const campos = (data as { campos?: unknown } | null)?.campos;
  if (!Array.isArray(campos) || campos.length === 0) throw new Error("EMPTY_AI_RESPONSE");
  return campos as AtendimentoFormField[];
}

/** Ajuste doc (AJUSTE 14) — gera a justificativa da IA para uma pergunta
 *  específica do Atendimento IA (fundamento, relevância e propósito). */
export async function gerarJustificativaAtendimentoIA(params: {
  personName: string;
  context: string;
  files: File[];
  pergunta: string;
}): Promise<string> {
  const files = await arquivosParaBase64(params.files);
  const { data, error } = await supabase.functions.invoke("atendimento-ia-justificar", {
    body: {
      personName: params.personName,
      context: params.context,
      files,
      pergunta: params.pergunta,
    },
  });
  if (error) {
    let code: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = (await ctx.clone().json())?.error;
    } catch {
      // corpo não era JSON (ou já foi consumido) — segue com o fallback abaixo
    }
    throw new Error(code ?? error.message ?? "AI_GATEWAY_ERROR");
  }
  const justificativa = (data as { justificativa?: unknown } | null)?.justificativa;
  if (typeof justificativa !== "string" || !justificativa.trim()) throw new Error("EMPTY_AI_RESPONSE");
  return justificativa;
}

/** Ajuste doc (AJUSTE 15) — "Gerar mais perguntas": reprocessa o(s)
 *  mesmo(s) arquivo(s) pedindo perguntas NOVAS e não duplicadas, até o
 *  limite da quantidade já existente. Se o conteúdo estiver esgotado,
 *  retorna sem campos e com uma justificativa (para ser exibida como
 *  Orientação). */
export async function gerarMaisPerguntasAtendimentoIA(params: {
  personName: string;
  context: string;
  files: File[];
  perguntasExistentes: string[];
  campoTipo?: "curto" | "longo" | "ambos";
  gerarSugestoes?: boolean;
}): Promise<{ campos: AtendimentoFormField[]; esgotado: boolean; justificativa: string | null }> {
  const files = await arquivosParaBase64(params.files);
  const { data, error } = await supabase.functions.invoke("atendimento-ia-gerar", {
    body: {
      personName: params.personName,
      context: params.context,
      files,
      campoTipo: params.campoTipo ?? "ambos",
      gerarSugestoes: params.gerarSugestoes ?? true,
      perguntasExistentes: params.perguntasExistentes,
      maxNovas: params.perguntasExistentes.length,
    },
  });
  if (error) {
    let code: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = (await ctx.clone().json())?.error;
    } catch {
      // corpo não era JSON (ou já foi consumido) — segue com o fallback abaixo
    }
    throw new Error(code ?? error.message ?? "AI_GATEWAY_ERROR");
  }
  const body = data as { campos?: unknown; esgotado?: boolean; justificativa?: string | null } | null;
  const campos = Array.isArray(body?.campos) ? (body.campos as AtendimentoFormField[]) : [];
  return {
    campos,
    esgotado: body?.esgotado === true,
    justificativa: typeof body?.justificativa === "string" ? body.justificativa : null,
  };
}

/** Ajuste doc — "Configurações opcionais" do Atendimento IA, persistidas
 *  por usuário. */
export type AtendimentoIaPreferencias = {
  campoTipo: "curto" | "longo" | "ambos";
  respostasObrigatorias: boolean;
  gerarSugestoes: boolean;
  exibirJustificativa: boolean;
};

export async function obterPreferenciasAtendimentoIA(): Promise<AtendimentoIaPreferencias> {
  const { data, error } = await supabase.rpc("obter_preferencias_atendimento_ia");
  if (error) throw error;
  return data as AtendimentoIaPreferencias;
}

export async function salvarPreferenciasAtendimentoIA(
  prefs: AtendimentoIaPreferencias,
): Promise<void> {
  const { error } = await supabase.rpc("salvar_preferencias_atendimento_ia", {
    p_campo_tipo: prefs.campoTipo,
    p_respostas_obrigatorias: prefs.respostasObrigatorias,
    p_gerar_sugestoes: prefs.gerarSugestoes,
    p_exibir_justificativa: prefs.exibirJustificativa,
  } as never);
  if (error) throw error;
}

/** Contexto salvo pelo usuário para reutilização em futuros Atendimentos IA. */
export interface AtendimentoIaContexto {
  id: string;
  nome: string;
  texto: string;
}

/** Lista os contextos salvos pelo usuário logado (sempre por usuário, nunca
 *  compartilhado entre Defensores). */
export async function listarContextosAtendimentoIA(): Promise<AtendimentoIaContexto[]> {
  const { data, error } = await supabase.rpc("listar_contextos_atendimento_ia");
  if (error) throw error;
  return (data ?? []) as AtendimentoIaContexto[];
}

/** Salva (ou atualiza, se já existir um contexto com o mesmo nome) um
 *  contexto do usuário logado para reutilização futura. */
export async function salvarContextoAtendimentoIA(params: {
  nome: string;
  texto: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("salvar_contexto_atendimento_ia", {
    p_nome: params.nome,
    p_texto: params.texto,
  } as never);
  if (error) throw error;
  return data as string;
}

/** Exclui um contexto salvo do usuário logado. */
export async function excluirContextoAtendimentoIA(params: { contextId: string }): Promise<void> {
  const { error } = await supabase.rpc("excluir_contexto_atendimento_ia", {
    p_context_id: params.contextId,
  } as never);
  if (error) throw error;
}

// -------- BIBLIOTECA --------
export async function listarBiblioteca(params: {
  kind?: ContentKind;
  // Ajuste doc — PÁGINA BIBLIOTECA: seleção de várias categorias
  // simultaneamente (substituiu o filtro de categoria única).
  categoria_ids?: string[];
  query?: string;
  apenas_meus?: boolean;
  owner_user_id?: string;
  favoritos_apenas?: boolean;
  order_by?: "recentes" | "favoritos" | "utilizados";
  limit?: number;
  offset?: number;
}): Promise<BibliotecaItem[]> {
  const { data, error } = await supabase.rpc("listar_biblioteca", {
    p_kind: params.kind ?? undefined,
    p_category_ids:
      params.categoria_ids && params.categoria_ids.length > 0 ? params.categoria_ids : undefined,
    p_query: params.query ?? undefined,
    p_apenas_meus: params.apenas_meus ?? false,
    p_owner_user_id: params.owner_user_id ?? undefined,
    p_favoritos_apenas: params.favoritos_apenas ?? false,
    p_order_by: params.order_by ?? "recentes",
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  } as never);
  if (error) throw error;
  return (data ?? []) as BibliotecaItem[];
}

/** Ajuste doc — lista de autores com itens na Biblioteca, para o filtro
 *  "Autoria: (Usuário)". */
export async function listarAutoresBiblioteca(): Promise<{ user_id: string; nome: string }[]> {
  const { data, error } = await supabase.rpc("listar_autores_biblioteca");
  if (error) throw error;
  return (data ?? []) as { user_id: string; nome: string }[];
}

/** Ajuste doc — alterna favorito/desfavorito do item para o usuário
 *  logado, retornando o novo estado e a contagem total. */
export async function alternarFavoritoBiblioteca(
  itemId: string,
): Promise<{ is_favorited: boolean; favorite_count: number }> {
  const { data, error } = await supabase.rpc("alternar_favorito_biblioteca", {
    p_item_id: itemId,
  } as never);
  if (error) throw error;
  return data as { is_favorited: boolean; favorite_count: number };
}

/** Ajuste doc — registra que o item foi acessado, para o ranking "Mais
 *  utilizados". Fire-and-forget: falha aqui não deve travar a navegação. */
export async function registrarAcessoBiblioteca(itemId: string): Promise<void> {
  const { error } = await supabase.rpc("registrar_acesso_biblioteca", {
    p_item_id: itemId,
  } as never);
  if (error) throw error;
}

/** Ajuste doc — favorito/contagem de um único item, para exibir a
 *  estrelinha dentro do próprio Atendimento/Cota (fora do contexto da
 *  listagem da Biblioteca, que já traz isso embutido por linha). */
export async function obterFavoritoBiblioteca(
  itemId: string,
): Promise<{ is_favorited: boolean; favorite_count: number }> {
  const { data, error } = await supabase.rpc("obter_favorito_biblioteca", {
    p_item_id: itemId,
  } as never);
  if (error) throw error;
  return data as { is_favorited: boolean; favorite_count: number };
}

/** Ajuste doc (AJUSTE 21) — estatísticas de um Atendimento/Cota exibidas na
 *  caixinha flutuante ao passar o mouse no ícone de favoritar: total de
 *  acessos, inserções em painéis (por qualquer usuário) e itens criados a
 *  partir deste como referência ("Inspirar novo atendimento/nova cota"). */
export async function obterEstatisticasBiblioteca(itemId: string): Promise<{
  access_count: number;
  panel_insert_count: number;
  criados_a_partir_count: number;
}> {
  const { data, error } = await supabase.rpc("obter_estatisticas_biblioteca", {
    p_item_id: itemId,
  } as never);
  if (error) throw error;
  return data as { access_count: number; panel_insert_count: number; criados_a_partir_count: number };
}

export async function listarCategoriasBiblioteca(): Promise<BibliotecaCategoria[]> {
  const { data, error } = await supabase.rpc("listar_categorias_biblioteca");
  if (error) throw error;
  return (data ?? []) as BibliotecaCategoria[];
}

export async function obterItemBiblioteca(id: string): Promise<ItemDetalhado | null> {
  const { data, error } = await supabase.rpc("obter_item_biblioteca", { p_item_id: id } as never);
  if (error) throw error;
  const rows = (data ?? []) as ItemDetalhado[];
  return rows[0] ?? null;
}

export async function criarContentItem(params: {
  kind: ContentKind;
  titulo: string;
  categoria_id?: string | null;
  visibility?: ContentVisibility;
}): Promise<string> {
  const { data, error } = await supabase.rpc("criar_content_item", {
    p_kind: params.kind,
    p_title: params.titulo,
    p_category_id: params.categoria_id ?? null,
    p_visibility: params.visibility ?? "privado",
  } as never);
  if (error) throw error;
  return data as string;
}

export async function atualizarRascunho(params: {
  item_id: string;
  expected_version: number;
  idempotency_key: string;
  titulo: string;
  body_json: unknown;
  body_text: string;
  form_schema?: unknown;
}): Promise<MutationResult> {
  const { data, error } = await supabase.rpc("atualizar_rascunho", {
    p_item_id: params.item_id,
    p_expected_version: params.expected_version,
    p_idempotency_key: params.idempotency_key,
    p_title: params.titulo,
    p_body_json: params.body_json as never,
    p_body_text: params.body_text,
    p_form_schema: (params.form_schema ?? null) as never,
  } as never);
  if (error) throw error;
  return data as MutationResult;
}

export async function publicarVersao(params: {
  item_id: string;
  expected_version: number;
  idempotency_key: string;
  visibility: ContentVisibility;
}): Promise<MutationResult> {
  const { data, error } = await supabase.rpc("publicar_versao", {
    p_item_id: params.item_id,
    p_expected_version: params.expected_version,
    p_idempotency_key: params.idempotency_key,
    p_visibility: params.visibility,
  } as never);
  if (error) throw error;
  return data as MutationResult;
}

export async function arquivarItem(params: {
  item_id: string;
  expected_version: number;
  idempotency_key: string;
}): Promise<MutationResult> {
  const { data, error } = await supabase.rpc("arquivar_item", {
    p_item_id: params.item_id,
    p_expected_version: params.expected_version,
    p_idempotency_key: params.idempotency_key,
  } as never);
  if (error) throw error;
  return data as MutationResult;
}

// ==========================================================================
// ÁREA DE TRABALHO — workspace único por Defensor
// ==========================================================================

export type WorkspaceAccess = {
  accessMode: "owner" | "team_readonly" | "technical_readonly" | "technical_admin" | "none";
  canEditWorkspace: boolean;
  canManageColumns: boolean;
  canMoveCards: boolean;
  canAddItems: boolean;
};

export type WorkspaceMeta = {
  id: string;
  defensorUserId: string;
  nome: string;
  icone: string | null;
  optimisticVersion: number;
  updatedAt: string;
};

export type WorkspaceColumn = {
  id: string;
  nome: string;
  descricao: string | null;
  corToken: WorkspaceColor;
  corCustom: string | null;
  orderPosition: number;
  /** Ajuste doc (AJUSTE 1 — Ícones na área de trabalho): chave do ícone
   *  visual da coluna (sem vínculo real com categorias). */
  icone: string | null;
};

export type WorkspaceCardDto = {
  cardId: string;
  workspaceId: string;
  columnId: string;
  itemId: string;
  kind: ContentKind;
  placement: "owned" | "imported";
  title: string;
  description: string | null;
  categoryNames: string[];
  ownerDisplayName: string;
  status: ContentStatus;
  publishedVersionNumber: number | null;
  updatedAt: string;
  archivedByAuthor: boolean;
  orderPosition: number;
  /** Texto puro da cota, para copiar sem abrir o card. Sempre null para atendimento. */
  bodyText: string | null;
  /** HTML formatado (negrito/itálico/sublinhado) da cota, para copiar com formatação. Sempre null para atendimento. */
  bodyHtml: string | null;
  canOpen: boolean;
  canEdit: boolean;
  canUse: boolean;
};

export type WorkspaceCompleto = {
  workspace: WorkspaceMeta | null;
  access: WorkspaceAccess;
  columns: WorkspaceColumn[];
  cards: WorkspaceCardDto[];
};

export const workspaceKeys = {
  byDefender: (defenderUserId: string) => ["ws", "byDefender", defenderUserId] as const,
};

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Leitura canônica do Painel pelo `panelId`.
 *
 * Não seleciona Painel implicitamente e não depende de órgão. Autorização
 * é aplicada por `private.user_workspace_access`:
 *   - owner (Defensor proprietário)
 *   - team_readonly (membro com vínculo ativo + contexto)
 *   - technical_readonly (Admin Técnico)
 *
 * O parâmetro `defensorUserId` é mantido apenas para compatibilidade com
 * chamadas existentes (que passavam-no como fonte de "identidade da Área");
 * ele **não** é enviado ao backend — a autorização usa `panelId` e a
 * sessão do chamador.
 */
export async function listarWorkspaceCompleto(
  _defensorUserId: string,
  panelId: string,
): Promise<WorkspaceCompleto> {
  if (!panelId) throw new Error("PANEL_ID_REQUIRED");
  const { data, error } = await supabase.rpc("listar_workspace_completo", {
    p_panel_id: panelId,
  } as never);
  if (error) throw error;
  return data as WorkspaceCompleto;
}

export async function criarColunaWorkspace(params: {
  workspaceId: string;
  expectedWorkspaceVersion: number;
  nome: string;
  descricao?: string;
  corToken?: WorkspaceColor;
  corCustom?: string | null;
  icone?: string | null;
}): Promise<{ column_id: string; workspace_version: number }> {
  const { data, error } = await supabase.rpc("criar_coluna_workspace", {
    p_workspace_id: params.workspaceId,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
    p_nome: params.nome,
    p_descricao: params.descricao ?? null,
    p_cor_token: params.corToken ?? "neutral",
    p_cor_custom: params.corCustom ?? null,
    p_icone: params.icone ?? null,
  } as never);
  if (error) throw error;
  return data as { column_id: string; workspace_version: number };
}

export async function atualizarColunaWorkspace(params: {
  columnId: string;
  expectedWorkspaceVersion: number;
  nome: string;
  descricao?: string;
  corToken?: WorkspaceColor;
  corCustom?: string | null;
  icone?: string | null;
}): Promise<number> {
  const { data, error } = await supabase.rpc("atualizar_coluna_workspace", {
    p_column_id: params.columnId,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
    p_nome: params.nome,
    p_descricao: params.descricao ?? null,
    p_cor_token: params.corToken ?? "neutral",
    p_cor_custom: params.corCustom ?? null,
    p_icone: params.icone ?? null,
  } as never);
  if (error) throw error;
  return Number(data);
}

export async function moverColunaWorkspace(params: {
  columnId: string;
  direction: "left" | "right";
  expectedWorkspaceVersion: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc("mover_coluna_workspace", {
    p_column_id: params.columnId,
    p_direction: params.direction,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return Number(data);
}

export async function reordenarColunasWorkspace(params: {
  workspaceId: string;
  orderedColumnIds: string[];
  expectedWorkspaceVersion: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc("reordenar_colunas_workspace", {
    p_workspace_id: params.workspaceId,
    p_ordered_column_ids: params.orderedColumnIds,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return Number(data);
}

export async function excluirColunaWorkspace(params: {
  columnId: string;
  destinationColumnId: string | null;
  expectedWorkspaceVersion: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc("excluir_coluna_workspace", {
    p_column_id: params.columnId,
    p_destination_column_id: params.destinationColumnId,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return Number(data);
}

/** Ajuste doc — "Esvaziar coluna": remove todos os cards de uma vez, sem
 *  excluir a coluna nem o conteúdo (Atendimento/Cota) vinculado. */
export async function esvaziarColunaWorkspace(params: {
  columnId: string;
  expectedWorkspaceVersion: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc("esvaziar_coluna_workspace", {
    p_column_id: params.columnId,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return Number(data);
}

/** Ajuste doc (AJUSTE 13) — duplica a coluna no MESMO painel, logo à
 *  direita, com os cards copiados. */
export async function duplicarColunaWorkspace(params: {
  columnId: string;
  expectedWorkspaceVersion: number;
}): Promise<{ column_id: string; workspace_version: number }> {
  const { data, error } = await supabase.rpc("duplicar_coluna_workspace", {
    p_column_id: params.columnId,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return data as { column_id: string; workspace_version: number };
}

/** Ajuste doc (AJUSTE 13) — copia a coluna para outro painel do mesmo
 *  Defensor, como primeira coluna, com os cards copiados. */
export async function copiarColunaParaPainel(params: {
  columnId: string;
  targetWorkspaceId: string;
}): Promise<{ column_id: string; workspace_version: number }> {
  const { data, error } = await supabase.rpc("copiar_coluna_para_painel", {
    p_column_id: params.columnId,
    p_target_workspace_id: params.targetWorkspaceId,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return data as { column_id: string; workspace_version: number };
}

/** Ajuste doc (AJUSTE 13) — move a coluna (com os cards) para outro
 *  painel do mesmo Defensor, como primeira coluna. */
export async function moverColunaParaPainel(params: {
  columnId: string;
  targetWorkspaceId: string;
  expectedSourceWorkspaceVersion: number;
}): Promise<{ column_id: string; source_workspace_version: number; target_workspace_version: number }> {
  const { data, error } = await supabase.rpc("mover_coluna_para_painel", {
    p_column_id: params.columnId,
    p_target_workspace_id: params.targetWorkspaceId,
    p_expected_source_workspace_version: params.expectedSourceWorkspaceVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return data as { column_id: string; source_workspace_version: number; target_workspace_version: number };
}

export async function adicionarCardWorkspace(params: {
  columnId: string;
  itemId: string;
  expectedWorkspaceVersion: number;
}): Promise<{ card_id: string; workspace_version: number }> {
  const { data, error } = await supabase.rpc("adicionar_card_workspace", {
    p_column_id: params.columnId,
    p_item_id: params.itemId,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return data as { card_id: string; workspace_version: number };
}

export async function moverCardWorkspace(params: {
  cardId: string;
  targetColumnId: string;
  newPosition: number;
  expectedWorkspaceVersion: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc("mover_card_workspace", {
    p_card_id: params.cardId,
    p_target_column_id: params.targetColumnId,
    p_new_position: params.newPosition,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return Number(data);
}

export async function removerCardWorkspace(params: {
  cardId: string;
  expectedWorkspaceVersion: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc("remover_card_workspace", {
    p_card_id: params.cardId,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
  } as never);
  if (error) throw error;
  return Number(data);
}

/**
 * Erros de domínio conhecidos, todos vindos como `message` do PostgrestError.
 */
export function isConcurrentChangeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /CONCURRENT_CHANGE/i.test(msg);
}
