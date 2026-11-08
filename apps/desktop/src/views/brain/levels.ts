import type { Playbook } from '../../api';

/** "N2 · Assistido", "N1 · teto", "só observar". */
export function levelPill(p: Pick<Playbook, 'level' | 'levelMax' | 'autonomy'>): string {
  if (p.autonomy === 'observe') return 'só observar';
  return p.level === p.levelMax && p.levelMax < 3 ? `N${p.level} · teto` : `N${p.level}`;
}

/** Where it stands on the way up: "1 de 3 execuções sem desvio", or what it takes. */
export function nextStep(p: Pick<Playbook, 'level' | 'levelMax' | 'cleanStreak' | 'autonomy'>, runsForN3: number): { done: number; total: number; text: string } | null {
  if (p.autonomy === 'observe' || p.level >= p.levelMax) return null;
  if (p.level === 1) return { done: 0, total: 1, text: 'Uma execução de ponta a ponta sem correção leva ao N2' };
  return { done: p.cleanStreak, total: runsForN3, text: `${p.cleanStreak} de ${runsForN3} execuções sem desvio para o N3` };
}

const WHEN = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const when = (iso: string) => WHEN.format(new Date(iso));
