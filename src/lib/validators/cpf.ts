// Validação e formatação de CPF (11 dígitos + verificadores)

export function stripCpf(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function formatCpf(value: string | null | undefined): string {
  const d = stripCpf(value);
  if (d.length !== 11) return value ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function maskCpfPartial(value: string | null | undefined): string {
  const d = stripCpf(value);
  if (d.length !== 11) return "";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export function isValidCpf(value: string | null | undefined): boolean {
  const d = stripCpf(value);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const digits = d.split("").map(Number);
  let s = 0;
  for (let i = 0; i < 9; i++) s += digits[i] * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== digits[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += digits[i] * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === digits[10];
}
