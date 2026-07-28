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
  updated_at: string;
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

export type CotaDetalhe = {
  id: string;
  titulo: string;
  bodyJson: unknown;
  bodyText: string;
  orientacao: string | null;
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
}): Promise<{ item_id: string; version_id: string }> {
  const { data, error } = await supabase.rpc("criar_cota", {
    p_titulo: params.titulo,
    p_body_json: params.bodyJson as never,
    p_body_text: params.bodyText,
    p_category_ids: (params.categoryIds ?? null) as never,
    p_orientacao: params.orientacao ?? null,
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

// -------- BIBLIOTECA --------
export async function listarBiblioteca(params: {
  kind?: ContentKind;
  categoria_id?: string;
  query?: string;
  apenas_meus?: boolean;
  limit?: number;
  offset?: number;
}): Promise<BibliotecaItem[]> {
  const { data, error } = await supabase.rpc("listar_biblioteca", {
    p_kind: params.kind ?? undefined,
    p_category_id: params.categoria_id ?? undefined,
    p_query: params.query ?? undefined,
    p_apenas_meus: params.apenas_meus ?? false,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  } as never);
  if (error) throw error;
  return (data ?? []) as BibliotecaItem[];
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
}): Promise<{ column_id: string; workspace_version: number }> {
  const { data, error } = await supabase.rpc("criar_coluna_workspace", {
    p_workspace_id: params.workspaceId,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
    p_nome: params.nome,
    p_descricao: params.descricao ?? null,
    p_cor_token: params.corToken ?? "neutral",
    p_cor_custom: params.corCustom ?? null,
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
}): Promise<number> {
  const { data, error } = await supabase.rpc("atualizar_coluna_workspace", {
    p_column_id: params.columnId,
    p_expected_workspace_version: params.expectedWorkspaceVersion,
    p_idempotency_key: uuid(),
    p_nome: params.nome,
    p_descricao: params.descricao ?? null,
    p_cor_token: params.corToken ?? "neutral",
    p_cor_custom: params.corCustom ?? null,
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
