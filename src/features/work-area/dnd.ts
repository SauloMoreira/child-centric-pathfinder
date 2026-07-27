import type { WorkAreaDragData } from "./types";

// Prefixos garantem unicidade global entre painéis, colunas e cards.
export const panelDragId = (panelId: string) => `panel:${panelId}`;
export const columnDragId = (columnId: string) => `column:${columnId}`;
export const cardDragId = (cardId: string) => `card:${cardId}`;

export function parseDragId(
  id: string,
):
  | { kind: "panel"; id: string }
  | { kind: "column"; id: string }
  | { kind: "card"; id: string }
  | null {
  const [kind, rest] = id.split(":");
  if (!rest) return null;
  if (kind === "panel" || kind === "column" || kind === "card") {
    return { kind, id: rest };
  }
  return null;
}

export function isPanelDrag(data: unknown): data is Extract<
  WorkAreaDragData,
  { type: "panel" }
> {
  return !!data && typeof data === "object" && (data as WorkAreaDragData).type === "panel";
}
