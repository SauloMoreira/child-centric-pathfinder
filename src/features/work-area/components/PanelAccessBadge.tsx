import { useState } from "react";
import { Crown, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PanelRole } from "../types";
import { PanelPanoramaDialog } from "./PanelPanoramaDialog";

function labelFor(isPublic: boolean, role: PanelRole): string {
  if (!isPublic) return "Este painel é de uso privado.";
  if (role === "owner") return "Você é gestor deste painel.";
  if (role === "colaborador") return "Você é colaborador neste painel.";
  return "Você é visitante neste painel.";
}

function IconFor({ isPublic, role }: { isPublic: boolean; role: PanelRole }) {
  if (!isPublic) return <User className="h-3.5 w-3.5" aria-hidden />;
  if (role === "owner") {
    return (
      <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
        <Users className="h-3.5 w-3.5" aria-hidden />
        <Crown className="absolute -right-1 -top-1.5 h-2.5 w-2.5 text-institutional" aria-hidden />
      </span>
    );
  }
  return <Users className="h-3.5 w-3.5" aria-hidden />;
}

/**
 * Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — botão discreto abaixo do
 * título "Área de Trabalho", no lugar do nome do usuário, que resume o
 * papel do usuário em relação ao Painel selecionado. Ao clicar, abre o
 * panorama compacto do Painel.
 */
export function PanelAccessBadge({
  panelId,
  isPublic,
  role,
  defenderUserId,
}: {
  panelId: string;
  isPublic: boolean;
  role: PanelRole;
  defenderUserId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground",
          "transition-colors hover:bg-muted hover:text-foreground",
        )}
      >
        <IconFor isPublic={isPublic} role={role} />
        {labelFor(isPublic, role)}
      </button>
      <PanelPanoramaDialog
        open={open}
        onOpenChange={setOpen}
        panelId={panelId}
        defenderUserId={defenderUserId}
      />
    </>
  );
}
