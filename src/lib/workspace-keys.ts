/**
 * Query keys da Área de Trabalho — hierárquicas e sem dependência de órgão.
 */

export const workAreaKeys = {
  all: ["work-area"] as const,

  byDefender: (defenderUserId: string) =>
    [...workAreaKeys.all, "defender", defenderUserId] as const,

  panels: (defenderUserId: string) =>
    [...workAreaKeys.byDefender(defenderUserId), "panels"] as const,

  panel: (defenderUserId: string, panelId: string) =>
    [...workAreaKeys.byDefender(defenderUserId), "panel", panelId] as const,

  columns: (defenderUserId: string, panelId: string) =>
    [...workAreaKeys.panel(defenderUserId, panelId), "columns"] as const,

  cards: (defenderUserId: string, panelId: string, columnId: string) =>
    [...workAreaKeys.panel(defenderUserId, panelId), "column", columnId, "cards"] as const,
};
