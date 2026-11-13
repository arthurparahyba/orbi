import type { StepLearning } from '@orbi/contracts';

export const OUTCOME_LABEL: Record<StepLearning['outcome'], string> = { falhou: 'falhou', funcionou: 'funcionou', negado: 'negado por você', orbi: 'do Orbi' };
const SOURCE_LABEL: Record<StepLearning['source'], string> = { execucao: 'execução', revisao: 'revisão', pedido: 'pedido seu', orbi: 'diagnóstico' };

export interface LearningGroup { step: string | null; title: string; items: StepLearning[] }

/** The learnings grouped by step, in the procedure's own order; what is about no step (or a step that no longer exists) comes last. */
export function groupLearnings(learnings: readonly StepLearning[], steps: ReadonlyArray<{ id: string; label: string }>): LearningGroup[] {
  const groups: LearningGroup[] = steps
    .map((s, i) => ({ step: s.id as string | null, title: `${i + 1} · ${s.label}`, items: learnings.filter((l) => l.step === s.id) }))
    .filter((g) => g.items.length > 0);
  const known = new Set(steps.map((s) => s.id));
  const rest = learnings.filter((l) => !l.step || !known.has(l.step));
  if (rest.length) groups.push({ step: null, title: 'O procedimento', items: rest });
  return groups;
}

/** "13/11 · execução · vista 2 vezes". */
export function learningWhen(l: StepLearning): string {
  const [, m, d] = l.updatedAt.slice(0, 10).split('-');
  return `${d}/${m} · ${SOURCE_LABEL[l.source]}${l.times > 1 ? ` · vista ${l.times} vezes` : ''}`;
}
