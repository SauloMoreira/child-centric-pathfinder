// Cálculo de idade determinístico no fuso America/Sao_Paulo.

const TZ = "America/Sao_Paulo";

function ymdInTz(date: Date, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

/** Idade em anos completos de `dob` na data de referência `ref`. */
export function calculateAgeAtDate(dob: Date | string, ref: Date | string = new Date()): number {
  const b = typeof dob === "string" ? new Date(dob + "T00:00:00") : dob;
  const r = typeof ref === "string" ? new Date(ref + "T00:00:00") : ref;
  const rd = ymdInTz(r, TZ);
  const bd = ymdInTz(b, TZ);
  let age = rd.y - bd.y;
  if (rd.m < bd.m || (rd.m === bd.m && rd.d < bd.d)) age -= 1;
  return age;
}

export function isMinorAtDate(dob: Date | string, ref?: Date): boolean {
  return calculateAgeAtDate(dob, ref) < 18;
}

export function isAdultAtDate(dob: Date | string, ref?: Date): boolean {
  return calculateAgeAtDate(dob, ref) >= 18;
}
