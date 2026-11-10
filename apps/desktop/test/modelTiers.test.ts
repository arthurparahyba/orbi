import { describe, expect, it } from 'vitest';
import { byTier, pickerLabel } from '../src/components/model/tiers';

const choices = {
  default: 'yara-medio',
  models: [
    { id: 'yara-medio', tier: 'standard' as const, tierBy: 'voce' as const },
    { id: 'yara-max', tier: 'premium' as const, tierBy: 'plugin' as const },
    { id: 'yara-mini', tier: 'cheap' as const, tierBy: 'plugin' as const },
    { id: 'yara-code' },
  ],
};

describe('modelo da conversa', () => {
  it('a lista vai do mais barato ao mais caro, e o que não tem categoria fica por último', () => {
    expect(byTier(choices.models).map((g) => [g.title, g.models.map((m) => m.id)])).toEqual([
      ['Barato', ['yara-mini']], ['Intermediário', ['yara-medio']], ['Caro', ['yara-max']], ['Sem categoria', ['yara-code']],
    ]);
  });

  it('o chip diz o modelo em uso, o custo e se é o padrão; escolha que sumiu volta ao padrão', () => {
    expect(pickerLabel(choices, undefined)).toEqual({ model: 'yara-medio', tier: 'intermediário', isDefault: true });
    expect(pickerLabel(choices, 'yara-max')).toEqual({ model: 'yara-max', tier: 'caro', isDefault: false });
    expect(pickerLabel(choices, 'yara-code')).toEqual({ model: 'yara-code', isDefault: false });
    expect(pickerLabel(choices, 'modelo-que-saiu')).toEqual({ model: 'yara-medio', tier: 'intermediário', isDefault: true });
  });
});
