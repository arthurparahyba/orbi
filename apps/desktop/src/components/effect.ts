import type { ActionEffect } from '@orbi/contracts';

/** How an action's reach reads on cards and on the Cérebro screen. */
export const EFFECT_LABEL: Record<ActionEffect, { tag: string; note: string }> = {
  leitura: { tag: 'só lê', note: 'não muda nada' },
  local: { tag: 'nesta máquina', note: 'muda arquivos aqui, não publica nada' },
  publica: { tag: 'publica para fora', note: 'outras pessoas veem; não se desfaz sozinho' },
  apaga: { tag: 'apaga', note: 'não tem volta' },
};

export const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: 'N1 · Aprendendo', 2: 'N2 · Assistido', 3: 'N3 · Autônomo' };
export const LEVEL_HINT: Record<1 | 2 | 3, string> = {
  1: 'pede cada ação que muda algo',
  2: 'repete o que já deu certo; pede o que é novo e o que publica',
  3: 'repete tudo que já deu certo; só pergunta o que é novo',
};
