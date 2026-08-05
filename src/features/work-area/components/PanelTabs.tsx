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
import { LogOut, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  panelErrorFromUnknown,
  useReorderPanels,
  useRemoveImportedPanel,
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
  const removeImported = useRemoveImportedPanel(defenderUserId);
  // Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — Painéis importados/colaborados
  // não fazem parte da reordenação por arraste (o `order_position` pertence
  // ao Painel do Defensor que o criou), então ficam num grupo à parte,
  // sempre depois dos Painéis próprios.
  const ownPanels = panels.filter((p) => p.role === "owner");
  const sharedPanels = panels.filter((p) => p.role !== "owner");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const activePanel = useMemo(
    () => ownPanels.find((p) => p.id === activeId) ?? null,
    [activeId, ownPanels],
  );

  const items = useMemo(() => ownPanels.map((p) => p.id), [ownPanels]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ownPanels.findIndex((p) => p.id === active.id);
    const newIndex = ownPanels.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(ownPanels, oldIndex, newIndex);
    try {
      await reorder.mutateAsync({ items: reordered });
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    }
  };

  async function handleRemoveImported(panel: PanelSummary) {
    try {
      await removeImported.mutateAsync({ panelId: panel.id });
      toast.success("Painel removido da sua Área de Trabalho");
    } catch (err) {
      toast.error(panelErrorFromUnknown(err).message);
    }
  }

  // Ajuste doc (AJUSTE 13) — sem limite de Painéis e sem rolagem lateral:
  // quando a linha não comporta mais abas, os novos Painéis passam a ser
  // dispostos na linha de baixo (flex-wrap). O botão de criação vive
  // dentro dessa mesma linha, como um "+" discreto ao final da lista.
  return (
    <div className="flex flex-wrap items-center gap-1">
      {canManage ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={items} strategy={horizontalListSortingStrategy}>
            {ownPanels.map((p) => (
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
          </SortableContext>
          <DragOverlay>
            {activePanel ? <PanelTabButton panel={activePanel} selected dragging /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        ownPanels.map((p) => (
          <PanelTabButton
            key={p.id}
            panel={p}
            selected={p.id === selectedId}
            onClick={() => onSelect(p.id)}
          />
        ))
      )}

      {sharedPanels.map((p) => (
        <PanelTabButton
          key={p.id}
          panel={p}
          selected={p.id === selectedId}
          onClick={() => onSelect(p.id)}
          actions={
            p.role === "visitante" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Ações do Painel ${p.name}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleRemoveImported(p)}
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Remover painel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null
          }
        />
      ))}

      {canManage && (
        <button
          type="button"
          onClick={onCreate}
          aria-label="Criar painel"
          title="Criar painel"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
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
  // Ajuste doc — a personalização de ícone por painel foi retirada; todos
  // os botões de painel usam o mesmo ícone-base, simbolizando um painel.
  // Ajuste doc (AJUSTE 32) — a variante diferenciada por papel (quadradinho
  // superior preenchido para Painéis próprios/colaborados) foi revertida a
  // pedido: volta ao ícone único (Layers) para todos os papéis.
  const Icon = panelIconComponent(null);
  return (
    <div
      className={cn(
        "group flex shrink-0 items-center rounded-md px-2.5 py-1.5 text-xs transition-colors",
        selected
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        dragging && "shadow-md ring-1 ring-institutional/60",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 items-center justify-center gap-1.5 outline-none"
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
        // Ajuste doc (AJUSTE 13) — o botão de 3 pontinhos deixa de ser um
        // overlay absoluto sobreposto ao texto: agora ocupa espaço real
        // (max-width animado, 0 → aberto), surgindo só no hover real do
        // mouse sobre o botão do Painel — nunca por focus-within, que
        // mantinha o botão "grudado" visível depois de usar o menu (o
        // Radix mantém o foco no gatilho ao fechar). Ao abrir, empurra os
        // demais botões de Painel para o lado, como pedido.
        <span
          className={cn(
            "ml-0 max-w-0 shrink-0 overflow-hidden opacity-0",
            "transition-[max-width,opacity,margin-left] duration-150 ease-out",
            "group-hover:ml-1 group-hover:max-w-[1.75rem] group-hover:opacity-100",
          )}
        >
          {actions}
        </span>
      )}
    </div>
  );
}
