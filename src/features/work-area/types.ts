/**
 * Domínio de Painéis da Área de Trabalho.
 * DTOs frontend camelCase, desacoplados dos nomes físicos do banco (workspace/nome/order_position).
 */

export type PanelAccessMode =
  | "owner"
  | "team_readonly"
  | "technical_readonly"
  | "technical_admin"
  | "none";

export type WorkspaceAccess = {
  canView: boolean;
  canEditWorkspace: boolean;
  canManagePanels: boolean;
  canManageColumns: boolean;
  canMoveCards: boolean;
  canAddItems: boolean;
  accessMode: PanelAccessMode;
};

export type PanelSummary = {
  id: string;
  defenderUserId: string;
  name: string;
  icon: string | null;
  position: number;
  optimisticVersion: number;
  archivedAt: string | null;
};

export type WorkArea = {
  defenderUserId: string;
  activePanelId: string | null;
  panelCount: number;
  panels: PanelSummary[];
  access: WorkspaceAccess;
};

export type PanelCardKind = "atendimento" | "cota";
export type PanelCardPlacement = "owned" | "imported";
export type PanelCardStatus = "rascunho" | "publicado" | "arquivado";

export type PanelColumn = {
  id: string;
  panelId: string;
  name: string;
  description: string | null;
  colorToken: string;
  customColor: string | null;
  position: number;
};

export type PanelCard = {
  cardId: string;
  panelId: string;
  columnId: string;
  itemId: string;
  kind: PanelCardKind;
  placement: PanelCardPlacement;
  title: string;
  description: string | null;
  categoryNames: string[];
  ownerDisplayName: string;
  status: PanelCardStatus;
  publishedVersionNumber: number | null;
  updatedAt: string;
  archivedByAuthor: boolean;
  canOpen: boolean;
  canEdit: boolean;
  canUse: boolean;
  position: number;
};

// ---------- Erros de domínio ----------
export const PANEL_ERROR_CODES = [
  "PANEL_NAME_ALREADY_EXISTS",
  "PANEL_NOT_EMPTY",
  "LAST_PANEL_CANNOT_BE_DELETED",
  "PANEL_ORDER_INVALID",
  "CONCURRENT_CHANGE",
  "FORBIDDEN",
  "PROFILE_INACTIVE",
  "PANEL_NOT_FOUND",
  "WORK_AREA_NOT_INITIALIZED",
  "DUPLICATE_PANEL_ITEM",
  "UNKNOWN",
] as const;

export type PanelErrorCode = (typeof PANEL_ERROR_CODES)[number];

export type RpcMutationResult<T> =
  | { ok: true; code: "OK"; data: T }
  | { ok: false; code: PanelErrorCode; message: string; correlationId?: string };

// ---------- DnD ----------
export type WorkAreaDraggableType = "panel" | "column" | "card";

export type WorkAreaDragData =
  | { type: "panel"; panelId: string }
  | { type: "column"; panelId: string; columnId: string }
  | { type: "card"; panelId: string; columnId: string; cardId: string };

// ---------- Constantes de UI ----------
// Ajuste doc (AJUSTE 13) — não há mais limite de Painéis por Defensor.
export const PANEL_NAME_MIN = 1;
export const PANEL_NAME_MAX = 60;

/**
 * Allowlist de ícones lucide utilizados para Painéis. Mantida em sincronia
 * com a validação executada no backend (`private.validate_panel_icon`).
 */
export const PANEL_ICON_ALLOWLIST = [
  "layers",
  "folder",
  "briefcase",
  "book",
  "gavel",
  "scale",
  "users",
  "user",
  "clipboard",
  "flag",
  "star",
  "bookmark",
  "target",
  "shield",
  "inbox",
  "archive",
] as const;

export type PanelIcon = (typeof PANEL_ICON_ALLOWLIST)[number];
