import { z } from "zod";
import { PANEL_ICON_ALLOWLIST, PANEL_NAME_MAX, PANEL_NAME_MIN } from "./types";

const iconSchema = z.enum(PANEL_ICON_ALLOWLIST).nullable().optional();

export const panelNameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(PANEL_NAME_MIN, "Informe o nome do Painel.")
      .max(PANEL_NAME_MAX, `Máximo de ${PANEL_NAME_MAX} caracteres.`),
  );

export const createPanelSchema = z.object({
  name: panelNameSchema,
  icon: iconSchema,
});

export const renamePanelSchema = z.object({
  name: panelNameSchema,
  icon: iconSchema,
});

export type CreatePanelInput = z.infer<typeof createPanelSchema>;
export type RenamePanelInput = z.infer<typeof renamePanelSchema>;
