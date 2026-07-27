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
import { cn } from "@/lib/utils";
import {
  PANEL_ICON_ALLOWLIST,
  PANEL_MAX,
  PANEL_NAME_MAX,
  createPanelSchema,
  panelErrorFromUnknown,
  type CreatePanelFormInput,
} from "@/features/work-area";
import { useCreatePanel } from "@/features/work-area";
import { panelIconComponent } from "./panel-icon";

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

  const atLimit = currentCount >= PANEL_MAX;

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
          <SheetDescription>
            Painéis organizam colunas e cards de forma independente. Você pode ter até {PANEL_MAX}{" "}
            Painéis ativos.
          </SheetDescription>
        </SheetHeader>

        {atLimit ? (
          <div className="mt-6 rounded-md border border-border bg-muted/50 p-4 text-sm">
            Limite de {PANEL_MAX} Painéis atingido. Arquive um Painel para criar outro.
          </div>
        ) : (
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
              <Label>Ícone</Label>
              <div className="grid grid-cols-8 gap-1">
                {PANEL_ICON_ALLOWLIST.map((name) => {
                  const Icon = panelIconComponent(name);
                  const active = icon === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setIcon(name)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition",
                        active
                          ? "border-institutional bg-institutional/10 text-institutional"
                          : "border-border hover:bg-muted",
                      )}
                      aria-pressed={active}
                      aria-label={`Ícone ${name}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
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
        )}
      </SheetContent>
    </Sheet>
  );
}
