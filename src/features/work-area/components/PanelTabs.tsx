import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  PANEL_MAX,
  panelErrorFromUnknown,
  useReorderPanels,
  type PanelSummary,
  type WorkspaceAccess,
} from "@/features/work-area";
import { panelIconComponent } from "./panel-icon";

type Props = {
  defenderUserId: string;
  panels: PanelSummary[];
  selectedId: string | null;
  onSelect: (panelId: string) => void;
  access: WorkspaceAccess;
  onCreate: () => void;
  onRename: (panel: PanelSummary) => void;
  onArchive: (panel: PanelSummary) => void;
};

export function PanelTabs({
  defenderUserId,
  panels,
  selectedId,
  onSelect,
  access,
  onCreate,
  onRename,
  onArchive,
}: Props) {
  const canManage = access.canManagePanels;
  const reorder = useReorderPanels(defenderUserId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const activePanel = useMemo(
    () => panels.find((p) => p.id === activeId) ?? null,
    [activeId, panels],
  );

  const items = useMemo(() => panels.map((p) => p.id), [panels]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = panels.findIndex((p) => p.id === active.id);
    const newIndex = panels.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(panels, oldIndex, newIndex);
    try {
      await reorder.mutateAsync({ items: reordered });
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 overflow-x-auto">
        {canManage ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={items} strategy={horizontalListSortingStrategy}>
              <div className="flex items-center gap-1">
                {panels.map((p) => (
                  <SortablePanelTab
                    key={p.id}
                    panel={p}
                    selected={p.id === selectedId}
                    canManage={canManage}
                    onSelect={() => onSelect(p.id)}
                    onRename={() => onRename(p)}
                    onArchive={() => onArchive(p)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activePanel ? <PanelTabButton panel={activePanel} selected dragging /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="flex items-center gap-1">
            {panels.map((p) => (
              <PanelTabButton
                key={p.id}
                panel={p}
                selected={p.id === selectedId}
                onClick={() => onSelect(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
          disabled={panels.length >= PANEL_MAX}
          onClick={onCreate}
          title={
            panels.length >= PANEL_MAX
              ? `Limite de ${PANEL_MAX} Painéis atingido`
              : "Criar novo Painel"
          }
        >
          <Plus className="h-3.5 w-3.5" /> Criar painel
        </Button>
      )}
    </div>
  );
}

function SortablePanelTab({
  panel,
  selected,
  canManage,
  onSelect,
  onRename,
  onArchive,
}: {
  panel: PanelSummary;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onRename: () => void;
  onArchive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: panel.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  } as const;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center"
      {...attributes}
      {...listeners}
    >
      <PanelTabButton
        panel={panel}
        selected={selected}
        onClick={onSelect}
        actions={
          canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Ações do Painel ${panel.name}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onRename}>
                  <Pencil className="mr-2 h-4 w-4" /> Renomear
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onArchive}>
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />
    </div>
  );
}

function PanelTabButton({
  panel,
  selected,
  onClick,
  actions,
  dragging,
}: {
  panel: PanelSummary;
  selected: boolean;
  onClick?: () => void;
  actions?: React.ReactNode;
  dragging?: boolean;
}) {
  const Icon = panelIconComponent(panel.icon);
  return (
    <div
      className={cn(
        "group relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
        selected
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        dragging && "shadow-md ring-1 ring-institutional/60",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-1.5 outline-none"
        onClick={onClick}
        aria-current={selected ? "page" : undefined}
        title={panel.name}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            selected ? "text-institutional" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <span className={cn("max-w-[10rem] truncate", selected && "font-medium")}>
          {panel.name}
        </span>
      </button>
      {actions && (
        <span
          className={cn(
            "transition-opacity",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          )}
        >
          {actions}
        </span>
      )}
    </div>
  );
}
