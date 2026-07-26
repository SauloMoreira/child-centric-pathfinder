// Catálogo de filtros — allowlist espelhando o backend.
// Qualquer campo/operador aqui deve existir em private.validate_filter_definition.

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "in"
  | "not_in"
  | "greater_than"
  | "greater_or_equal"
  | "less_than"
  | "less_or_equal"
  | "between"
  | "is_null"
  | "is_not_null";

export type FilterCondition = {
  field: string;
  operator: FilterOperator;
  value: unknown;
};

export type FilterDefinition = {
  version: 1;
  text: string | null;
  conditions: FilterCondition[];
};

export const EMPTY_FILTER: FilterDefinition = {
  version: 1,
  text: null,
  conditions: [],
};

export type FilterOption = {
  id: string; // chave estável usada no builder da UI
  label: string;
  group:
    | "identificacao"
    | "situacao"
    | "acolhimento"
    | "processos"
    | "prazos"
    | "familia"
    | "atualizacao"
    | "orgao";
  build: () => FilterCondition[];
  describe: string;
};

// Opções prontas — cada uma resolve para uma ou mais condições
export const FILTER_OPTIONS: FilterOption[] = [
  // Identificação
  {
    id: "crianca",
    label: "Somente crianças (até 11 anos)",
    group: "identificacao",
    build: () => [{ field: "faixa_etaria", operator: "equals", value: "crianca" }],
    describe: "Crianças",
  },
  {
    id: "adolescente",
    label: "Somente adolescentes (12+)",
    group: "identificacao",
    build: () => [{ field: "faixa_etaria", operator: "equals", value: "adolescente" }],
    describe: "Adolescentes",
  },
  {
    id: "sem_foto",
    label: "Sem foto cadastrada",
    group: "identificacao",
    build: () => [{ field: "tem_foto", operator: "equals", value: false }],
    describe: "Sem foto",
  },
  // Situação atual
  {
    id: "sit_acolh_inst",
    label: "Acolhimento institucional",
    group: "situacao",
    build: () => [
      { field: "situacao_atual", operator: "equals", value: "acolhimento_institucional" },
    ],
    describe: "Acolh. institucional",
  },
  {
    id: "sit_acolh_fam",
    label: "Acolhimento familiar",
    group: "situacao",
    build: () => [
      { field: "situacao_atual", operator: "equals", value: "acolhimento_familiar" },
    ],
    describe: "Acolh. familiar",
  },
  {
    id: "sit_guarda",
    label: "Guarda provisória",
    group: "situacao",
    build: () => [{ field: "situacao_atual", operator: "equals", value: "guarda_provisoria" }],
    describe: "Guarda provisória",
  },
  {
    id: "sit_familia_natural",
    label: "Família natural",
    group: "situacao",
    build: () => [{ field: "situacao_atual", operator: "equals", value: "familia_natural" }],
    describe: "Família natural",
  },
  // Acolhimento
  {
    id: "em_acolhimento",
    label: "Em acolhimento (qualquer tipo)",
    group: "acolhimento",
    build: () => [{ field: "acolhimento_ativo", operator: "equals", value: true }],
    describe: "Em acolhimento",
  },
  {
    id: "sem_acolhimento",
    label: "Sem acolhimento ativo",
    group: "acolhimento",
    build: () => [{ field: "acolhimento_ativo", operator: "equals", value: false }],
    describe: "Sem acolhimento",
  },
  {
    id: "acolh_30",
    label: "Acolhidos há mais de 30 dias",
    group: "acolhimento",
    build: () => [
      { field: "acolhimento_ativo", operator: "equals", value: true },
      { field: "tempo_acolhimento_dias", operator: "greater_than", value: 30 },
    ],
    describe: "+30 dias de acolhimento",
  },
  {
    id: "acolh_90",
    label: "Acolhidos há mais de 90 dias",
    group: "acolhimento",
    build: () => [
      { field: "acolhimento_ativo", operator: "equals", value: true },
      { field: "tempo_acolhimento_dias", operator: "greater_than", value: 90 },
    ],
    describe: "+90 dias de acolhimento",
  },
  {
    id: "acolh_180",
    label: "Acolhidos há mais de 180 dias",
    group: "acolhimento",
    build: () => [
      { field: "acolhimento_ativo", operator: "equals", value: true },
      { field: "tempo_acolhimento_dias", operator: "greater_than", value: 180 },
    ],
    describe: "+180 dias de acolhimento",
  },
  {
    id: "reaval_vencida",
    label: "Reavaliação vencida",
    group: "acolhimento",
    build: () => [{ field: "reavaliacao_status", operator: "equals", value: "vencida" }],
    describe: "Reavaliação vencida",
  },
  {
    id: "reaval_proxima",
    label: "Reavaliação nos próximos 30 dias",
    group: "acolhimento",
    build: () => [{ field: "reavaliacao_status", operator: "equals", value: "proxima" }],
    describe: "Reavaliação próxima",
  },
  // Processos
  {
    id: "com_processo",
    label: "Com processo ativo",
    group: "processos",
    build: () => [{ field: "tem_processo_ativo", operator: "equals", value: true }],
    describe: "Com processo ativo",
  },
  {
    id: "sem_processo",
    label: "Sem processo ativo",
    group: "processos",
    build: () => [{ field: "tem_processo_ativo", operator: "equals", value: false }],
    describe: "Sem processo",
  },
  {
    id: "prio_urgente",
    label: "Prioridade urgente ou alta",
    group: "processos",
    build: () => [{ field: "prioridade_demanda", operator: "in", value: ["urgente", "alta"] }],
    describe: "Prioridade alta",
  },
  {
    id: "extra",
    label: "Com demanda extrajudicial",
    group: "processos",
    build: () => [{ field: "tem_demanda_extrajudicial", operator: "equals", value: true }],
    describe: "Extrajudicial",
  },
  {
    id: "familiar_dpe",
    label: "Familiar assistido pela DPE-RS",
    group: "processos",
    build: () => [{ field: "familiar_dpe", operator: "equals", value: true }],
    describe: "Familiar DPE",
  },
  // Prazos e providências
  {
    id: "com_prov",
    label: "Com providência pendente",
    group: "prazos",
    build: () => [{ field: "tem_providencia_pendente", operator: "equals", value: true }],
    describe: "Providência pendente",
  },
  {
    id: "prazo_vencido",
    label: "Prazo vencido",
    group: "prazos",
    build: () => [{ field: "prazo_status", operator: "equals", value: "vencido" }],
    describe: "Prazo vencido",
  },
  {
    id: "prazo_7",
    label: "Prazo nos próximos 7 dias",
    group: "prazos",
    build: () => [{ field: "prazo_status", operator: "equals", value: "7dias" }],
    describe: "Prazo 7 dias",
  },
  {
    id: "prazo_30",
    label: "Prazo nos próximos 30 dias",
    group: "prazos",
    build: () => [{ field: "prazo_status", operator: "equals", value: "30dias" }],
    describe: "Prazo 30 dias",
  },
  // Família
  {
    id: "com_irmaos",
    label: "Com irmãos cadastrados",
    group: "familia",
    build: () => [{ field: "tem_irmaos", operator: "equals", value: true }],
    describe: "Com irmãos",
  },
  {
    id: "sem_vinculos",
    label: "Sem vínculos familiares cadastrados",
    group: "familia",
    build: () => [{ field: "tem_vinculos_familiares", operator: "equals", value: false }],
    describe: "Sem vínculos",
  },
  // Atualização
  {
    id: "atualizado_hoje",
    label: "Atualizado hoje",
    group: "atualizacao",
    build: () => [{ field: "ultima_atualizacao_bucket", operator: "equals", value: "hoje" }],
    describe: "Atualizado hoje",
  },
  {
    id: "sem_atualizacao_30",
    label: "Sem atualização há mais de 30 dias",
    group: "atualizacao",
    build: () => [{ field: "ultima_atualizacao_bucket", operator: "equals", value: "sem_30dias" }],
    describe: "Parado +30 dias",
  },
  {
    id: "sem_atualizacao_90",
    label: "Sem atualização há mais de 90 dias",
    group: "atualizacao",
    build: () => [{ field: "ultima_atualizacao_bucket", operator: "equals", value: "sem_90dias" }],
    describe: "Parado +90 dias",
  },
];

export const FILTER_GROUP_LABELS: Record<FilterOption["group"], string> = {
  identificacao: "Identificação",
  situacao: "Situação atual",
  acolhimento: "Acolhimento",
  processos: "Processos e demandas",
  prazos: "Prazos e providências",
  familia: "Família",
  atualizacao: "Atualização",
  orgao: "Órgão",
};

/**
 * Combina condições evitando duplicatas exatas.
 */
export function mergeConditions(
  existing: FilterCondition[],
  added: FilterCondition[],
): FilterCondition[] {
  const key = (c: FilterCondition) =>
    `${c.field}::${c.operator}::${JSON.stringify(c.value)}`;
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const c of added) {
    const k = key(c);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

/**
 * Dado o array de conditions, encontra as opções da UI que ele representa.
 * Uma opção é "ativa" quando TODAS as suas condições estão presentes.
 */
export function detectActiveOptions(
  conditions: FilterCondition[],
): string[] {
  const encoded = new Set(
    conditions.map(
      (c) => `${c.field}::${c.operator}::${JSON.stringify(c.value)}`,
    ),
  );
  return FILTER_OPTIONS.filter((opt) =>
    opt.build().every(
      (c) => encoded.has(`${c.field}::${c.operator}::${JSON.stringify(c.value)}`),
    ),
  ).map((o) => o.id);
}

export function buildFromOptionIds(ids: string[]): FilterCondition[] {
  let acc: FilterCondition[] = [];
  for (const id of ids) {
    const opt = FILTER_OPTIONS.find((o) => o.id === id);
    if (opt) acc = mergeConditions(acc, opt.build());
  }
  return acc;
}

export function describeActive(conditions: FilterCondition[]): string[] {
  const ids = detectActiveOptions(conditions);
  return ids
    .map((id) => FILTER_OPTIONS.find((o) => o.id === id)?.describe)
    .filter((x): x is string => !!x);
}
