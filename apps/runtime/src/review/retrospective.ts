import type { PlaybookRun } from '../brain/domain/types.ts';
import type { RunCall } from '../brain/domain/run-calls.ts';

/** The step as the developer sees it in the card: "3 · Filtrar". */
const name = (run: PlaybookRun, step: string | null) => {
  const at = run.steps.findIndex((s) => s.id === step);
  return at < 0 ? 'fora dos passos' : `${at + 1} · ${run.steps[at]!.label}`;
};

const short = (text: string, max = 120) => text.replace(/\s+/g, ' ').trim().slice(0, max);
const what = (c: RunCall) => `${c.tool}${c.summary ? ` (${short(c.summary, 60)})` : ''}`;

/**
 * What each step went through, read from the registry of the execution (docs/funcionalidades/24),
 * so a correction is written from what actually happened and not from the model's memory: the
 * calls that failed in a step and, when a later call in the same step worked, what worked instead
 * (docs/funcionalidades/25, the retrospective). A step that went well says nothing.
 */
export function retrospective(run: PlaybookRun, calls: readonly RunCall[]): string[] {
  const steps = [...new Set(calls.filter((c) => c.status === 'erro').map((c) => c.step))];
  const lines: string[] = [];
  for (const step of steps) {
    const mine = calls.filter((c) => c.step === step);
    const failed = mine.filter((c) => c.status === 'erro');
    const last = mine.lastIndexOf(failed.at(-1)!);
    const worked = mine.slice(last + 1).find((c) => c.status === 'ok' && c.tool !== 'playbook_step');
    const tried = [...new Map(failed.map((c) => [what(c), c])).values()]
      .map((c) => `${what(c)} falhou${c.error ? `: ${short(c.error)}` : ''}`)
      .join('; ');
    lines.push(`passo ${name(run, step)}: ${tried}${worked ? `. Depois funcionou com ${what(worked)}` : '. Nada funcionou depois, no mesmo passo'}`);
  }
  return lines;
}
