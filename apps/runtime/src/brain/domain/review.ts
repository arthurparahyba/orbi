/**
 * What the runtime checks at the end of an execution, without the model: steps given as done
 * whose tool failed, and an esteira's configuration that keeps data from flowing (a map to a
 * parameter the procedure does not have, a step that asks what the esteira already gives, a
 * fixed value that an earlier stage hands over). Pure rules; review/review.ts applies them.
 */
import type { Playbook, PlaybookRun } from './types.ts';
import type { Pipeline, PipelineInputDef } from './pipelines.ts';
import { playbookParams } from './playbooks.ts';

/** "passo entregar foi dado como feito, mas show_ui falhou". */
export function stepClaimProblems(run: Pick<PlaybookRun, 'steps' | 'deviations'>): string[] {
  const out: string[] = [];
  for (const s of run.steps) {
    if (s.status !== 'done') continue;
    const failed = [...new Set(run.deviations.filter((d) => d.kind === 'falha' && !d.recovered && d.step === s.id).map((d) => d.tool ?? 'uma ferramenta'))];
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
  const steps = new Set(run.deviations.filter((d) => d.kind === 'falha' && d.tool === 'show_ui').map((d) => d.step ?? ''));
  return [...steps]
    .filter((step) => run.actions.some((a) => a.tool === 'run_script' && (a.step ?? '') === step))
    .map((step) =>
      `${step ? `o passo ${step}` : 'a execução'} mostrou a tabela copiando à mão a saída do script para o show_ui, que falhou: ` +
      'faça o script imprimir o componente inteiro e o passo usar run_script com show: true (vai direto para a conversa).',
    );
}

export interface ConfigProblem {
  stage: string;
  playbook: string;
  text: string;
}

const ASKS = /ask_developer|\bpergunt(ar|e|a)\b|n[aã]o assumir/i;
/** "Se o lock aparecer, parar e perguntar": what to do when something goes wrong, not asking for data. */
const CONDITION = /(^|\s)(se|caso|quando|s[oó] se|if)\s/i;

/** Whether a step asks the developer for something every time (not only when something goes wrong). */
export function asksAlways(how: string): boolean {
  return how
    .split(/\.(?:\s|$)|[;\n]+/)
    .some((clause) => {
      const m = ASKS.exec(clause);
      return !!m && !CONDITION.test(clause.slice(0, m.index));
    });
}

/**
 * Problems of an esteira's configuration. With `delivered` (stage id → what it handed over in
 * a run), also flags steps that write by hand a value an earlier stage delivers.
 */
export function pipelineConfigProblems(
  p: Pick<Pipeline | PipelineInputDef, 'stages'> & { inputs?: Array<{ name: string }> },
  playbook: (name: string) => Playbook | undefined,
  delivered: Record<string, Record<string, string>> = {},
): ConfigProblem[] {
  const out: ConfigProblem[] = [];
  const earlierOutputs: string[] = [];
  const earlierValues: Array<{ stage: string; name: string; value: string }> = [];
  p.stages.forEach((stage, i) => {
    for (const option of stage.options) {
      const pb = playbook(option.playbook);
      if (!pb) continue;
      const params = playbookParams(pb);
      const add = (text: string) => out.push({ stage: stage.id, playbook: pb.name, text });
      const missing = Object.entries(option.map ?? {}).filter(([param]) => !params.includes(param));
      for (const [param, source] of missing) {
        add(`${pb.name} não recebe {{${param}}}: o dado ${source} não chega. Use {{${param}}} nos passos.`);
      }
      const upstream = [...(p.inputs ?? []).map((x) => x.name), ...earlierOutputs];
      if (i > 0 && params.length === 0 && missing.length === 0 && upstream.length > 0) {
        add(`${pb.name} não recebe nada das etapas anteriores (não há {{parâmetros}} nos passos): os dados só chegam se o modelo lembrar.`);
      }
      for (const step of pb.steps) {
        // A step that already uses a {{parameter}} receives the value: asking only if it comes empty is fine.
        if (asksAlways(step.how) && !step.how.includes('{{') && upstream.length > 0) {
          add(`passo ${step.id} de ${pb.name} pergunta ao desenvolvedor; na esteira, receba como parâmetro o que já vem de antes (${upstream.slice(0, 4).join(', ')}).`);
        }
        for (const v of earlierValues) {
          if (v.value.length >= 8 && /[/.]/.test(v.value) && step.how.includes(v.value)) {
            add(`passo ${step.id} de ${pb.name} usa o valor fixo "${v.value}", que é o ${v.name} entregue pela etapa ${v.stage}: use {{${v.name}}}.`);
          }
        }
      }
      earlierOutputs.push(...pb.outputs.map((o) => o.name));
    }
    for (const [name, value] of Object.entries(delivered[stage.id] ?? {})) earlierValues.push({ stage: stage.id, name, value });
  });
  return out;
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
