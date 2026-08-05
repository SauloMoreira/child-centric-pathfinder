import type { CSSProperties } from "react";
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
  FileText,
  Heart,
  Home,
  Lightbulb,
  MapPin,
  MessageSquare,
  Calendar,
  GraduationCap,
  Landmark,
  LifeBuoy,
  Puzzle,
  Handshake,
  FileSignature,
  UsersRound,
  Siren,
  Lock,
  Award,
  Stethoscope,
  Pill,
  School,
  Baby,
  Receipt,
  PiggyBank,
  ShoppingCart,
  Banknote,
  Leaf,
  HandHelping,
  Venus,
  HandFist,
  Accessibility,
  PersonStanding,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react";

/** Ajuste doc (AJUSTE 27 — Gravata) — lucide-react não tem um ícone
 *  literal de gravata; a paleta usava "Shirt" (camisa) como aproximação,
 *  mas o Saulo pediu um ícone fiel ao tema. Ícone customizado no mesmo
 *  estilo dos demais (stroke, viewBox 24x24, via createLucideIcon):
 *  silhueta de gravata — nó no topo, alargando levemente no peito e
 *  afunilando até a ponta. */
const Necktie = createLucideIcon("Necktie", [
  [
    "path",
    {
      d: "M9 3 L15 3 L13.5 7 L14.5 11 L12 21 L9.5 11 L10.5 7 Z",
      key: "necktie-outline",
    },
  ],
]);

/** Ajuste doc (AJUSTE 1 — Ícones na área de trabalho) — paleta curada de
 *  ícones para colunas. Não há vínculo real entre um ícone e qualquer
 *  categoria específica: a paleta só CRESCE em tamanho (mais opções
 *  disponíveis) conforme mais categorias existem no sistema, para dar
 *  variedade visual crescente — nunca associação semântica. */
export const COLUMN_ICON_ORDER = [
  "layers",
  "folder",
  "briefcase",
  "book",
  "gavel",
  "scale",
  "users",
  "user",
  "clipboard",
  "flag",
  "star",
  "bookmark",
  "target",
  "shield",
  "inbox",
  "archive",
  "file-text",
  "heart",
  "home",
  "lightbulb",
  "map-pin",
  "message-square",
  "calendar",
  "graduation-cap",
  "landmark",
  "life-buoy",
  "puzzle",
  "handshake",
  // Ajuste doc — novos ícones temáticos (Direito Cível, Família, Direito
  // Criminal, Prisão/Cadeia, Militar, Saúde, Remédio, Educação, Infância,
  // Tributário, Previdenciário, Consumidor, Dinheiro, Meio Ambiente/
  // Natureza, Gravata, Assistência Social).
  "file-signature",
  "users-round",
  "siren",
  "lock",
  "award",
  "stethoscope",
  "pill",
  "school",
  "baby",
  "receipt",
  "piggy-bank",
  "shopping-cart",
  "banknote",
  "leaf",
  "shirt",
  "hand-helping",
  // Ajuste doc — AJUSTE 27: novos ícones temáticos (Mulher, Luta Social,
  // Pessoa com Deficiência, Pessoa Idosa). Contrato e Moradia já contam
  // com ícones equivalentes na paleta ("file-signature" e "home").
  "venus",
  "hand-fist",
  "accessibility",
  "person-standing",
] as const;

export type ColumnIconName = (typeof COLUMN_ICON_ORDER)[number];

const MAP: Record<ColumnIconName, LucideIcon> = {
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
  "file-text": FileText,
  heart: Heart,
  home: Home,
  lightbulb: Lightbulb,
  "map-pin": MapPin,
  "message-square": MessageSquare,
  calendar: Calendar,
  "graduation-cap": GraduationCap,
  landmark: Landmark,
  "life-buoy": LifeBuoy,
  puzzle: Puzzle,
  handshake: Handshake,
  "file-signature": FileSignature,
  "users-round": UsersRound,
  siren: Siren,
  lock: Lock,
  award: Award,
  stethoscope: Stethoscope,
  pill: Pill,
  school: School,
  baby: Baby,
  receipt: Receipt,
  "piggy-bank": PiggyBank,
  "shopping-cart": ShoppingCart,
  banknote: Banknote,
  leaf: Leaf,
  // Ajuste doc (AJUSTE 27 — Gravata) — chave interna "shirt" preservada de
  // propósito (colunas já salvas com esse valor no banco continuam
  // resolvendo o ícone certo); o glifo exibido agora é a gravata
  // customizada (Necktie), não mais uma camisa.
  shirt: Necktie,
  "hand-helping": HandHelping,
  venus: Venus,
  "hand-fist": HandFist,
  accessibility: Accessibility,
  "person-standing": PersonStanding,
};

/** Quantidade mínima de opções sempre disponíveis, mesmo sem nenhuma
 *  categoria cadastrada ainda. */
const BASE_POOL_SIZE = 10;

export function columnIconComponent(name: string | null | undefined): LucideIcon | null {
  if (!name) return null;
  return (MAP as Record<string, LucideIcon>)[name] ?? null;
}

/** Paleta disponível para o seletor de ícone de coluna, cujo tamanho
 *  cresce (até o limite da paleta total) conforme a quantidade de
 *  categorias já criadas no sistema — sem vínculo real com elas. */
export function columnIconPalette(categoriasCount: number): ColumnIconName[] {
  const tamanho = Math.min(COLUMN_ICON_ORDER.length, BASE_POOL_SIZE + Math.max(0, categoriasCount));
  return COLUMN_ICON_ORDER.slice(0, tamanho);
}

export function ColumnIcon({
  name,
  className,
  style,
}: {
  name: string | null | undefined;
  className?: string;
  style?: CSSProperties;
}) {
  const Icon = columnIconComponent(name);
  if (!Icon) return null;
  return <Icon className={className} style={style} aria-hidden />;
}
