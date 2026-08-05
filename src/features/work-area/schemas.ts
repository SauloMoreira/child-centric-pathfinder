import { z } from "zod";
import { PANEL_ICON_ALLOWLIST, PANEL_NAME_MAX, PANEL_NAME_MIN } from "./types";

const iconSchema = z.enum(PANEL_ICON_ALLOWLIST).nullable().optional();

export const PANEL_DESCRIPTION_MAX = 500;

export const panelNameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(PANEL_NAME_MIN, "Informe o nome do Painel.")
      .max(PANEL_NAME_MAX, `Máximo de ${PANEL_NAME_MAX} caracteres.`),
  );

// Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — descrição opcional do Painel.
export const panelDescriptionSchema = z
  .string()
  .max(PANEL_DESCRIPTION_MAX, `Máximo de ${PANEL_DESCRIPTION_MAX} caracteres.`)
  .optional()
  .or(z.literal(""));

export const createPanelSchema = z.object({
  name: panelNameSchema,
  icon: iconSchema,
  description: panelDescriptionSchema,
  isPublic: z.boolean().optional(),
});

export const renamePanelSchema = z.object({
  name: panelNameSchema,
  icon: iconSchema,
  description: panelDescriptionSchema,
});

export type CreatePanelInput = z.infer<typeof createPanelSchema>;
export type RenamePanelInput = z.infer<typeof renamePanelSchema>;
