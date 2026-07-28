import { supabase } from "@/integrations/supabase/client";
import type { PanelSummary, WorkArea } from "./types";
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
  } as never);
  if (error) throw error;
  return data as { panelId: string; optimisticVersion: number };
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

// re-export mapping for consumers de teste/hook
export { mapPanelRow };
export type { PanelSummary };
