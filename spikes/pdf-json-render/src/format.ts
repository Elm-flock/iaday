const nf = (min: number, max: number) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: min, maximumFractionDigits: max });
const score2 = nf(2, 2);
const num = nf(0, 2);
const pct = nf(0, 0);
export const fmtScore = (n: number) => score2.format(n);               // 0,70
export const fmtPct = (n: number) => `${pct.format(n * 100)} %`;       // 70 %
export const fmtDecimalStr = (s: string | null) => (s == null ? "-" : num.format(Number(s))); // 1.234,56
export function fmtDate(d: Date | string): string {                    // dd/mm/aaaa (UTC-3 fixed, avoids server TZ drift)
  const dt = new Date(new Date(d).getTime() - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getUTCDate())}/${p(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
}
