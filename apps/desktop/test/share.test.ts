import { describe, expect, it } from 'vitest';
import { counts } from '../src/views/brain/PlaybookShare';
import type { ShareProcedure } from '../src/api';

const seen = (c: Partial<ShareProcedure['counts']>): ShareProcedure => ({
  name: 'p', types: [], secrets: [], learnings: 0, leftBehind: [], facts: [],
  counts: { steps: 1, scripts: 0, inputs: 0, outputs: 0, ...c },
});

describe('os números do pacote, na linha que a pessoa lê antes de exportar', () => {
  it('conta o que existe, no singular e no plural', () => {
    expect(counts(seen({ steps: 6, inputs: 2, outputs: 1, scripts: 3 }))).toBe('6 passos, 2 entradas, 1 entrega, 3 scripts');
    expect(counts(seen({ steps: 1, inputs: 1 }))).toBe('1 passo, 1 entrada');
  });

  it('não escreve zero: um procedimento sem script não diz "0 scripts"', () => {
    expect(counts(seen({ steps: 2 }))).toBe('2 passos');
  });
});
