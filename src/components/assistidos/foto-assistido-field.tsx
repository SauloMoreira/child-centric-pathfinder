import { useEffect, useRef, useState } from "react";
import { Camera, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateFotoFile } from "@/lib/validators/file-upload";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function FotoAssistidoField({
  file,
  onChange,
  currentFotoPath = null,
  onRemoveCurrent,
  removeLoading = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  currentFotoPath?: string | null;
  onRemoveCurrent?: () => Promise<void> | void;
  removeLoading?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!currentFotoPath) {
        setCurrentUrl(null);
        return;
      }
      const { data } = await supabase.storage
        .from("assistidos-fotos")
        .createSignedUrl(currentFotoPath, 60 * 30);
      if (!cancelled) setCurrentUrl(data?.signedUrl ?? null);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [currentFotoPath]);

  function handleFile(f: File | null) {
    if (!f) {
      setPreview(null);
      onChange(null);
      return;
    }
    const err = validateFotoFile(f);
    if (err === "INVALID_TYPE") {
      toast.error("Formato de imagem não suportado. Use JPEG, PNG ou WEBP.");
      return;
    }
    if (err === "TOO_LARGE") {
      toast.error("A imagem deve ter no máximo 2 MB.");
      return;
    }
    setPreview(URL.createObjectURL(f));
    onChange(f);
  }

  const displayed = preview ?? currentUrl;
  const hasCurrent = !!currentFotoPath && !file;

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-canvas">
        {displayed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayed} alt="Foto do assistido" className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-5 w-5 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            {file || currentFotoPath ? "Trocar foto" : "Selecionar foto"}
          </Button>
          {hasCurrent && onRemoveCurrent && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={removeLoading}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Remover foto
            </Button>
          )}
        </div>
        {file && (
          <button
            type="button"
            onClick={() => handleFile(null)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden /> Cancelar seleção
          </button>
        )}
        <p className="text-[10px] text-muted-foreground">
          JPEG, PNG ou WEBP · máx. 2 MB
        </p>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover foto atual?</AlertDialogTitle>
            <AlertDialogDescription>
              A foto será excluída definitivamente e o cartão voltará a exibir as iniciais do nome.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await onRemoveCurrent?.();
                } finally {
                  setConfirmOpen(false);
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
