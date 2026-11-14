import type { PlaybookRun } from '../../brain/domain/types.ts';
import { EXPENSIVE_RUN_CHARS, type RunCall } from '../../brain/domain/run-calls.ts';
import type { RunAnalyzer, RunContext } from './types.ts';

/** The step of a call, named as the developer sees it ("4 · Extrair"). */
function stepName(run: PlaybookRun, call: RunCall): string {
  const at = run.steps.findIndex((s) => s.id === call.step);
  return at < 0 ? 'fora dos passos' : `${at + 1} · ${run.steps[at]!.label}`;
}

const SIZE = (chars: number) => `${Math.round(chars / 1000)} mil caracteres`;

/**
 * Reads that cost a lot: a page read whole, an image of the screen, a long command output. They
 * are the biggest part of what a run spends, and a step can almost always read less (a small
 * `evaluate_script`, `saveTo` into a file). Only worth saying when a run read a lot in total:
 * one big read is life, a run full of them is a procedure to change.
 */
export const expensiveReads: RunAnalyzer = {
  id: 'leituras-caras',
  kind: 'melhoria',
  analyze(run: PlaybookRun, ctx: RunContext): string[] {
    const expensive = (ctx.calls ?? []).filter((c) => c.marks.includes('caro'));
    const total = expensive.reduce((sum, c) => sum + c.chars, 0);
    if (total < EXPENSIVE_RUN_CHARS) return [];
    const by = new Map<string, { chars: number; tools: Set<string> }>();
    for (const c of expensive) {
      const key = stepName(run, c);
      const got = by.get(key) ?? { chars: 0, tools: new Set<string>() };
      got.chars += c.chars;
      got.tools.add(c.tool);
      by.set(key, got);
    }
    const worst = [...by].sort((a, b) => b[1].chars - a[1].chars);
    return [
      `esta execução mandou ${SIZE(total)} ao modelo em ${expensive.length} leituras caras (${worst
        .map(([step, got]) => `passo ${step}: ${SIZE(got.chars)} com ${[...got.tools].join(', ')}`)
        .join('; ')})`,
    ];
  },
  howToFix:
    'Leitura cara: no passo que lê demais, troque a página inteira ou a imagem da tela por um `evaluate_script` pequeno que devolve só o que o passo precisa, ou grave a saída em arquivo com `saveTo` e leia dele o que importa.',
};
