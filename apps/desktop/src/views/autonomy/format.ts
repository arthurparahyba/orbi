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

/** Typing a credential name: lower case, no accents, spaces become "-" (the shape {{segredo:nome}} accepts). */
export function toSecretName(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._/@-]/g, '').slice(0, 128);
}

/** Why a credential name can't be used, or undefined. */
export function secretNameProblem(name: string, taken: string[]): string | undefined {
  if (!/^[a-z0-9]/.test(name)) return 'Comece com uma letra ou número.';
  if (taken.includes(name)) return 'Já existe uma credencial com esse nome: use "Trocar valor" nela.';
  return undefined;
}
