import { describe, expect, it } from 'vitest';
import { avgResponse, tokens, usd } from '../src/views/autonomy/format';

describe('formatos do uso', () => {
  it('dólares com casas suficientes para valores pequenos', () => {
    expect(usd(0)).toBe('US$ 0,00');
    expect(usd(0.0042)).toBe('US$ 0,0042');
    expect(usd(0.125)).toBe('US$ 0,125');
    expect(usd(12.5)).toBe('US$ 12,50');
  });
  it('tokens compactos a partir de 10 mil', () => {
    expect(tokens(1200)).toBe('1.200');
    expect(tokens(15_300)).toMatch(/^15,3\s?mil$/);
  });
  it('resposta média por turno', () => {
    expect(avgResponse({ modelMs: 0, turns: 0 })).toBe('—');
    expect(avgResponse({ modelMs: 1640, turns: 2 })).toBe('820 ms');
    expect(avgResponse({ modelMs: 2400, turns: 2 })).toBe('1,2 s');
  });
});
