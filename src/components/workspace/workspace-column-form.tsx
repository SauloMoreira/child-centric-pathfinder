import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FILTER_OPTIONS,
  FILTER_GROUP_LABELS,
  buildFromOptionIds,
  detectActiveOptions,
  EMPTY_FILTER,
  type FilterDefinition,
} from "@/lib/workspace/filters";
import { COLOR_TOKENS, getColorClasses } from "@/lib/workspace/colors";
import type { WorkspaceColumn } from "@/hooks/use-workspace";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  workspaceId: string | null;
  column?: WorkspaceColumn | null;
  onSubmit: (payload: {
    title: string;
    description: string | null;
    color_token: string;
    custom_color: string | null;
    filter: FilterDefinition;
    column_id?: string;
    version?: number;
    workspace_id?: string;
  }) => Promise<void>;
};

export function WorkspaceColumnForm({
  open,
  onOpenChange,
  mode,
  workspaceId,
  column,
  onSubmit,
}: Props) {
  const isBase = column?.is_base_column ?? false;
  const [title, setTitle] = useState(column?.title ?? "");
  const [description, setDescription] = useState(column?.description ?? "");
  const [colorToken, setColorToken] = useState<string>(column?.color_token ?? "neutral");
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(
    column ? detectActiveOptions(column.filter_definition?.conditions ?? []) : [],
  );
  const [submitting, setSubmitting] = useState(false);

  // Reset ao abrir/mudar coluna
  useMemo(() => {
    if (open) {
      setTitle(column?.title ?? "");
      setDescription(column?.description ?? "");
      setColorToken(column?.color_token ?? "neutral");
      setSelectedOptionIds(
        column ? detectActiveOptions(column.filter_definition?.conditions ?? []) : [],
      );
    }
  }, [open, column]);

  const groups = useMemo(() => {
    const acc: Record<string, typeof FILTER_OPTIONS> = {};
    for (const opt of FILTER_OPTIONS) {
      (acc[opt.group] ??= []).push(opt);
    }
    return acc;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim().replace(/\s+/g, " ");
    if (cleanTitle.length < 3) {
      toast.error("Título deve ter ao menos 3 caracteres.");
      return;
    }
    if (cleanTitle.length > 80) {
      toast.error("Título deve ter até 80 caracteres.");
      return;
    }
    if (description.length > 240) {
      toast.error("Descrição deve ter até 240 caracteres.");
      return;
    }
    const conditions = isBase ? [] : buildFromOptionIds(selectedOptionIds);
    const filter: FilterDefinition = { version: 1, text: null, conditions };
    setSubmitting(true);
    try {
      await onSubmit({
        title: cleanTitle,
        description: description.trim() || null,
        color_token: colorToken,
        custom_color: null,
        filter,
        column_id: column?.id,
        version: column?.version,
        workspace_id: workspaceId ?? undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleOption(id: string) {
    setSelectedOptionIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {mode === "create" ? "Nova coluna" : "Editar coluna"}
          </SheetTitle>
          <SheetDescription>
            Crie uma visão personalizada definindo título, descrição, cor e filtros.
            {isBase && " Esta é a coluna-base do quadro — ela não recebe filtros."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6 pb-8">
          <div className="space-y-2">
            <Label htmlFor="wc-title">Título</Label>
            <Input
              id="wc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Em acolhimento"
              maxLength={80}
              required
              minLength={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wc-desc">Descrição (opcional)</Label>
            <Textarea
              id="wc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: crianças em acolhimento com prazo próximo."
              maxLength={240}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/240
            </p>
          </div>

          <div className="space-y-2">
            <Label>Cor de fundo</Label>
            <div className="grid grid-cols-4 gap-2">
              {COLOR_TOKENS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-label={c.label}
                  aria-pressed={colorToken === c.value}
                  onClick={() => setColorToken(c.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border p-2 text-left text-xs transition",
                    colorToken === c.value
                      ? "border-institutional ring-1 ring-institutional"
                      : "border-border hover:border-muted-foreground",
                  )}
                >
                  <span
                    className={cn("h-4 w-4 rounded-sm border border-border", c.swatch)}
                  />
                  <span className="truncate">{c.label}</span>
                </button>
              ))}
            </div>
            <div
              className={cn(
                "rounded-md border-l-4 border-y border-r border-border px-3 py-2 text-xs",
                getColorClasses(colorToken).border,
                getColorClasses(colorToken).headerBg,
              )}
            >
              Prévia do cabeçalho da coluna
            </div>
          </div>

          {!isBase && (
            <div className="space-y-3">
              <div>
                <Label>Filtros da coluna</Label>
                <p className="text-xs text-muted-foreground">
                  Selecione um ou mais filtros. Opções do mesmo grupo se combinam de forma
                  compatível; grupos diferentes se combinam com E lógico.
                </p>
              </div>
              {Object.entries(groups).map(([group, opts]) => (
                <fieldset key={group} className="rounded-md border border-border p-3">
                  <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {FILTER_GROUP_LABELS[group as keyof typeof FILTER_GROUP_LABELS]}
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {opts.map((o) => (
                      <label
                        key={o.id}
                        className="flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <Checkbox
                          checked={selectedOptionIds.includes(o.id)}
                          onCheckedChange={() => toggleOption(o.id)}
                          aria-label={o.label}
                        />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          <SheetFooter className="flex flex-row gap-2 border-t border-border pt-4 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Salvando..."
                : mode === "create"
                ? "Criar coluna"
                : "Salvar alterações"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export { EMPTY_FILTER };
