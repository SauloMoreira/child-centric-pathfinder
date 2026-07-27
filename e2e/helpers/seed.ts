/**
 * Constantes dos UUIDs sintéticos do seed E2E — devem ficar em sincronia
 * com scripts/e2e/seed-work-area.sql.
 */
export const E2E = {
  orgao: "e2e00001-0000-4000-8000-000000000001",
  panelPrincipal: "e2e00002-0000-4000-8000-000000000001",
  panelUrgencias: "e2e00002-0000-4000-8000-000000000002",
  colEntrada: "e2e00003-0000-4000-8000-000000000101",
  colAnalise: "e2e00003-0000-4000-8000-000000000102",
  colFinalizados: "e2e00003-0000-4000-8000-000000000103",
  itemAtendimento: "e2e00004-0000-4000-8000-000000000001",
  itemCota: "e2e00004-0000-4000-8000-000000000002",
} as const;

export const PANEL_NAMES = {
  principal: "[E2E] Painel Principal",
  urgencias: "[E2E] Painel Urgências",
} as const;
