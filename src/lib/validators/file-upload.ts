export const FOTO_MAX_BYTES = 2 * 1024 * 1024;
export const FOTO_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const FOTO_ACCEPTED_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type FotoValidationError =
  | "INVALID_TYPE"
  | "TOO_LARGE";

export function validateFotoFile(file: File): FotoValidationError | null {
  if (!FOTO_ACCEPTED_TYPES.includes(file.type as (typeof FOTO_ACCEPTED_TYPES)[number])) {
    return "INVALID_TYPE";
  }
  if (file.size > FOTO_MAX_BYTES) return "TOO_LARGE";
  return null;
}
