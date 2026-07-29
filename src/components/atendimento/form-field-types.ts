// Tipos de campo suportados pelo construtor de formulário de Atendimento,
// incluindo lógica condicional (Fase 2): visibilidade de campos/seções
// baseada em respostas anteriores. Compartilhado entre o builder
// (criação/edição) e o renderer (preenchimento/execução).
import type {
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
 * Avalia se uma condição de visibilidade está satisfeita dado o mapa de
 * respostas atual. Sem condição => sempre satisfeita (visível).
 */
export function condicaoSatisfeita(
  condicao: AtendimentoFieldCondition | null | undefined,
  values: AtendimentoFormValues,
): boolean {
  if (!condicao) return true;
  const resposta = values[condicao.fieldId];
  if (resposta === undefined) return false;
  if (Array.isArray(resposta)) return resposta.includes(condicao.value);
  return resposta === condicao.value;
}

/** Visibilidade de um campo/seção específico, dado o preenchimento atual. */
export function campoVisivel(field: AtendimentoFormField, values: AtendimentoFormValues): boolean {
  return condicaoSatisfeita(field.visibleIf, values);
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

function valorVazio(valor: string | string[] | undefined): boolean {
  return valor === undefined || (Array.isArray(valor) ? valor.length === 0 : !valor.trim());
}

/** Fase 3 — execução: rótulos dos campos obrigatórios (e visíveis) que
 *  ainda não foram respondidos. Vazio = pode concluir. */
export function obrigatoriosFaltando(
  campos: AtendimentoFormField[],
  values: AtendimentoFormValues,
): string[] {
  return campos
    .filter((f) => f.type !== "section" && f.required && campoVisivel(f, values))
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
      return { label: f.label || "(sem rótulo)", valor: Array.isArray(v) ? v.join(", ") : (v ?? "") };
    })
    .filter((r) => r.valor.trim().length > 0);
}

/** Fase 3 — execução: true se ao menos uma resposta já foi preenchida
 *  (usado para o aviso de perda de dados ao fechar a layer). */
export function hasRespostaPreenchida(values: AtendimentoFormValues): boolean {
  return Object.values(values).some((v) => !valorVazio(v));
}
