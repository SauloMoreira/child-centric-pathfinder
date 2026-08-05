import { supabase } from "@/integrations/supabase/client";
import type { PanelSummary, WorkArea, PanelPanorama, PublicPanelSearchResult } from "./types";
import { mapPanelRow, mapWorkArea } from "./mapping";

function uuid(): string {
  return crypto.randomUUID();
}

// ---------- ensure / list ----------

export async function ensureWorkArea(input: {
  defenderUserId: string;
  idempotencyKey?: string;
}): Promise<WorkArea> {
  const { data, error } = await supabase.rpc("ensure_defensor_work_area", {
    p_defensor_user_id: input.defenderUserId,
    p_idempotency_key: input.idempotencyKey ?? uuid(),
  } as never);
  if (error) throw error;
  return mapWorkArea(data as never);
}

export class WorkAreaNotInitializedError extends Error {
  code = "WORK_AREA_NOT_INITIALIZED" as const;
  accessMode: string | null;
  constructor(accessMode: string | null) {
    super("WORK_AREA_NOT_INITIALIZED");
    this.accessMode = accessMode;
  }
}

export class WorkAreaForbiddenError extends Error {
  code = "FORBIDDEN" as const;
  constructor() {
    super("FORBIDDEN");
  }
}

/**
 * Leitura pura da Área de Trabalho. Não cria nada.
 * Retorna `WorkArea` para caller autorizado com Painéis, ou lança
 * `WorkAreaNotInitializedError` / `WorkAreaForbiddenError`.
 */
export async function readWorkArea(input: { defenderUserId: string }): Promise<WorkArea> {
  const { data, error } = await supabase.rpc(
    "listar_area_trabalho_defensor" as never,
    { p_defensor_user_id: input.defenderUserId } as never,
  );
  if (error) throw error;
  const res = data as {
    ok: boolean;
    code?: string;
    access?: { accessMode?: string };
    defenderUserId?: string;
    panelCount?: number;
    activePanelId?: string | null;
    panels?: unknown[];
  };
  if (res?.ok === false) {
    if (res.code === "WORK_AREA_NOT_INITIALIZED") {
      throw new WorkAreaNotInitializedError(res.access?.accessMode ?? null);
    }
    throw new WorkAreaForbiddenError();
  }
  return mapWorkArea(data as never);
}

// ---------- create ----------

export type CreatePanelInput = {
  defenderUserId: string;
  name: string;
  icon?: string | null;
  expectedCount: number;
  idempotencyKey: string;
  description?: string | null;
  isPublic?: boolean;
};

export type CreatePanelResponse = {
  panelId: string;
  initialColumnId: string | null;
  orderPosition: number;
  optimisticVersion: number;
};

export async function createPanel(input: CreatePanelInput): Promise<CreatePanelResponse> {
  const { data, error } = await supabase.rpc("criar_painel", {
    p_defensor_user_id: input.defenderUserId,
    p_nome: input.name,
    p_icone: input.icon ?? null,
    p_expected_count: input.expectedCount,
    p_idempotency_key: input.idempotencyKey,
    p_descricao: input.description ?? null,
    p_is_public: input.isPublic ?? false,
  } as never);
  if (error) throw error;
  return data as CreatePanelResponse;
}

// ---------- rename ----------

export type RenamePanelInput = {
  panelId: string;
  name: string;
  icon?: string | null;
  expectedVersion: number;
  idempotencyKey: string;
  description?: string | null;
};

export async function renamePanel(input: RenamePanelInput): Promise<{
  panelId: string;
  optimisticVersion: number;
}> {
  const { data, error } = await supabase.rpc("renomear_painel", {
    p_panel_id: input.panelId,
    p_nome: input.name,
    p_icone: input.icon ?? null,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_descricao: input.description ?? null,
  } as never);
  if (error) throw error;
  return data as { panelId: string; optimisticVersion: number };
}

// ---------- visibilidade (público/privado) ----------

export type SetPanelVisibilityInput = {
  panelId: string;
  isPublic: boolean;
  expectedVersion: number;
  idempotencyKey?: string;
};

export async function setPanelVisibility(input: SetPanelVisibilityInput): Promise<{
  panelId: string;
  optimisticVersion: number;
  isPublic: boolean;
}> {
  const { data, error } = await supabase.rpc("definir_visibilidade_painel", {
    p_panel_id: input.panelId,
    p_is_public: input.isPublic,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey ?? uuid(),
  } as never);
  if (error) throw error;
  return data as { panelId: string; optimisticVersion: number; isPublic: boolean };
}

// ---------- reorder ----------

export type ReorderPanelsInput = {
  defenderUserId: string;
  items: Array<{ panelId: string; expectedVersion: number }>;
  idempotencyKey: string;
};

export async function reorderPanels(input: ReorderPanelsInput): Promise<{
  ok: boolean;
  count: number;
}> {
  const payload = input.items.map((it) => ({
    panelId: it.panelId,
    expectedVersion: it.expectedVersion,
  }));
  const { data, error } = await supabase.rpc("reordenar_paineis_defensor", {
    p_defensor_user_id: input.defenderUserId,
    p_items: payload as never,
    p_idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw error;
  return data as { ok: boolean; count: number };
}

// ---------- archive ----------

export type ArchivePanelInput = {
  panelId: string;
  expectedVersion: number;
  idempotencyKey: string;
};

export async function archivePanel(input: ArchivePanelInput): Promise<{
  panelId: string;
  nextActivePanelId: string | null;
}> {
  const { data, error } = await supabase.rpc("arquivar_painel", {
    p_panel_id: input.panelId,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw error;
  return data as { panelId: string; nextActivePanelId: string | null };
}

// ---------- Compartilhamento de Painéis ----------

export async function importPanel(input: { panelId: string; idempotencyKey?: string }): Promise<void> {
  const { error } = await supabase.rpc("importar_painel", {
    p_panel_id: input.panelId,
    p_idempotency_key: input.idempotencyKey ?? uuid(),
  } as never);
  if (error) throw error;
}

export async function removeImportedPanel(input: {
  panelId: string;
  idempotencyKey?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("remover_painel_importado", {
    p_panel_id: input.panelId,
    p_idempotency_key: input.idempotencyKey ?? uuid(),
  } as never);
  if (error) throw error;
}

export async function setPanelCollaborator(input: {
  panelId: string;
  memberUserId: string;
  idempotencyKey?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("definir_colaborador_painel", {
    p_panel_id: input.panelId,
    p_member_user_id: input.memberUserId,
    p_idempotency_key: input.idempotencyKey ?? uuid(),
  } as never);
  if (error) throw error;
}

export async function removePanelCollaborator(input: {
  panelId: string;
  memberUserId: string;
  idempotencyKey?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("remover_colaborador_painel", {
    p_panel_id: input.panelId,
    p_member_user_id: input.memberUserId,
    p_idempotency_key: input.idempotencyKey ?? uuid(),
  } as never);
  if (error) throw error;
}

export async function leavePanelCollaboration(input: {
  panelId: string;
  idempotencyKey?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("sair_de_colaborador_painel", {
    p_panel_id: input.panelId,
    p_idempotency_key: input.idempotencyKey ?? uuid(),
  } as never);
  if (error) throw error;
}

export async function getPanelPanorama(panelId: string): Promise<PanelPanorama> {
  const { data, error } = await supabase.rpc("obter_panorama_painel", {
    p_panel_id: panelId,
  } as never);
  if (error) throw error;
  const raw = data as {
    panelId: string;
    nome: string;
    descricao: string | null;
    isPublic: boolean;
    gestor: { userId: string; nome: string } | null;
    colaboradores: Array<{ userId: string; nome: string; since: string }>;
    visitantes: Array<{ userId: string; nome: string; since: string }>;
    callerAccessMode: PanelPanorama["callerAccessMode"];
    canManageCollaborators: boolean;
  };
  return {
    panelId: raw.panelId,
    name: raw.nome,
    description: raw.descricao,
    isPublic: raw.isPublic,
    manager: raw.gestor ? { userId: raw.gestor.userId, name: raw.gestor.nome, since: "" } : null,
    collaborators: (raw.colaboradores ?? []).map((c) => ({
      userId: c.userId,
      name: c.nome,
      since: c.since,
    })),
    visitors: (raw.visitantes ?? []).map((v) => ({
      userId: v.userId,
      name: v.nome,
      since: v.since,
    })),
    callerAccessMode: raw.callerAccessMode,
    canManageCollaborators: raw.canManageCollaborators,
  };
}

export type CollaboratorCandidate = {
  userId: string;
  displayName: string;
  email: string;
  currentRole: "colaborador" | "visitante" | null;
};

export async function searchCollaboratorCandidates(input: {
  panelId: string;
  query: string;
}): Promise<CollaboratorCandidate[]> {
  const { data, error } = await supabase.rpc("buscar_usuarios_para_colaborador", {
    p_panel_id: input.panelId,
    p_termo: input.query,
  } as never);
  if (error) throw error;
  const res = data as { ok: true; items: CollaboratorCandidate[] };
  return res.items ?? [];
}

export async function searchPublicPanels(input: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<PublicPanelSearchResult[]> {
  const { data, error } = await supabase.rpc("buscar_paineis_publicos", {
    p_query: input.query ?? null,
    p_limit: input.limit ?? 30,
    p_offset: input.offset ?? 0,
  } as never);
  if (error) throw error;
  const raw = (data as Array<{
    panelId: string;
    nome: string;
    icone: string | null;
    descricao: string | null;
    ownerUserId: string;
    ownerDisplayName: string;
    createdAt: string;
    memberCount: number;
    isOwn: boolean;
    alreadyImported: boolean;
  }>) ?? [];
  return raw.map((r) => ({
    panelId: r.panelId,
    name: r.nome,
    icon: r.icone,
    description: r.descricao,
    ownerUserId: r.ownerUserId,
    ownerDisplayName: r.ownerDisplayName,
    createdAt: r.createdAt,
    memberCount: r.memberCount,
    isOwn: r.isOwn,
    alreadyImported: r.alreadyImported,
  }));
}

// re-export mapping for consumers de teste/hook
export { mapPanelRow };
export type { PanelSummary };
