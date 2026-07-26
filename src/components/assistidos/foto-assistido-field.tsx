import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateFotoFile } from "@/lib/validators/file-upload";
import { toast } from "sonner";

export function FotoAssistidoField({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

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

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-canvas">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Prévia da foto" className="h-full w-full object-cover" />
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          {file ? "Trocar foto" : "Selecionar foto"}
        </Button>
        {file && (
          <button
            type="button"
            onClick={() => handleFile(null)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden /> Remover
          </button>
        )}
        <p className="text-[10px] text-muted-foreground">
          JPEG, PNG ou WEBP · máx. 2 MB · envio opcional após o cadastro
        </p>
      </div>
    </div>
  );
}
