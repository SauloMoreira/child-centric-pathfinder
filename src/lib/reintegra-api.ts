import { supabase } from "@/integrations/supabase/client";

/** Tipos leves para reduzir dependência dos types gerados. */
export type ContentKind = "atendimento" | "cota";
export type ContentStatus = "rascunho" | "publicado" | "arquivado";
export type ContentVisibility = "privado" | "orgao" | "institucional";

export type BibliotecaItem = {
  id: string;
  kind: ContentKind;
  titulo: string;
  categoria_id: string | null;
  categoria_nome: string | null;
  visibility: ContentVisibility;
  status: ContentStatus;
  owner_user_id: string;
  updated_at: string;
};

export type BibliotecaCategoria = {
  id: string;
  nome: string;
  kind: ContentKind;
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
  owner_user_id: string;
  current_version_id: string | null;
  titulo: string;
  body_json: unknown;
  form_schema: unknown;
  version_number: number;
  updated_at: string;
};

export type WorkspaceResumo = {
  id: string;
  nome: string;
  icone: string | null;
  order_position: number;
  total_colunas: number;
  total_cards: number;
  updated_at: string;
};

export type ColunaResumo = {
  id: string;
  nome: string;
  cor: string | null;
  order_position: number;
  total_cards: number;
};

export type CardResumo = {
  id: string;
  item_id: string;
  kind: ContentKind;
  titulo: string;
  categoria: string | null;
  status: ContentStatus;
  note: string | null;
  order_position: number;
  updated_at: string;
};

function throwIf<T>(res: { data: T | null; error: unknown }) {
  if (res.error) throw res.error;
  return res.data as T;
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

export async function listarCategoriasBiblioteca(kind?: ContentKind): Promise<BibliotecaCategoria[]> {
  const { data, error } = await supabase.rpc("listar_categorias_biblioteca", {
    p_kind: kind ?? undefined,
  } as never);
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
  titulo: string;
  body_json: unknown;
  body_text: string;
  form_schema?: unknown;
}): Promise<void> {
  const { error } = await supabase.rpc("atualizar_rascunho", {
    p_item_id: params.item_id,
    p_title: params.titulo,
    p_body_json: params.body_json as never,
    p_body_text: params.body_text,
    p_form_schema: (params.form_schema ?? null) as never,
  } as never);
  if (error) throw error;
}

export async function publicarVersao(params: {
  item_id: string;
  visibility: ContentVisibility;
}): Promise<void> {
  const { error } = await supabase.rpc("publicar_versao", {
    p_item_id: params.item_id,
    p_visibility: params.visibility,
  } as never);
  if (error) throw error;
}

export async function arquivarItem(item_id: string): Promise<void> {
  const { error } = await supabase.rpc("arquivar_item", { p_item_id: item_id } as never);
  if (error) throw error;
}

// -------- ÁREA DE TRABALHO --------
export async function listarWorkspacesDefensor(defensor_user_id: string, orgao_id: string): Promise<WorkspaceResumo[]> {
  const { data, error } = await supabase.rpc("listar_workspaces_defensor", {
    p_defensor_user_id: defensor_user_id,
    p_orgao_id: orgao_id,
  } as never);
  if (error) throw error;
  return (data ?? []) as WorkspaceResumo[];
}

export async function criarWorkspaceDefensor(params: {
  defensor_user_id: string;
  orgao_id: string;
  nome: string;
  icone?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("criar_workspace_defensor", {
    p_defensor_user_id: params.defensor_user_id,
    p_orgao_id: params.orgao_id,
    p_nome: params.nome,
    p_icone: params.icone ?? null,
  } as never);
  if (error) throw error;
  return data as string;
}

export async function renomearWorkspaceDefensor(id: string, nome: string, icone?: string): Promise<void> {
  const { error } = await supabase.rpc("renomear_workspace_defensor", {
    p_workspace_id: id,
    p_nome: nome,
    p_icone: icone ?? null,
  } as never);
  if (error) throw error;
}

export async function excluirWorkspaceDefensor(id: string): Promise<void> {
  const { error } = await supabase.rpc("excluir_workspace_defensor", { p_workspace_id: id } as never);
  if (error) throw error;
}

export async function listarColunasWorkspace(workspace_id: string): Promise<ColunaResumo[]> {
  const { data, error } = await supabase.rpc("listar_colunas_workspace", {
    p_workspace_id: workspace_id,
  } as never);
  if (error) throw error;
  return (data ?? []) as ColunaResumo[];
}

export async function criarColunaWorkspace(workspace_id: string, nome: string, cor?: string): Promise<string> {
  const { data, error } = await supabase.rpc("criar_coluna_workspace", {
    p_workspace_id: workspace_id,
    p_nome: nome,
    p_cor: cor ?? null,
  } as never);
  if (error) throw error;
  return data as string;
}

export async function atualizarColunaWorkspace(column_id: string, nome: string, cor?: string): Promise<void> {
  const { error } = await supabase.rpc("atualizar_coluna_workspace", {
    p_column_id: column_id,
    p_nome: nome,
    p_cor: cor ?? null,
  } as never);
  if (error) throw error;
}

export async function excluirColunaWorkspace(column_id: string): Promise<void> {
  const { error } = await supabase.rpc("excluir_coluna_workspace", { p_column_id: column_id } as never);
  if (error) throw error;
}

export async function listarCardsColuna(column_id: string): Promise<CardResumo[]> {
  const { data, error } = await supabase.rpc("listar_cards_coluna", { p_column_id: column_id } as never);
  if (error) throw error;
  return (data ?? []) as CardResumo[];
}

export async function adicionarCardWorkspace(column_id: string, item_id: string, note?: string): Promise<string> {
  const { data, error } = await supabase.rpc("adicionar_card_workspace", {
    p_column_id: column_id,
    p_item_id: item_id,
    p_note: note ?? null,
  } as never);
  if (error) throw error;
  return data as string;
}

export async function atualizarCardWorkspace(card_id: string, note: string | null): Promise<void> {
  const { error } = await supabase.rpc("atualizar_card_workspace", {
    p_card_id: card_id,
    p_note: note,
  } as never);
  if (error) throw error;
}

export async function removerCardWorkspace(card_id: string): Promise<void> {
  const { error } = await supabase.rpc("remover_card_workspace", { p_card_id: card_id } as never);
  if (error) throw error;
}

export async function moverCardWorkspace(card_id: string, target_column_id: string, new_position: number): Promise<void> {
  const { error } = await supabase.rpc("mover_card_workspace", {
    p_card_id: card_id,
    p_target_column_id: target_column_id,
    p_new_position: new_position,
  } as never);
  if (error) throw error;
}
