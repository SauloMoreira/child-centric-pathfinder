import type { PanelSummary, WorkArea, WorkspaceAccess, PanelAccessMode } from "./types";

// Aceita rows tanto do RPC de leitura (snake_case) quanto do ensure (camelCase).
type PanelRowRaw = {
  id: string;
  nome?: string;
  name?: string;
  icone?: string | null;
  icon?: string | null;
  position?: number;
  order_position?: number;
  orderPosition?: number;
  optimistic_version?: number | string;
  optimisticVersion?: number | string;
  archived_at?: string | null;
  archivedAt?: string | null;
};

type WorkAreaRawResponse = {
  defenderUserId?: string;
  defensor_user_id?: string;
  activePanelId?: string | null;
  panelCount?: number;
  panels: PanelRowRaw[];
  access?: { accessMode?: PanelAccessMode };
};

export function mapPanelRow(defenderUserId: string, row: PanelRowRaw): PanelSummary {
  return {
    id: row.id,
    defenderUserId,
    name: row.name ?? row.nome ?? "",
    icon: row.icon ?? row.icone ?? null,
    position: Number(row.position ?? row.orderPosition ?? row.order_position ?? 0),
    optimisticVersion: Number(row.optimisticVersion ?? row.optimistic_version ?? 1),
    archivedAt: row.archivedAt ?? row.archived_at ?? null,
  };
}

function accessFromMode(mode: PanelAccessMode): WorkspaceAccess {
  const isOwner = mode === "owner";
  const isTechnicalAdmin = mode === "technical_admin";
  const canEdit = isOwner || isTechnicalAdmin;
  const isReadonly = mode === "team_readonly" || mode === "technical_readonly";
  const canView = canEdit || isReadonly;
  return {
    canView,
    canEditWorkspace: canEdit,
    canManagePanels: canEdit,
    canManageColumns: canEdit,
    canMoveCards: canEdit,
    canAddItems: canEdit,
    accessMode: mode,
  };
}

export function mapWorkArea(res: WorkAreaRawResponse): WorkArea {
  const defenderUserId = res.defenderUserId ?? res.defensor_user_id ?? "";
  const panels = (res.panels ?? [])
    .map((p) => mapPanelRow(defenderUserId, p))
    .sort((a, b) => a.position - b.position);
  return {
    defenderUserId,
    activePanelId: res.activePanelId ?? panels[0]?.id ?? null,
    panelCount: res.panelCount ?? panels.length,
    panels,
    access: accessFromMode(res.access?.accessMode ?? "none"),
  };
}
