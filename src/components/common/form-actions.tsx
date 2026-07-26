import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FormActions({
  onCancel,
  submitLabel = "Cadastrar",
  cancelLabel = "Cancelar",
  loading = false,
  disabled = false,
}: {
  onCancel: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border bg-surface px-4 py-3">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
        {cancelLabel}
      </Button>
      <Button type="submit" disabled={loading || disabled}>
        {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
    </div>
  );
}
