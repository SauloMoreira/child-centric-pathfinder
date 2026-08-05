import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  PANEL_NAME_MAX,
  PANEL_DESCRIPTION_MAX,
  panelErrorFromUnknown,
  renamePanelSchema,
  useRenamePanel,
  useSetPanelVisibility,
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
  const [isPublic, setIsPublic] = useState(panel?.isPublic ?? false);
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
      description: panel?.description ?? "",
    },
  });
  const mut = useRenamePanel(defenderUserId);
  const visibilityMut = useSetPanelVisibility(defenderUserId);

  useEffect(() => {
    if (panel) {
      reset({
        name: panel.name,
        icon: (panel.icon as RenamePanelFormInput["icon"]) ?? "layers",
        description: panel.description ?? "",
      });
      setIcon(panel.icon ?? "layers");
      setIsPublic(panel.isPublic);
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
        description: values.description || null,
      });
      if (isPublic !== panel.isPublic) {
        await visibilityMut.mutateAsync({
          panelId: panel.id,
          isPublic,
          expectedVersion: panel.optimisticVersion + 1,
        });
      }
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
          <SheetDescription>Nome, descrição e visibilidade deste Painel.</SheetDescription>
        </SheetHeader>
        {panel && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="panel-name-edit">Nome</Label>
              <Input id="panel-name-edit" maxLength={PANEL_NAME_MAX} {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="panel-description-edit">Descrição (opcional)</Label>
              <Textarea
                id="panel-description-edit"
                rows={3}
                maxLength={PANEL_DESCRIPTION_MAX}
                placeholder="Do que trata este Painel?"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-surface/40 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="panel-is-public-edit">Painel público</Label>
                <p className="text-xs text-muted-foreground">
                  {isPublic
                    ? "Encontrável na Biblioteca e importável por outros usuários."
                    : "Uso exclusivo seu."}
                  {isPublic &&
                    panel.isPublic &&
                    " Tornar privado remove o acesso de todos os colaboradores e visitantes atuais."}
                </p>
              </div>
              <Switch id="panel-is-public-edit" checked={isPublic} onCheckedChange={setIsPublic} />
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mut.isPending || visibilityMut.isPending}>
                {mut.isPending || visibilityMut.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
