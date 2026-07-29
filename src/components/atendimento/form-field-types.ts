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
];

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
  section: { label: "Seção", hasOptions: false },
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
    options: fieldHasOptions(type) ? ["Opção 1"] : null,
    visibleIf: null,
    requiredIf: null,
    allowOther: false,
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

/** Valores de preenchimento em memória (nunca persistidos). */
export type AtendimentoFormValues = Record<string, string | string[]>;

export function valorInicial(field: AtendimentoFormField): string | string[] {
  return field.type === "checkbox" ? [] : "";
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

function valorVazio(valor: string | string[] | undefined): boolean {
  if (valor === undefined) return true;
  if (Array.isArray(valor)) return valor.length === 0 || valor.every(valorTextoVazio);
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

/** Fase 3 — execução: rótulos dos campos obrigatórios (e visíveis) que
 *  ainda não foram respondidos. Vazio = pode concluir. Fase 4: considera
 *  obrigatoriedade condicional (`requiredIf`), não só o `required` estático. */
export function obrigatoriosFaltando(
  campos: AtendimentoFormField[],
  values: AtendimentoFormValues,
): string[] {
  return campos
    .filter((f) => f.type !== "section" && campoVisivel(f, values) && campoObrigatorioEfetivo(f, values))
    .filter((f) => valorVazio(values[f.id]))
    .map((f) => f.label || "(sem rótulo)");
}

/** Fase 3 — execução: transforma o preenchimento em pares label/valor
 *  (só campos visíveis e respondidos) para enviar ao resumo por IA. */
export function montarRespostasParaResumo(
  campos: AtendimentoFormField[],
  values: AtendimentoFormValues,
): { label: string; valor: string }[] {
  return campos
    .filter((f) => f.type !== "section" && campoVisivel(f, values))
    .map((f) => {
      const v = values[f.id];
      const valor = Array.isArray(v)
        ? v.map((x) => textoDeExibicaoPorTipo(f, x)).join(", ")
        : v !== undefined
          ? textoDeExibicaoPorTipo(f, v)
          : "";
      return { label: f.label || "(sem rótulo)", valor };
    })
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
    const v = values[campo.id];
    if (valorVazio(v)) continue;
    const valor = Array.isArray(v)
      ? v.map((x) => textoDeExibicaoPorTipo(campo, x)).join(", ")
      : textoDeExibicaoPorTipo(campo, v as string);
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
