import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOTO_ACCEPTED_EXT, validateFotoFile } from "@/lib/validators/file-upload";

const BUCKET = "assistidos-fotos";

export type UploadFotoInput = {
  assistidoId: string;
  orgaoId: string;
  file: File;
};

export type UploadFotoResult = {
  ok: boolean;
  path?: string;
  error?: "INVALID_TYPE" | "TOO_LARGE" | "UPLOAD_FAILED" | "LINK_FAILED";
};

function uuid(): string {
  // Cripto seguro no browser; fallback simples
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

export function useUploadFotoAssistido() {
  return useMutation({
    mutationFn: async ({ assistidoId, orgaoId, file }: UploadFotoInput): Promise<UploadFotoResult> => {
      const err = validateFotoFile(file);
      if (err) return { ok: false, error: err };
      const ext = FOTO_ACCEPTED_EXT[file.type];
      const path = `${orgaoId}/${assistidoId}/${uuid()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (up.error) return { ok: false, error: "UPLOAD_FAILED" };
      const link = await supabase.rpc("vincular_foto_assistido", {
        p_assistido_id: assistidoId,
        p_foto_path: path,
      });
      if (link.error) {
        // tentar remover objeto órfão
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        return { ok: false, error: "LINK_FAILED" };
      }
      return { ok: true, path };
    },
  });
}
