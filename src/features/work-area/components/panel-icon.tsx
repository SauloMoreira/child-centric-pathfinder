import {
  Layers,
  Folder,
  Briefcase,
  Book,
  Gavel,
  Scale,
  Users,
  User,
  Clipboard,
  Flag,
  Star,
  Bookmark,
  Target,
  Shield,
  Inbox,
  Archive,
  LayoutPanelTop,
  type LucideIcon,
} from "lucide-react";
import type { PanelIcon as PanelIconName, PanelRole } from "../types";

const MAP: Record<PanelIconName, LucideIcon> = {
  layers: Layers,
  folder: Folder,
  briefcase: Briefcase,
  book: Book,
  gavel: Gavel,
  scale: Scale,
  users: Users,
  user: User,
  clipboard: Clipboard,
  flag: Flag,
  star: Star,
  bookmark: Bookmark,
  target: Target,
  shield: Shield,
  inbox: Inbox,
  archive: Archive,
};

export function panelIconComponent(name: string | null | undefined): LucideIcon {
  if (!name) return Layers;
  return (MAP as Record<string, LucideIcon>)[name] ?? Layers;
}

/**
 * Ajuste doc (COMPARTILHAMENTO DE PAINÉIS) — "Sugere-se que os botões dos
 * painéis próprios ou em colaboração tenham o ícone de painel com o
 * quadradinho superior preenchido": Painéis próprios/colaborados usam
 * `LayoutPanelTop` (retângulo com a faixa superior destacada); Painéis em
 * que o usuário é apenas visitante mantêm o ícone padrão sem preenchimento.
 */
export function panelRoleIconComponent(role: PanelRole): LucideIcon {
  return role === "visitante" ? Layers : LayoutPanelTop;
}

export function PanelIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = panelIconComponent(name);
  return <Icon className={className} aria-hidden />;
}
