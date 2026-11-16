/**
 * An esteira's configuration that keeps data from flowing: a map to a parameter the procedure
 * does not have, a step that asks what the esteira already gives, a fixed value that an earlier
 * stage hands over. Pure rules, checked when a pipeline is defined and by the end-of-run review.
 *
 * What the review learns from a run went to the `improvement` context (judge/src/suggestions.ts).
 */
import type { Playbook, PlaybookRun } from '../../language/index.ts';
import type { Pipeline, PipelineInputDef } from './pipelines.ts';
import { playbookParams } from './playbooks.ts';
import { workedAround } from '../../contexts/trust/index.ts';

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
