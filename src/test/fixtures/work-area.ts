import type {
  PanelAccessMode,
  PanelCard,
  PanelColumn,
  PanelSummary,
  WorkArea,
  WorkspaceAccess,
} from "@/features/work-area/types";

// UUIDs sintéticos, prefixo "0000" para facilitar rastreio.
export const SYN_DEFENDER_A = "00000000-aaaa-4000-8000-000000000001";
export const SYN_DEFENDER_B = "00000000-aaaa-4000-8000-000000000002";
export const SYN_PANEL_1 = "00000000-1111-4000-8000-000000000001";
export const SYN_PANEL_2 = "00000000-1111-4000-8000-000000000002";
export const SYN_PANEL_3 = "00000000-1111-4000-8000-000000000003";
export const SYN_COLUMN_1 = "00000000-2222-4000-8000-000000000001";
export const SYN_COLUMN_2 = "00000000-2222-4000-8000-000000000002";
export const SYN_CARD_1 = "00000000-3333-4000-8000-000000000001";
export const SYN_ITEM_1 = "00000000-4444-4000-8000-000000000001";

let panelCounter = 0;

export function createPanelFixture(overrides: Partial<PanelSummary> = {}): PanelSummary {
  panelCounter += 1;
  return {
    id: overrides.id ?? `00000000-1111-4000-8000-${String(panelCounter).padStart(12, "0")}`,
    defenderUserId: overrides.defenderUserId ?? SYN_DEFENDER_A,
    name: overrides.name ?? `Painel ${panelCounter}`,
    icon: overrides.icon ?? null,
    position: overrides.position ?? panelCounter - 1,
    optimisticVersion: overrides.optimisticVersion ?? 1,
    archivedAt: overrides.archivedAt ?? null,
    isPublic: overrides.isPublic ?? false,
    description: overrides.description ?? null,
    role: overrides.role ?? "owner",
  };
}

export function createAccessFixture(mode: PanelAccessMode = "owner"): WorkspaceAccess {
  const isOwner = mode === "owner";
  const isTechnicalAdmin = mode === "technical_admin";
  const isCollaborator = mode === "collaborator";
  const canEdit = isOwner || isTechnicalAdmin || isCollaborator;
  const isReadonly = mode === "team_readonly" || mode === "technical_readonly" || mode === "visitor";
  return {
    accessMode: mode,
    canView: canEdit || isReadonly,
    canEditWorkspace: canEdit,
    canManagePanels: isOwner || isTechnicalAdmin,
    canManageColumns: canEdit,
    canMoveCards: canEdit,
    canAddItems: canEdit,
    canDeleteWorkspace: isOwner || isTechnicalAdmin,
  };
}

export function createWorkAreaFixture(overrides: Partial<WorkArea> = {}): WorkArea {
  const defenderUserId = overrides.defenderUserId ?? SYN_DEFENDER_A;
  const panels = overrides.panels ?? [
    createPanelFixture({ id: SYN_PANEL_1, defenderUserId, position: 0, name: "Painel 1" }),
    createPanelFixture({ id: SYN_PANEL_2, defenderUserId, position: 1, name: "Painel 2" }),
  ];
  return {
    defenderUserId,
    panels,
    activePanelId: overrides.activePanelId ?? panels[0]?.id ?? null,
    panelCount: overrides.panelCount ?? panels.length,
    access: overrides.access ?? createAccessFixture("owner"),
  };
}

export function createColumnFixture(overrides: Partial<PanelColumn> = {}): PanelColumn {
  return {
    id: overrides.id ?? SYN_COLUMN_1,
    panelId: overrides.panelId ?? SYN_PANEL_1,
    name: overrides.name ?? "Entrada",
    description: overrides.description ?? null,
    colorToken: overrides.colorToken ?? "neutral",
    customColor: overrides.customColor ?? null,
    position: overrides.position ?? 0,
  };
}

export function createCardFixture(overrides: Partial<PanelCard> = {}): PanelCard {
  return {
    cardId: overrides.cardId ?? SYN_CARD_1,
    panelId: overrides.panelId ?? SYN_PANEL_1,
    columnId: overrides.columnId ?? SYN_COLUMN_1,
    itemId: overrides.itemId ?? SYN_ITEM_1,
    kind: overrides.kind ?? "atendimento",
    placement: overrides.placement ?? "owned",
    title: overrides.title ?? "Card sintético",
    description: overrides.description ?? null,
    categoryNames: overrides.categoryNames ?? [],
    ownerDisplayName: overrides.ownerDisplayName ?? "Autor Sintético",
    status: overrides.status ?? "publicado",
    publishedVersionNumber: overrides.publishedVersionNumber ?? 1,
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    archivedByAuthor: overrides.archivedByAuthor ?? false,
    canOpen: overrides.canOpen ?? true,
    canEdit: overrides.canEdit ?? true,
    canUse: overrides.canUse ?? true,
    position: overrides.position ?? 0,
  };
}
