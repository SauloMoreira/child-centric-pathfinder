// Mapeamento dos tokens de cor de coluna para classes do tema.
// Mantém aparência sóbria com contraste seguro.

export type WorkspaceColorToken =
  | "neutral"
  | "green"
  | "blue"
  | "amber"
  | "burgundy"
  | "purple"
  | "slate"
  | "rose";

export const COLOR_TOKENS: {
  value: WorkspaceColorToken;
  label: string;
  swatch: string;
  headerBg: string;
  border: string;
}[] = [
  {
    value: "neutral",
    label: "Neutro",
    swatch: "bg-muted",
    headerBg: "bg-muted/40",
    border: "border-l-border",
  },
  {
    value: "green",
    label: "Verde suave",
    swatch: "bg-emerald-500/70",
    headerBg: "bg-emerald-500/10",
    border: "border-l-emerald-500",
  },
  {
    value: "blue",
    label: "Azul suave",
    swatch: "bg-sky-500/70",
    headerBg: "bg-sky-500/10",
    border: "border-l-sky-500",
  },
  {
    value: "amber",
    label: "Âmbar suave",
    swatch: "bg-amber-500/70",
    headerBg: "bg-amber-500/10",
    border: "border-l-amber-500",
  },
  {
    value: "burgundy",
    label: "Bordô suave",
    swatch: "bg-rose-800/70",
    headerBg: "bg-rose-800/10",
    border: "border-l-rose-800",
  },
  {
    value: "purple",
    label: "Roxo suave",
    swatch: "bg-violet-500/70",
    headerBg: "bg-violet-500/10",
    border: "border-l-violet-500",
  },
  {
    value: "slate",
    label: "Cinza azulado",
    swatch: "bg-slate-500/70",
    headerBg: "bg-slate-500/10",
    border: "border-l-slate-500",
  },
  {
    value: "rose",
    label: "Rosa discreto",
    swatch: "bg-pink-400/70",
    headerBg: "bg-pink-400/10",
    border: "border-l-pink-400",
  },
];

export function getColorClasses(token: string) {
  return COLOR_TOKENS.find((c) => c.value === token) ?? COLOR_TOKENS[0];
}
