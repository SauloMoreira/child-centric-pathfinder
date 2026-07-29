// Tipos de campo suportados pelo construtor de formulário de Atendimento,
// incluindo lógica condicional (Fase 2): visibilidade de campos/seções
// baseada em respostas anteriores. Compartilhado entre o builder
// (criação/edição) e o renderer (preenchimento/execução).
import type {
  AtendimentoConditionRule,
  AtendimentoFieldCondition,
  AtendimentoFieldType,
  AtendimentoFormField,
} from "@/lib/reintegra-api";

/** Tipos de campo com valor escalar simples (string) — os únicos aceitos
 *  como sub-campo de um grupo repetível ou como fonte de um campo
 *  calculado. Exclui seção, matriz, tabela, grupo repetível e calculado. */
const TIPOS_ESCALARES: AtendimentoFieldType[] = [
  "text_short",
  "text_long",
  "radio",
  "dropdown",
  "email",
  "phone",
  "cpf_cnpj",
  "date",
  "time",
  "number",
  "currency",
];

/** Tipos de campo oferecidos no seletor "tipo" de um campo comum do builder. */
export const FIELD_TYPE_ORDER: AtendimentoFieldType[] = [
  "text_short",
  "text_long",
  "radio",
  "checkbox",
  "dropdown",
  "email",
  "phone",
  "cpf_cnpj",
  "date",
  "time",
  "number",
  "currency",
  "matrix",
  "table_fillable",
  "repeat_group",
  "calculated",
];

/** Tipos de campo permitidos como sub-campo de um grupo repetível (Fase 7)
 *  — apenas valor escalar simples, sem checkbox (valor em array) nem
 *  aninhamento de estruturas compostas. */
export const REPEAT_SUBFIELD_TYPES: AtendimentoFieldType[] = TIPOS_ESCALARES;

/** Tipos de campo cuja resposta é uma escolha entre opções pré-definidas —
 *  únicos elegíveis como referência de uma condição de visibilidade. */
export const CHOICE_FIELD_TYPES: AtendimentoFieldType[] = ["radio", "checkbox", "dropdown"];

export const FIELD_TYPE_META: Record<AtendimentoFieldType, { label: string; hasOptions: boolean }> = {
  text_short: { label: "Texto curto", hasOptions: false },
  text_long: { label: "Texto longo", hasOptions: false },
  radio: { label: "Escolha única (opções)", hasOptions: true },
  checkbox: { label: "Múltipla escolha (opções)", hasOptions: true },
  dropdown: { label: "Lista suspensa (opções)", hasOptions: true },
  email: { label: "E-mail", hasOptions: false },
  phone: { label: "Telefone", hasOptions: false },
  cpf_cnpj: { label: "CPF/CNPJ", hasOptions: false },
  date: { label: "Data", hasOptions: false },
  time: { label: "Hora", hasOptions: false },
  number: { label: "Número", hasOptions: false },
  currency: { label: "Valor em reais (R$)", hasOptions: false },
  matrix: { label: "Matriz (linhas x colunas)", hasOptions: false },
  table_fillable: { label: "Tabela preenchível", hasOptions: false },
  repeat_group: { label: "Grupo repetível", hasOptions: false },
  calculated: { label: "Campo calculado", hasOptions: false },
  section: { label: "Seção", hasOptions: false },
  orientation: { label: "Orientação", hasOptions: false },
};

export function fieldHasOptions(type: AtendimentoFieldType): boolean {
  return FIELD_TYPE_META[type].hasOptions;
}

export function isChoiceField(type: AtendimentoFieldType): boolean {
  return CHOICE_FIELD_TYPES.includes(type);
}

export function novoCampo(type: AtendimentoFieldType = "text_short"): AtendimentoFormField {
  return {
    id: crypto.randomUUID(),
    type,
    label: "",
    required: false,
    placeholder: null,
    options: fieldHasOptions(type)
      ? ["Opção 1"]
      : type === "matrix"
        ? ["Coluna 1", "Coluna 2"]
        : null,
    visibleIf: null,
    requiredIf: null,
    allowOther: false,
    matrixRows: type === "matrix" ? ["Linha 1"] : null,
    tableColumns: type === "table_fillable" ? ["Coluna 1"] : null,
    repeatFields: type === "repeat_group" ? [] : null,
    calc: type === "calculated" ? { kind: "sum", fieldIds: [], outputCurrency: false } : null,
  };
}

/** Marcador estrutural de seção — divide o formulário em blocos e pode,
 *  ele próprio, ser pulado inteiro conforme uma escolha anterior. */
export function novaSecao(): AtendimentoFormField {
  return {
    id: crypto.randomUUID(),
    type: "section",
    label: "",
    required: false,
    placeholder: null,
    options: null,
    visibleIf: null,
  };
}

/** Ajuste doc — marcador estrutural de orientação: nota do Defensor
 *  Público para quem preenche o formulário. O texto vive em `label`. */
export function novaOrientacao(): AtendimentoFormField {
  return {
    id: crypto.randomUUID(),
    type: "orientation",
    label: "",
    required: false,
    placeholder: null,
    options: null,
    visibleIf: null,
  };
}

/** Valores de preenchimento em memória (nunca persistidos). String para a
 *  maioria dos tipos; string[] para checkbox; Record<string,string> para
 *  matriz (índice da linha -> coluna escolhida); Record<string,string>[]
 *  para tabela preenchível (uma linha por registro, chave = coluna) e
 *  grupo repetível (uma instância por registro, chave = id do sub-campo). */
export type AtendimentoFormValues = Record<
  string,
  string | string[] | Record<string, string> | Record<string, string>[]
>;

export function valorInicial(field: AtendimentoFormField): AtendimentoFormValues[string] {
  if (field.type === "checkbox") return [];
  if (field.type === "matrix") return {};
  if (field.type === "table_fillable" || field.type === "repeat_group") return [];
  return "";
}

/**
 * Fase 4 — normaliza uma condição para o formato atual (`{ operator,
 * rules }`), aceitando também o formato legado de regra única (`{
 * fieldId, value }`) salvo por formulários criados antes desta fase.
 * `null`/`undefined` => nenhuma condição.
 */
export function normalizarCondicao(
  condicao: AtendimentoFieldCondition | null | undefined,
): { operator: "AND" | "OR"; rules: AtendimentoConditionRule[] } | null {
  if (!condicao) return null;
  if ("rules" in condicao && Array.isArray(condicao.rules)) {
    return condicao.rules.length > 0 ? condicao : null;
  }
  if ("fieldId" in condicao && typeof condicao.fieldId === "string") {
    return { operator: "AND", rules: [{ fieldId: condicao.fieldId, value: condicao.value }] };
  }
  return null;
}

/**
 * Avalia se uma condição está satisfeita dado o mapa de respostas atual.
 * Sem condição => sempre satisfeita. Múltiplas regras são combinadas por
 * "AND" (todas) ou "OR" (ao menos uma).
 */
export function condicaoSatisfeita(
  condicaoRaw: AtendimentoFieldCondition | null | undefined,
  values: AtendimentoFormValues,
): boolean {
  const condicao = normalizarCondicao(condicaoRaw);
  if (!condicao) return true;
  const regraSatisfeita = (regra: AtendimentoConditionRule): boolean => {
    const resposta = values[regra.fieldId];
    if (resposta === undefined) return false;
    if (Array.isArray(resposta)) return resposta.includes(regra.value);
    return resposta === regra.value;
  };
  return condicao.operator === "OR"
    ? condicao.rules.some(regraSatisfeita)
    : condicao.rules.every(regraSatisfeita);
}

/** Visibilidade de um campo/seção específico, dado o preenchimento atual. */
export function campoVisivel(field: AtendimentoFormField, values: AtendimentoFormValues): boolean {
  return condicaoSatisfeita(field.visibleIf, values);
}

/** Fase 4: obrigatoriedade efetiva de um campo — quando `requiredIf` está
 *  definido, ele substitui o `required` estático (o campo só é exigido se
 *  a condição for satisfeita pelas respostas já dadas). */
export function campoObrigatorioEfetivo(field: AtendimentoFormField, values: AtendimentoFormValues): boolean {
  if (field.requiredIf) return condicaoSatisfeita(field.requiredIf, values);
  return field.required;
}

/** Fase 4: remove, de uma condição, as regras que referenciam `fieldId` —
 *  usado ao excluir um campo do builder ou quando ele deixa de ser
 *  elegível (deixou de ser um campo de escolha). Retorna `null` se não
 *  sobrar nenhuma regra. */
export function removerReferenciaDaCondicao(
  condicao: AtendimentoFieldCondition | null | undefined,
  fieldId: string,
): AtendimentoFieldCondition | null {
  const norm = normalizarCondicao(condicao);
  if (!norm) return null;
  const rules = norm.rules.filter((r) => r.fieldId !== fieldId);
  return rules.length > 0 ? { operator: norm.operator, rules } : null;
}

/** Fase 4: valida uma condição no momento da submissão do builder —
 *  descarta regras que referenciam campo inexistente, que deixou de ser
 *  de escolha, ou opção que não existe mais. `null` se nada sobrar. */
export function validarCondicaoParaSubmissao(
  condicao: AtendimentoFieldCondition | null | undefined,
  camposAnteriores: AtendimentoFormField[],
): AtendimentoFieldCondition | null {
  const norm = normalizarCondicao(condicao);
  if (!norm) return null;
  const rules = norm.rules.filter((r) => {
    const ref = camposAnteriores.find((c) => c.id === r.fieldId);
    return ref && isChoiceField(ref.type) && (ref.options ?? []).includes(r.value);
  });
  return rules.length > 0 ? { operator: norm.operator, rules } : null;
}

/**
 * Campos elegíveis como referência de condição para o campo/seção no
 * índice `index` do builder: apenas campos de escolha (radio/checkbox/
 * dropdown) que aparecem ANTES dele na lista — evita referências
 * circulares ou "para frente".
 */
export function camposElegiveisParaCondicao(
  campos: AtendimentoFormField[],
  index: number,
): AtendimentoFormField[] {
  return campos.slice(0, index).filter((f) => isChoiceField(f.type) && (f.options ?? []).length > 0);
}

/** Fase 7 — prefixo sentinela usado para marcar que o valor armazenado de
 *  um campo de escolha é, na verdade, o texto livre digitado na opção
 *  "Outro" (em vez de uma das opções pré-definidas). */
const OUTRO_PREFIXO = "__outro__:";

export function ehValorOutro(v: string): boolean {
  return v.startsWith(OUTRO_PREFIXO);
}

export function construirValorOutro(texto: string): string {
  return OUTRO_PREFIXO + texto;
}

export function textoDoValorOutro(v: string): string {
  return v.slice(OUTRO_PREFIXO.length);
}

function valorTextoVazio(v: string): boolean {
  return ehValorOutro(v) ? !textoDoValorOutro(v).trim() : !v.trim();
}

function valorVazio(valor: AtendimentoFormValues[string] | undefined): boolean {
  if (valor === undefined) return true;
  if (Array.isArray(valor)) {
    if (valor.length === 0) return true;
    // string[] (checkbox) — vazio se nenhum item tem conteúdo real.
    if (typeof valor[0] === "string") return (valor as string[]).every(valorTextoVazio);
    // Record<string,string>[] (tabela/grupo repetível) — ao menos uma
    // linha/instância já conta como preenchido, independente do conteúdo
    // de cada célula.
    return false;
  }
  if (typeof valor === "object") {
    // Record<string,string> (matriz) — vazio se nenhuma linha foi respondida.
    return Object.values(valor).every((v) => !v || !v.trim());
  }
  return valorTextoVazio(valor);
}

/** Texto de exibição de uma resposta: resolve o valor da opção "Outro"
 *  para o texto livre digitado (sem o prefixo sentinela interno). */
export function valorParaExibicao(v: string): string {
  return ehValorOutro(v) ? `Outro: ${textoDoValorOutro(v)}` : v;
}

/** Fase 7 — formata (best-effort) uma string numérica livre como moeda
 *  brasileira para exibição em impressão/resumo/texto expandido. Se não
 *  for possível interpretar como número, devolve o texto original. */
export function formatarMoedaExibicao(v: string): string {
  if (!v.trim()) return v;
  const num = Number(v.replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(num)) return v;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function textoDeExibicaoPorTipo(field: AtendimentoFormField, v: string): string {
  return field.type === "currency" ? formatarMoedaExibicao(v) : valorParaExibicao(v);
}

/** Fase 7 — campos elegíveis como fonte de um campo calculado no índice
 *  `index` do builder: apenas campos com valor escalar simples (inclui
 *  checkbox, já que "concatenar" sabe juntar múltiplos valores) que
 *  aparecem ANTES dele na lista — mesma regra estrutural anti-ciclo usada
 *  nas condições. Para "sum", restringe a campos numéricos/moeda. */
export function camposElegiveisParaCalculo(
  campos: AtendimentoFormField[],
  index: number,
  kind: "sum" | "concat",
): AtendimentoFormField[] {
  const tipos: AtendimentoFieldType[] = [...TIPOS_ESCALARES, "checkbox"];
  return campos
    .slice(0, index)
    .filter((f) => tipos.includes(f.type))
    .filter((f) => (kind === "sum" ? f.type === "number" || f.type === "currency" : true));
}

/** Fase 7 — computa o valor de um campo calculado a partir das respostas
 *  já dadas aos campos referenciados em `calc.fieldIds`. "sum" soma os
 *  valores numéricos; "concat" junta os textos com o separador definido. */
export function calcularValor(
  campo: AtendimentoFormField,
  todosOsCampos: AtendimentoFormField[],
  values: AtendimentoFormValues,
): string {
  const calc = campo.calc;
  if (!calc || calc.fieldIds.length === 0) return "";
  const referenciados = calc.fieldIds
    .map((id) => todosOsCampos.find((c) => c.id === id))
    .filter((c): c is AtendimentoFormField => !!c);
  if (calc.kind === "sum") {
    const soma = referenciados.reduce((acc, c) => {
      const v = values[c.id];
      const texto = typeof v === "string" ? v : "";
      if (!texto.trim()) return acc;
      const num = Number(texto.replace(/\./g, "").replace(",", "."));
      return acc + (Number.isNaN(num) ? 0 : num);
    }, 0);
    return calc.outputCurrency
      ? soma.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : soma.toLocaleString("pt-BR");
  }
  const sep = calc.separator ?? ", ";
  return referenciados
    .map((c) => {
      const v = values[c.id];
      if (typeof v === "string") return v.trim() ? textoDeExibicaoPorTipo(c, v) : "";
      if (Array.isArray(v) && (v.length === 0 || typeof v[0] === "string")) {
        return (v as string[]).map((x) => textoDeExibicaoPorTipo(c, x)).join(", ");
      }
      return "";
    })
    .filter((t) => t.trim().length > 0)
    .join(sep);
}

/** Fase 7 — texto de exibição unificado de uma resposta, para qualquer
 *  tipo de campo (incluindo matriz, tabela, grupo repetível e campo
 *  calculado). Um único lugar para a lógica de formatação por tipo,
 *  usado pelo resumo por IA, impressão preenchida e texto expandido. */
export function textoDaResposta(
  campo: AtendimentoFormField,
  valor: AtendimentoFormValues[string] | undefined,
  todosOsCampos: AtendimentoFormField[],
  values: AtendimentoFormValues,
): string {
  if (campo.type === "calculated") return calcularValor(campo, todosOsCampos, values);
  if (valor === undefined) return "";
  if (campo.type === "matrix") {
    const registro = valor as Record<string, string>;
    return (campo.matrixRows ?? [])
      .map((rotulo, i) => (registro[String(i)] ? `${rotulo}: ${registro[String(i)]}` : null))
      .filter((s): s is string => !!s)
      .join("; ");
  }
  if (campo.type === "table_fillable") {
    const cols = campo.tableColumns ?? [];
    return (valor as Record<string, string>[])
      .map((linha) =>
        cols
          .map((c) => (linha[c]?.trim() ? `${c}: ${linha[c]}` : null))
          .filter((s): s is string => !!s)
          .join(", "),
      )
      .filter((s) => s.length > 0)
      .join(" | ");
  }
  if (campo.type === "repeat_group") {
    const sub = campo.repeatFields ?? [];
    return (valor as Record<string, string>[])
      .map((inst) =>
        sub
          .map((sf) =>
            inst[sf.id]?.trim() ? `${sf.label || "(sem rótulo)"}: ${textoDeExibicaoPorTipo(sf, inst[sf.id])}` : null,
          )
          .filter((s): s is string => !!s)
          .join(", "),
      )
      .filter((s) => s.length > 0)
      .join(" | ");
  }
  if (Array.isArray(valor)) return (valor as string[]).map((x) => textoDeExibicaoPorTipo(campo, x)).join(", ");
  return textoDeExibicaoPorTipo(campo, valor as string);
}

/** Fase 3 — execução: rótulos dos campos obrigatórios (e visíveis) que
 *  ainda não foram respondidos. Vazio = pode concluir. Fase 4: considera
 *  obrigatoriedade condicional (`requiredIf`), não só o `required` estático.
 *  Campos calculados nunca bloqueiam (são sempre preenchidos automaticamente). */
export function obrigatoriosFaltando(
  campos: AtendimentoFormField[],
  values: AtendimentoFormValues,
): string[] {
  return campos
    .filter(
      (f) =>
        f.type !== "section" &&
        f.type !== "orientation" &&
        f.type !== "calculated" &&
        campoVisivel(f, values) &&
        campoObrigatorioEfetivo(f, values),
    )
    .filter((f) => valorVazio(values[f.id]))
    .map((f) => f.label || "(sem rótulo)");
}

/** Fase 3 — execução: transforma o preenchimento em pares label/valor
 *  (só campos visíveis e respondidos, incluindo calculados) para enviar
 *  ao resumo por IA. */
export function montarRespostasParaResumo(
  campos: AtendimentoFormField[],
  values: AtendimentoFormValues,
): { label: string; valor: string }[] {
  return campos
    .filter((f) => f.type !== "section" && f.type !== "orientation" && campoVisivel(f, values))
    .map((f) => ({
      label: f.label || "(sem rótulo)",
      valor: textoDaResposta(f, values[f.id], campos, values),
    }))
    .filter((r) => r.valor.trim().length > 0);
}

/** Fase 6 — saída local determinística (sem IA, sem chamada de rede):
 *  texto corrido combinando pergunta e resposta, respeitando seções e
 *  visibilidade condicional atual. Alternativa ao resumo por IA para
 *  quando não se quer que as respostas trafeguem para fora do navegador. */
export function montarTextoExpandido(
  titulo: string,
  descricao: string | null | undefined,
  campos: AtendimentoFormField[],
  values: AtendimentoFormValues,
): string {
  const linhas: string[] = [titulo];
  if (descricao) linhas.push(descricao);
  for (const campo of campos) {
    if (!campoVisivel(campo, values)) continue;
    if (campo.type === "section") {
      if (campo.label) linhas.push("", campo.label.toUpperCase());
      continue;
    }
    if (campo.type === "orientation") continue;
    const valor = textoDaResposta(campo, values[campo.id], campos, values);
    if (!valor.trim()) continue;
    linhas.push(`${campo.label || "(sem rótulo)"}: ${valor}`);
  }
  return linhas.join("\n");
}

/** Fase 3 — execução: true se ao menos uma resposta já foi preenchida
 *  (usado para o aviso de perda de dados ao fechar a layer). */
export function hasRespostaPreenchida(values: AtendimentoFormValues): boolean {
  return Object.values(values).some((v) => !valorVazio(v));
}

export type AtendimentoEtapa = { titulo: string | null; campos: AtendimentoFormField[] };

/** Fase 5 — agrupa uma lista de campos (já filtrada por visibilidade) em
 *  etapas por seção: cada "section" inicia uma nova etapa. Campos antes
 *  da primeira seção formam a etapa inicial (sem título). Usado pelo
 *  runner quando o formulário tem 2+ seções — senão, preenchimento é em
 *  página única. */
export function agruparEmEtapas(campos: AtendimentoFormField[]): AtendimentoEtapa[] {
  const etapas: AtendimentoEtapa[] = [];
  let atual: AtendimentoEtapa = { titulo: null, campos: [] };
  for (const campo of campos) {
    if (campo.type === "section") {
      if (atual.campos.length > 0 || atual.titulo !== null) etapas.push(atual);
      atual = { titulo: campo.label || "(seção sem título)", campos: [] };
    } else {
      atual.campos.push(campo);
    }
  }
  if (atual.campos.length > 0 || atual.titulo !== null) etapas.push(atual);
  return etapas;
}
