import type { PlaybookRun } from '../../../../brain/domain/types.ts';
import { workedAround } from '../../../../brain/domain/levels.ts';

/**
 * What the review learns from a run, without touching the database (documentos 19 and 26): a
 * step given as done whose tool failed, an inline script that deserves a file of its own, a
 * result worth showing, and a value worth becoming an input's default.
 *
 * `brain/domain/review.ts` kept the esteira validation, which belongs to the brain, not here.
 */

/** "passo entregar foi dado como feito, mas show_ui falhou". */
export function stepClaimProblems(run: Pick<PlaybookRun, 'steps' | 'deviations'>): string[] {
  const out: string[] = [];
  for (const s of run.steps) {
    if (s.status !== 'done') continue;
    // A known problem got past with its known solution is not a false claim.
    const failed = [...new Set(run.deviations.filter((d) => d.kind === 'falha' && !d.recovered && d.step === s.id && !workedAround(d, run.steps)).map((d) => d.tool ?? 'uma ferramenta'))];
    if (failed.length) out.push(`passo ${s.id} foi dado como feito${s.note ? ` ("${s.note.slice(0, 80)}")` : ''}, mas ${failed.join(' e ')} falhou`);
  }
  return out;
}

/**
 * Inline Python (`python3 -c`) is rewritten every run, so it never becomes a known action and
 * always asks: each step that used it should keep the code as a procedure script (run_script).
 */
export function inlineScriptSuggestions(run: Pick<PlaybookRun, 'actions'>): string[] {
  const steps = new Map<string, number>();
  for (const a of run.actions) {
    if (a.tool !== 'run_command' || !/^run_command python3 (?:-\S+ )*-c /.test(a.fingerprint)) continue;
    const key = a.step ?? '';
    steps.set(key, (steps.get(key) ?? 0) + 1);
  }
  return [...steps].map(([step, n]) =>
    `${step ? `o passo ${step}` : 'a execução'} rodou Python escrito na hora (python3 -c${n > 1 ? `, ${n} vezes` : ''}), que pede aprovação toda vez: ` +
    'guarde esse código como script do procedimento (scripts, lendo os dados de sys.argv) e faça o passo usar run_script.',
  );
}

/**
 * show_ui that failed (even if fixed right after) in a step that ran a script: the model copied
 * the component by hand. The script should print it and run with show: true.
 */
export function showSuggestions(run: Pick<PlaybookRun, 'actions' | 'deviations'>): string[] {
  const steps = new Set(run.deviations.filter((d) => (d.kind === 'falha' || d.kind === 'chamada') && d.tool === 'show_ui').map((d) => d.step ?? ''));
  return [...steps]
    .filter((step) => run.actions.some((a) => a.tool === 'run_script' && (a.step ?? '') === step))
    .map((step) =>
      `${step ? `o passo ${step}` : 'a execução'} mostrou a tabela copiando à mão a saída do script para o show_ui, que falhou: ` +
      'faça o script imprimir o componente inteiro e o passo usar run_script com show: true (vai direto para a conversa).',
    );
}

/**
 * Inputs without a default that got the same value in the recent deliveries: suggest keeping
 * it as the default, so the Orbi stops asking.
 */
export function defaultSuggestions(inputs: Array<{ name: string; default?: string }>, recent: Array<Record<string, string>>, min = 2): Array<{ input: string; value: string; times: number }> {
  const out: Array<{ input: string; value: string; times: number }> = [];
  for (const i of inputs) {
    if (i.default) continue;
    const values = recent.map((r) => r[i.name]).filter((v): v is string => !!v);
    if (values.length < min) continue;
    const same = values.filter((v) => v === values[0]).length;
    if (same === values.length) out.push({ input: i.name, value: values[0], times: same });
  }
  return out;
}
