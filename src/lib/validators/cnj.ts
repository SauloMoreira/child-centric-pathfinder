// Validação e formatação de número CNJ (20 dígitos, módulo 97)

export function stripCnj(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function formatCnj(value: string | null | undefined): string {
  const d = stripCnj(value);
  if (d.length !== 20) return value ?? "";
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

export function isValidCnj(value: string | null | undefined): boolean {
  const d = stripCnj(value);
  if (d.length !== 20) return false;
  // NNNNNNN-DD.AAAA.J.TR.OOOO — verificador é DD (posições 7..8)
  const seq = d.slice(0, 7);
  const dd = d.slice(7, 9);
  const rest = d.slice(9); // AAAA J TR OOOO (11 dígitos)
  // Módulo 97: n = concat(seq, rest, '00'); dv = 98 - (n mod 97)
  const base = seq + rest + "00";
  // BigInt para acomodar 20 dígitos
  const mod = Number(BigInt(base) % 97n);
  const dv = 98 - mod;
  return dv === Number(dd);
}
