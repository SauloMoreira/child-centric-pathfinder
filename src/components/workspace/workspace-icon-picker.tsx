import { BOARD_ICONS, type BoardIconId } from "@/lib/workspace/board-icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function WorkspaceIconPicker({
  value,
  onChange,
}: {
  value: BoardIconId | null;
  onChange: (id: BoardIconId | null) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium">Ícone do quadro</p>
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-8 gap-1.5">
          {BOARD_ICONS.map(({ id, label, Icon }) => {
            const active = value === id || (!value && id === "layout");
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={active}
                    onClick={() => onChange(id === "layout" ? null : id)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
