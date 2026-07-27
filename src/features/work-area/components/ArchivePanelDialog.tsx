import { toast } from "sonner";
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
import { panelErrorFromUnknown, useArchivePanel, type PanelSummary } from "@/features/work-area";

export function ArchivePanelDialog({
  open,
  onOpenChange,
  defenderUserId,
  panel,
  onArchived,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defenderUserId: string;
  panel: PanelSummary | null;
  onArchived?: (nextActivePanelId: string | null) => void;
}) {
  const mut = useArchivePanel(defenderUserId);

  const confirm = async () => {
    if (!panel) return;
    try {
      const res = await mut.mutateAsync({
        panelId: panel.id,
        expectedVersion: panel.optimisticVersion,
      });
      toast.success("Painel arquivado");
      onArchived?.(res.nextActivePanelId ?? null);
      onOpenChange(false);
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar Painel “{panel?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Painéis com colunas ou cards não podem ser arquivados. Esvazie o Painel antes de
            arquivar. O último Painel ativo não pode ser arquivado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={mut.isPending}
          >
            {mut.isPending ? "Arquivando…" : "Arquivar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
