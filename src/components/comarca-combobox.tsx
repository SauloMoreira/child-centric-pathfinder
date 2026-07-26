import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function normalizeComarca(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function canonicalizeComarca(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  loading?: boolean;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  "aria-invalid"?: boolean;
};

export function ComarcaCombobox({
  value,
  onChange,
  options,
  loading,
  disabled,
  id,
  placeholder = "Pesquisar ou criar comarca",
  ...rest
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedOptions = useMemo(
    () =>
      options.map((o) => ({
        original: o,
        norm: normalizeComarca(o),
      })),
    [options],
  );

  const queryNorm = normalizeComarca(query);
  const canonicalQuery = canonicalizeComarca(query);
  const existingMatch = normalizedOptions.find((o) => o.norm === queryNorm);
  const canCreate =
    canonicalQuery.length >= 2 && !existingMatch;

  const filtered = useMemo(() => {
    if (!queryNorm) return normalizedOptions;
    return normalizedOptions.filter((o) => o.norm.includes(queryNorm));
  }, [normalizedOptions, queryNorm]);

  const select = (v: string) => {
    onChange(v);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={rest["aria-invalid"]}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">
            {value || placeholder}
          </span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" aria-hidden />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
            maxLength={120}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Carregando comarcas…
              </div>
            )}
            {!loading && filtered.length === 0 && !canCreate && (
              <CommandEmpty>
                {options.length === 0
                  ? "Nenhuma comarca encontrada. Digite para criar uma nova."
                  : "Nenhuma comarca corresponde à busca."}
              </CommandEmpty>
            )}
            {!loading && filtered.length > 0 && (
              <CommandGroup heading="Comarcas existentes">
                {filtered.map((o) => (
                  <CommandItem
                    key={o.original}
                    value={o.original}
                    onSelect={() => select(o.original)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value && normalizeComarca(value) === o.norm
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                      aria-hidden
                    />
                    {o.original}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!loading && canCreate && (
              <CommandGroup heading="Criar nova">
                <CommandItem
                  value={`__create__${canonicalQuery}`}
                  onSelect={() => select(canonicalQuery)}
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden />
                  Criar comarca: <span className="ml-1 font-medium">{canonicalQuery}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {!loading && existingMatch && queryNorm && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                Esta comarca já existe. Selecione-a na lista.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
