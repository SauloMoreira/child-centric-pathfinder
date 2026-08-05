import type { PanelSummary, WorkArea, WorkspaceAccess, PanelAccessMode, PanelRole } from "./types";

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
  is_public?: boolean;
  isPublic?: boolean;
  descricao?: string | null;
  description?: string | null;
  panel_role?: PanelRole;
  role?: PanelRole;
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
    isPublic: row.isPublic ?? row.is_public ?? false,
    description: row.description ?? row.descricao ?? null,
    role: row.role ?? row.panel_role ?? "owner",
  };
}

function accessFromMode(mode: PanelAccessMode): WorkspaceAccess {
  const isOwner = mode === "owner";
  const isTechnicalAdmin = mode === "technical_admin";
  const isCollaborator = mode === "collaborator";
  const canEdit = isOwner || isTechnicalAdmin || isCollaborator;
  const isReadonly = mode === "team_readonly" || mode === "technical_readonly" || mode === "visitor";
  const canView = canEdit || isReadonly;
  return {
    canView,
    canEditWorkspace: canEdit,
    canManagePanels: isOwner || isTechnicalAdmin,
    canManageColumns: canEdit,
    canMoveCards: canEdit,
    canAddItems: canEdit,
    accessMode: mode,
    canDeleteWorkspace: isOwner || isTechnicalAdmin,
  };
}

export function mapWorkArea(res: WorkAreaRawResponse): WorkArea {
  const defenderUserId = res.defenderUserId ?? res.defensor_user_id ?? "";
  // A ordem já vem correta do backend (Painéis próprios primeiro, depois
  // importados/colaborados por data de vínculo) — não reordenar no cliente,
  // pois `position` de um Painel importado pertence à lista de outro Defensor.
  const panels = (res.panels ?? []).map((p) => mapPanelRow(defenderUserId, p));
  return {
    defenderUserId,
    activePanelId: res.activePanelId ?? panels[0]?.id ?? null,
    panelCount: res.panelCount ?? panels.length,
    panels,
    access: accessFromMode(res.access?.accessMode ?? "none"),
  };
}
