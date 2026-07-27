import type {
  PanelSummary,
  WorkArea,
  WorkspaceAccess,
  PanelAccessMode,
} from "./types";

type PanelRow = {
  id: string;
  nome: string;
  icone: string | null;
  orderPosition: number;
  optimisticVersion: number;
  updatedAt: string;
  archivedAt?: string | null;
};

type EnsureWorkAreaResponse = {
  defenderUserId: string;
  activePanelId: string | null;
  panelCount: number;
  panels: PanelRow[];
  access: { accessMode: PanelAccessMode };
};

export function mapPanelRow(defenderUserId: string, row: PanelRow): PanelSummary {
  return {
    id: row.id,
    defenderUserId,
    name: row.nome,
    icon: row.icone,
    position: row.orderPosition,
    optimisticVersion: Number(row.optimisticVersion ?? 1),
    archivedAt: row.archivedAt ?? null,
  };
}

function accessFromMode(mode: PanelAccessMode): WorkspaceAccess {
  const isOwner = mode === "owner";
  const isReadonly =
    mode === "team_readonly" || mode === "technical_readonly";
  const canView = isOwner || isReadonly;
  return {
    canView,
    canEditWorkspace: isOwner,
    canManagePanels: isOwner,
    canManageColumns: isOwner,
    canMoveCards: isOwner,
    canAddItems: isOwner,
    accessMode: mode,
  };
}

export function mapWorkArea(res: EnsureWorkAreaResponse): WorkArea {
  const panels = (res.panels ?? [])
    .map((p) => mapPanelRow(res.defenderUserId, p))
    .sort((a, b) => a.position - b.position);
  return {
    defenderUserId: res.defenderUserId,
    activePanelId: res.activePanelId ?? panels[0]?.id ?? null,
    panelCount: res.panelCount ?? panels.length,
    panels,
    access: accessFromMode(res.access?.accessMode ?? "none"),
  };
}
