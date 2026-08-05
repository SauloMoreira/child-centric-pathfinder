import { useState } from "react";
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
  createPanelSchema,
  panelErrorFromUnknown,
  type CreatePanelFormInput,
} from "@/features/work-area";
import { useCreatePanel } from "@/features/work-area";

export function CreatePanelSheet({
  open,
  onOpenChange,
  defenderUserId,
  currentCount,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defenderUserId: string;
  currentCount: number;
  onCreated?: (panelId: string) => void;
}) {
  const [icon, setIcon] = useState<string | null>("layers");
  const [isPublic, setIsPublic] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatePanelFormInput>({
    resolver: zodResolver(createPanelSchema),
    defaultValues: { name: "", icon: "layers", description: "" },
  });
  const mut = useCreatePanel(defenderUserId);

  const submit = handleSubmit(async (values) => {
    try {
      const res = await mut.mutateAsync({
        name: values.name,
        icon,
        expectedCount: currentCount,
        description: values.description || null,
        isPublic,
      });
      toast.success("Painel criado");
      onCreated?.(res.panelId);
      reset({ name: "", icon: "layers", description: "" });
      setIcon("layers");
      setIsPublic(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset({ name: "", icon: "layers" });
        onOpenChange(v);
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Novo Painel</SheetTitle>
          {/* Ajuste doc (AJUSTE 13) — não há mais limite de Painéis. */}
          <SheetDescription>Painéis organizam colunas e cards de forma independente.</SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="panel-name">Nome</Label>
            <Input
              id="panel-name"
              autoFocus
              maxLength={PANEL_NAME_MAX}
              placeholder="Ex: Prioridades"
              {...register("name")}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="panel-description">Descrição (opcional)</Label>
            <Textarea
              id="panel-description"
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
              <Label htmlFor="panel-is-public">Tornar este Painel público</Label>
              <p className="text-xs text-muted-foreground">
                Painéis públicos podem ser encontrados na Biblioteca e importados por outros
                usuários, que passam a visualizá-lo como visitantes.
              </p>
            </div>
            <Switch id="panel-is-public" checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Criando…" : "Criar Painel"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
