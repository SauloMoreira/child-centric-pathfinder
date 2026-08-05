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
  type LucideIcon,
} from "lucide-react";
import type { PanelIcon as PanelIconName } from "../types";

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
