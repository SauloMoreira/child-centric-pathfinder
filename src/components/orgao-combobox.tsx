import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OrgaoOption = {
  id: string;
  nome: string;
  comarca: string | null;
};

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type Props = {
  value: string | null;
  onChange: (id: string | null, option?: OrgaoOption) => void;
  options: OrgaoOption[];
  loading?: boolean;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
};

export function OrgaoCombobox({
  value,
  onChange,
  options,
  loading,
  disabled,
  id,
  placeholder = "Pesquisar por nome ou comarca",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    return options.filter((o) => norm(o.nome).includes(q) || norm(o.comarca ?? "").includes(q));
  }, [options, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-auto py-2",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? (
            <span className="flex flex-col items-start text-left">
              <span className="text-sm">{selected.nome}</span>
              {selected.comarca && (
                <span className="text-xs text-muted-foreground">Comarca: {selected.comarca}</span>
              )}
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando órgãos…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <CommandEmpty>Nenhum órgão encontrado.</CommandEmpty>
            )}
            {!loading && filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.nome} ${o.comarca ?? ""}`}
                    onSelect={() => {
                      onChange(o.id, o);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")}
                    />
                    <div className="flex flex-col">
                      <span>{o.nome}</span>
                      {o.comarca && (
                        <span className="text-xs text-muted-foreground">Comarca: {o.comarca}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
