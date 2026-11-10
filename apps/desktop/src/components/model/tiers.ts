import type { ModelChoices } from '../../api';

export type Tier = 'cheap' | 'standard' | 'premium';
type Choice = ModelChoices['models'][number];

export const TIER_LABEL: Record<Tier, string> = { cheap: 'barato', standard: 'intermediário', premium: 'caro' };
export const TIER_HINT: Record<Tier, string> = {
  cheap: 'rápido e econômico, para o dia a dia',
  standard: 'equilíbrio entre custo e capacidade',
  premium: 'o mais capaz, para o que é difícil; custa mais',
};
const ORDER: Array<Tier | 'none'> = ['cheap', 'standard', 'premium', 'none'];
const GROUP: Record<Tier | 'none', string> = { cheap: 'Barato', standard: 'Intermediário', premium: 'Caro', none: 'Sem categoria' };

/** The picker's list: by cost, cheapest first; inside a group, in the provider's order. Empty groups are left out. */
export function byTier(models: Choice[]): Array<{ key: Tier | 'none'; title: string; models: Choice[] }> {
  return ORDER.map((key) => ({ key, title: GROUP[key], models: models.filter((m) => (m.tier ?? 'none') === key) })).filter((g) => g.models.length > 0);
}

/** What the chip under the message box says: the model in use, its cost and whether it is the default. */
export function pickerLabel(choices: ModelChoices | undefined, chosen: string | undefined): { model: string; tier?: string; isDefault: boolean } {
  if (!choices) return { model: chosen ?? '…', isDefault: !chosen };
  const id = chosen && choices.models.some((m) => m.id === chosen) ? chosen : choices.default;
  const tier = choices.models.find((m) => m.id === id)?.tier;
  return { model: id, ...(tier ? { tier: TIER_LABEL[tier] } : {}), isDefault: id === choices.default };
}
