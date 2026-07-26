import { useState } from "react";
import { Check, Search as SearchIcon, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useBuscarAssistidosPicker, type PickerItem } from "@/hooks/use-buscar-assistidos-picker";

type Categoria = "crianca_adolescente" | "adulto" | "todos";

export type VinculoAssistidoPickerProps = {
  categoria: Categoria;
  multiple?: boolean;
  selectedIds: string[];
  excludeIds?: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  triggerLabel?: string;
};

export function VinculoAssistidoPicker({
  categoria,
  multiple = true,
  selectedIds,
  excludeIds = [],
  onChange,
  placeholder = "Buscar por nome…",
  triggerLabel = "Selecionar pessoa",
}: VinculoAssistidoPickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, PickerItem>>({});

  const query = useBuscarAssistidosPicker(text, categoria, [...selectedIds, ...excludeIds], open);

  function toggle(item: PickerItem) {
    const isSelected = selectedIds.includes(item.id);
    let next: string[];
    if (multiple) {
      next = isSelected ? selectedIds.filter((i) => i !== item.id) : [...selectedIds, item.id];
    } else {
      next = isSelected ? [] : [item.id];
      setOpen(false);
    }
    setSelectedItems((s) => ({ ...s, [item.id]: item }));
    onChange(next);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((i) => i !== id));
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-full justify-start">
            <SearchIcon className="mr-2 h-3.5 w-3.5" aria-hidden />
            {triggerLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[360px] p-0">
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              aria-label="Buscar assistidos"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {query.isFetching ? (
              <div className="space-y-1 p-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (query.data ?? []).length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {text ? "Nenhum resultado encontrado." : "Digite para buscar."}
              </p>
            ) : (
              (query.data ?? []).map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-canvas",
                      isSelected && "bg-canvas",
                    )}
                  >
                    <span className="flex h-4 w-4 items-center justify-center">
                      {isSelected && <Check className="h-3.5 w-3.5" aria-hidden />}
                    </span>
                    <span className="flex-1 truncate">
                      <span className="truncate">{item.nome_completo}</span>
                      <span className="block text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                        {item.data_nascimento} · {item.categoria}
                        {item.cpf_mascarado ? ` · ${item.cpf_mascarado}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {query.isRefetching && (
            <div className="flex items-center justify-center border-t border-border p-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            </div>
          )}
        </PopoverContent>
      </Popover>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedIds.map((id) => {
            const item = selectedItems[id];
            return (
              <Badge key={id} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
                <span className="max-w-[160px] truncate">{item?.nome_completo ?? id.slice(0, 8)}</span>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="rounded p-0.5 hover:bg-canvas"
                  aria-label={`Remover ${item?.nome_completo ?? "seleção"}`}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
