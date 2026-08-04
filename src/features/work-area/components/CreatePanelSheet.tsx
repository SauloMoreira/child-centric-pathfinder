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
import {
  PANEL_NAME_MAX,
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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatePanelFormInput>({
    resolver: zodResolver(createPanelSchema),
    defaultValues: { name: "", icon: "layers" },
  });
  const mut = useCreatePanel(defenderUserId);

  const submit = handleSubmit(async (values) => {
    try {
      const res = await mut.mutateAsync({
        name: values.name,
        icon,
        expectedCount: currentCount,
      });
      toast.success("Painel criado");
      onCreated?.(res.panelId);
      reset({ name: "", icon: "layers" });
      setIcon("layers");
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
