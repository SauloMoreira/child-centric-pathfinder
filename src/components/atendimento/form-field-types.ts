// Tipos de campo suportados pelo construtor de formulário de Atendimento
// (Fase 1 — sem lógica condicional/branching, isso fica para uma fase
// seguinte). Compartilhado entre o builder (criação/edição) e o renderer
// (preenchimento/execução).
import type { AtendimentoFieldType, AtendimentoFormField } from "@/lib/reintegra-api";

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
};

export function fieldHasOptions(type: AtendimentoFieldType): boolean {
  return FIELD_TYPE_META[type].hasOptions;
}

export function novoCampo(type: AtendimentoFieldType = "text_short"): AtendimentoFormField {
  return {
    id: crypto.randomUUID(),
    type,
    label: "",
    required: false,
    placeholder: null,
    options: fieldHasOptions(type) ? ["Opção 1"] : null,
  };
}

/** Valores de preenchimento em memória (nunca persistidos). */
export type AtendimentoFormValues = Record<string, string | string[]>;

export function valorInicial(field: AtendimentoFormField): string | string[] {
  return field.type === "checkbox" ? [] : "";
}
