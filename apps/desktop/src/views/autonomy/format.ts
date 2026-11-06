import type { UsageTotals } from '../../api';

const int = new Intl.NumberFormat('pt-BR');
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** US$ with enough decimals for small amounts (US$ 0,0042) and two above a dollar. */
export function usd(value: number): string {
  const digits = value === 0 ? 2 : value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return `US$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export const tokens = (n: number) => (n >= 10_000 ? compact.format(n) : int.format(n));

/** Average wait for the model per turn: "1,2 s" or "820 ms". */
export function avgResponse(t: Pick<UsageTotals, 'modelMs' | 'turns'>): string {
  if (!t.turns) return '—';
  const ms = t.modelMs / t.turns;
  return ms >= 1000 ? `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : `${Math.round(ms)} ms`;
}
