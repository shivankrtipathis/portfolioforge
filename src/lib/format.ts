// Number formatting helpers used across the UI.

export function fmtCurrency(v: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (!isFinite(v)) return "—";
  const { compact = true, decimals } = opts;
  const abs = Math.abs(v);
  if (compact) {
    if (abs >= 1e9) return `${sign(v)}$${(abs / 1e9).toFixed(decimals ?? 2)}B`;
    if (abs >= 1e6) return `${sign(v)}$${(abs / 1e6).toFixed(decimals ?? 2)}M`;
    if (abs >= 1e3) return `${sign(v)}$${(abs / 1e3).toFixed(decimals ?? 0)}K`;
    return `${sign(v)}$${abs.toFixed(decimals ?? 0)}`;
  }
  return `${sign(v)}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 0,
  })}`;
}

function sign(v: number): string {
  return v < 0 ? "-" : "";
}

export function fmtPct(v: number, decimals = 1): string {
  if (!isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}

export function fmtMultiple(v: number, decimals = 2): string {
  if (!isFinite(v) || isNaN(v)) return "—";
  return `${v.toFixed(decimals)}x`;
}

export function fmtNumber(v: number, decimals = 0): string {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Parse a user-typed currency/number string into a number. */
export function parseNumber(s: string): number {
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
