import { describe, expect, it } from 'vitest';
import type { StepLearning } from '@orbi/contracts';
import { groupLearnings, learningWhen } from '../src/views/brain/learnings';

const l = (id: string, step: string | null, over: Partial<StepLearning> = {}): StepLearning => ({
  id, playbook: 'p', step, tried: 't', outcome: 'falhou', why: '', source: 'execucao', runId: null, conversationId: '', times: 1,
  createdAt: '2026-11-13T10:00:00Z', updatedAt: '2026-11-13T10:00:00Z', ...over,
});

describe('aprendizados do procedimento', () => {
  it('agrupa por passo na ordem do procedimento; o que não é de um passo vai no fim', () => {
    const steps = [{ id: 'abrir', label: 'Abrir' }, { id: 'extrair', label: 'Extrair' }];
    const groups = groupLearnings([l('1', 'extrair'), l('2', null), l('3', 'sumiu'), l('4', 'extrair')], steps);
    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([['2 · Extrair', ['1', '4']], ['O procedimento', ['2', '3']]]);
  });
  it('diz quando, de onde veio e quantas vezes', () => {
    expect(learningWhen(l('1', 'a', { times: 2, source: 'revisao' }))).toBe('13/11 · revisão · vista 2 vezes');
  });
});
