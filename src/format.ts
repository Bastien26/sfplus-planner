import { isFluid } from "./data";

export const fmt = (n: number, digits = 2) => n.toLocaleString("fr-FR", { maximumFractionDigits: digits });
export const fmtUnit = (item: string) => (isFluid(item) ? " m³" : "");
export const fmtRate = (n: number, item: string) => `${fmt(n)}${fmtUnit(item)}/min`;
export const fmtPct = (clock: number) => `${fmt(clock * 100, 1)} %`;
export const fmtMW = (n: number) => `${fmt(n, n < 10 ? 2 : 1)} MW`;

/** Parses "7,5" or "7.5"; returns null for empty or invalid input. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
