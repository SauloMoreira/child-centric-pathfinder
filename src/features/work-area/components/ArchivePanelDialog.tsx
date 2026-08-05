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
import {
  panelErrorFromUnknown,
  useArchivePanel,
  usePanelPanorama,
  type PanelSummary,
} from "@/features/work-area";

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
  // Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — se o Painel é público, avisa
  // explicitamente que colaboradores e visitantes vinculados perderão acesso.
  const panorama = usePanelPanorama(panel?.id, open && !!panel?.isPublic);
  const linkedCount =
    (panorama.data?.collaborators.length ?? 0) + (panorama.data?.visitors.length ?? 0);

  const confirm = async () => {
    if (!panel) return;
    try {
      const res = await mut.mutateAsync({
        panelId: panel.id,
        expectedVersion: panel.optimisticVersion,
      });
      toast.success("Painel excluído");
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
          <AlertDialogTitle>Excluir Painel “{panel?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Painéis com colunas ou cards não podem ser excluídos. Esvazie o Painel antes de excluir.
            O último Painel ativo não pode ser excluído.
            {linkedCount > 0 && (
              <span className="mt-2 block font-medium text-destructive">
                Este Painel é público e tem {linkedCount}{" "}
                {linkedCount === 1 ? "usuário vinculado" : "usuários vinculados"} (colaboradores e
                visitantes). A exclusão removerá o acesso de todos eles.
              </span>
            )}
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
            {mut.isPending ? "Excluindo…" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
