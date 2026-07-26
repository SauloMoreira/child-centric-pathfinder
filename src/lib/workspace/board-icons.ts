import {
  LayoutGrid,
  GraduationCap,
  HeartPulse,
  Baby,
  Accessibility,
  PersonStanding,
  Bus,
  UtensilsCrossed,
  Shirt,
  ShieldCheck,
  HeartHandshake,
  Home,
  Scale,
  School,
  Trophy,
  Palette,
  Brain,
  Puzzle,
  Heart,
  Handshake,
  Siren,
  IdCard,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export type BoardIconId =
  | "layout"
  | "educacao"
  | "saude"
  | "primeira-infancia"
  | "deficiencia"
  | "adolescencia"
  | "transporte"
  | "alimentacao"
  | "vestuario"
  | "seguranca"
  | "familia"
  | "lar"
  | "processo"
  | "escola"
  | "esporte"
  | "cultura"
  | "saude-mental"
  | "brinquedos"
  | "acolhimento"
  | "rede"
  | "urgencia"
  | "documentacao"
  | "risco";

export const BOARD_ICONS: { id: BoardIconId; label: string; Icon: LucideIcon }[] = [
  { id: "layout", label: "Padrão", Icon: LayoutGrid },
  { id: "educacao", label: "Educação", Icon: GraduationCap },
  { id: "saude", label: "Saúde", Icon: HeartPulse },
  { id: "primeira-infancia", label: "Primeira infância", Icon: Baby },
  { id: "deficiencia", label: "Deficiência", Icon: Accessibility },
  { id: "adolescencia", label: "Adolescência", Icon: PersonStanding },
  { id: "transporte", label: "Transporte", Icon: Bus },
  { id: "alimentacao", label: "Alimentação", Icon: UtensilsCrossed },
  { id: "vestuario", label: "Vestuário", Icon: Shirt },
  { id: "seguranca", label: "Segurança", Icon: ShieldCheck },
  { id: "familia", label: "Família", Icon: HeartHandshake },
  { id: "lar", label: "Lar", Icon: Home },
  { id: "processo", label: "Processo judicial", Icon: Scale },
  { id: "escola", label: "Escola", Icon: School },
  { id: "esporte", label: "Esporte e lazer", Icon: Trophy },
  { id: "cultura", label: "Cultura e arte", Icon: Palette },
  { id: "saude-mental", label: "Saúde mental", Icon: Brain },
  { id: "brinquedos", label: "Brinquedos", Icon: Puzzle },
  { id: "acolhimento", label: "Acolhimento", Icon: Heart },
  { id: "rede", label: "Rede de proteção", Icon: Handshake },
  { id: "urgencia", label: "Urgência", Icon: Siren },
  { id: "documentacao", label: "Documentação civil", Icon: IdCard },
  { id: "risco", label: "Alerta / risco", Icon: ShieldAlert },
];

const BOARD_ICON_MAP = new Map(BOARD_ICONS.map((i) => [i.id, i]));

export function getBoardIcon(id: string | null | undefined): LucideIcon {
  if (!id) return LayoutGrid;
  return BOARD_ICON_MAP.get(id as BoardIconId)?.Icon ?? LayoutGrid;
}

export function isValidBoardIcon(id: string | null | undefined): id is BoardIconId {
  return !!id && BOARD_ICON_MAP.has(id as BoardIconId);
}
