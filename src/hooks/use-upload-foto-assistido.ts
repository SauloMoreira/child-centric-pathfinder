import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

export function useUploadFotoAssistido() {
  const qc = useQueryClient();
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
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        return { ok: false, error: "LINK_FAILED" };
      }
      return { ok: true, path };
    },
    onSuccess: (r) => {
      if (r.ok) {
        qc.invalidateQueries({ queryKey: ["workspace-column"] });
        qc.invalidateQueries({ queryKey: ["assistido-full"] });
        qc.invalidateQueries({ queryKey: ["buscar-assistidos"] });
        qc.invalidateQueries({ queryKey: ["workspace-search"] });
      }
    },
  });
}

export function useRemoverFotoAssistido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assistidoId }: { assistidoId: string }) => {
      // Ler o path atual antes de limpar (necessário para remover o objeto do bucket).
      const { data: rec } = await supabase
        .from("assistidos")
        .select("foto_path")
        .eq("id", assistidoId)
        .maybeSingle();
      const prevPath = (rec?.foto_path as string | null) ?? null;
      const { error } = await supabase.rpc("remover_foto_assistido", {
        p_assistido_id: assistidoId,
      });
      if (error) throw error;
      if (prevPath) {
        await supabase.storage.from(BUCKET).remove([prevPath]).catch(() => undefined);
      }
      return { ok: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-column"] });
      qc.invalidateQueries({ queryKey: ["assistido-full"] });
      qc.invalidateQueries({ queryKey: ["workspace-search"] });
    },
  });
}
