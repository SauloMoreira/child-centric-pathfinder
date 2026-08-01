import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PANEL_NAME_MAX,
  panelErrorFromUnknown,
  renamePanelSchema,
  useRenamePanel,
  type PanelSummary,
  type RenamePanelFormInput,
} from "@/features/work-area";

export function RenamePanelSheet({
  open,
  onOpenChange,
  defenderUserId,
  panel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defenderUserId: string;
  panel: PanelSummary | null;
}) {
  const [icon, setIcon] = useState<string | null>(panel?.icon ?? "layers");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RenamePanelFormInput>({
    resolver: zodResolver(renamePanelSchema),
    defaultValues: {
      name: panel?.name ?? "",
      icon: (panel?.icon as RenamePanelFormInput["icon"]) ?? "layers",
    },
  });
  const mut = useRenamePanel(defenderUserId);

  useEffect(() => {
    if (panel) {
      reset({
        name: panel.name,
        icon: (panel.icon as RenamePanelFormInput["icon"]) ?? "layers",
      });
      setIcon(panel.icon ?? "layers");
    }
  }, [panel, reset]);

  const submit = handleSubmit(async (values) => {
    if (!panel) return;
    try {
      await mut.mutateAsync({
        panelId: panel.id,
        name: values.name,
        icon,
        expectedVersion: panel.optimisticVersion,
      });
      toast.success("Painel atualizado");
      onOpenChange(false);
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Editar Painel</SheetTitle>
        </SheetHeader>
        {panel && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="panel-name-edit">Nome</Label>
              <Input id="panel-name-edit" maxLength={PANEL_NAME_MAX} {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
