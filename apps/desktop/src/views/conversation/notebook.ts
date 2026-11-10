import type { ConversationNotebook } from '../../api';

type Step = ConversationNotebook['steps'][number];
type Procedure = NonNullable<ConversationNotebook['procedure']>;

/** How a step shows in the panel: a mark, its tone and, when it waits, why. */
export function stepMark(status: Step['status']): { mark: 'done' | 'wait' | 'fail' | 'now' | 'todo' | 'skip'; hint?: string } {
  switch (status) {
    case 'done': return { mark: 'done' };
    case 'waiting': return { mark: 'wait', hint: 'esperando você' };
    case 'failed': return { mark: 'fail', hint: 'não deu certo' };
    case 'running': return { mark: 'now', hint: 'fazendo agora' };
    case 'skipped': return { mark: 'skip', hint: 'pulado' };
    default: return { mark: 'todo' };
  }
}

/** The autonomy line of a learned procedure: where it is and what it takes to go up. */
export function levelLine(p: Procedure): string {
  const now = `N${p.level}`;
  if (!p.nextLevel) return p.level === p.levelMax && p.levelMax < 3 ? `${now} · você limitou até aqui` : `${now} · faço sozinho o que já conheço`;
  const runs = p.nextLevel.cleanRunsLeft === 1 ? '1 execução sem correção' : `${p.nextLevel.cleanRunsLeft} execuções seguidas sem correção`;
  return `${now} agora · N${p.nextLevel.level} depois de ${runs}`;
}

/** What each level means, for the three boxes. */
export const LEVELS: Array<{ level: 1 | 2 | 3; text: string }> = [
  { level: 1, text: 'Peço antes de cada ação nova' },
  { level: 2, text: 'Repito sozinho o que já deu certo; peço o que publica' },
  { level: 3, text: 'Repito sozinho, até o que publica' },
];

/** Runs of a procedure, in words. */
export function usesLine(p: Procedure): string {
  if (p.uses === 0) return 'Ainda não rodou de verdade (só o ensaio)';
  return `${p.uses} ${p.uses === 1 ? 'execução' : 'execuções'} · ${p.successes} deram certo`;
}

/** A learned step reads as a sentence: "Abrir o portal de {{mfe}}" → "Abrir o portal de ‹mfe›". */
export const readable = (label: string): string => label.replace(/\{\{\s*([^}]+?)\s*\}\}/g, '‹$1›');
