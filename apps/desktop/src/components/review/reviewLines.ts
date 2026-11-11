import type { ExecutionReview } from '@orbi/contracts';

type Env = NonNullable<ExecutionReview['environment']>[number];

/** What "Corrigir agora" says for the developer: the Orbi then leads the fix, with approvals. */
export function fixMessage(e: Env): string {
  return `Vamos corrigir de vez o problema "${e.sintoma}" do ${e.playbook}${e.raiz ? ` (${e.raiz})` : ''}. Me guie passo a passo; o que mudar algo, peça antes.`;
}

/** The quiet line about ideas kept: no card, no question. */
export function ideasLine(ideas: ExecutionReview['ideas']): string | undefined {
  const n = ideas?.length ?? 0;
  if (n === 0) return undefined;
  return n === 1 ? '1 ideia de melhoria guardada no Cérebro (não muda nada agora).' : `${n} ideias de melhoria guardadas no Cérebro (não mudam nada agora).`;
}

/** What the review let change, in words: "mudar só os passos banco, tasks (a execução falhou)". */
export function changeLine(c: NonNullable<ExecutionReview['change']>[number]): string {
  return `${c.playbook}: mudar ${c.steps.length ? `só ${c.steps.length === 1 ? 'o passo' : 'os passos'} ${c.steps.join(', ')}` : 'o mínimo'} (${c.why})`;
}
