import { defineSkill, usePersistentState, useSkill, useTool } from '@flue/runtime';
import * as v from 'valibot';
import { services } from '../../services.ts';
import { redact } from '../../vault/vault.ts';
import type { ActiveRun, AgentContext } from '../context.ts';
import { LEVEL_NAMES } from '../../brain/domain/levels.ts';

/** The playbook running in this conversation, kept across turns. */
export function useActiveRun() {
  return usePersistentState<ActiveRun>('activeRun', null);
}

/**
 * Playbooks: the most used are mounted as Agent Skills (one catalog line each;
 * the model activates one to read its steps), plus the two tools that run one
 * as a live checklist. The catalog stays small however many playbooks exist:
 * the rest are found by search (playbook_similar) and started by name. The
 * order (uses, then name) is stable, so the catalog rarely changes between
 * turns and the prompt cache holds.
 */
export function skillCatalog<T extends { name: string; uses: number }>(playbooks: T[], size: number): T[] {
  return [...playbooks].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)).slice(0, Math.max(0, size));
}

export function usePlaybooks(ctx: AgentContext) {
  const { brain, vault, pipelines, toolOutcomes } = services();

  const showRun = (runId: string) => {
    const run = brain.run(runId);
    if (!run) return;
    ctx.ui({
      component: 'stepper',
      id: `run-${run.id}`,
      title: run.playbook,
      status: run.status,
      steps: run.steps.map((s) => ({ id: s.id, label: s.label, status: s.status, note: s.note })),
    });
  };

  for (const pb of skillCatalog(brain.playbooks(), services().config.skillCatalogSize)) {
    useSkill(
      defineSkill({
        name: pb.name,
        description: `${pb.description}${pb.appliesTo ? ` (aplica a: ${pb.appliesTo})` : ''}`,
        instructions: [
          pb.instructions,
          '',
          `Autonomia: ${pb.autonomy === 'observe' ? 'só observar' : LEVEL_NAMES[pb.level]}. Usado ${pb.uses}x, ${pb.successes} com sucesso. Comece com playbook_start {"name":"${pb.name}"}.`,
          '',
          '## Passos',
          ...pb.steps.map((s, i) => `${i + 1}. [${s.id}] ${s.label} — ${s.how}`),
          ...(pb.outputs.length
            ? ['', '## Entrega (registre com outputs no playbook_step do último passo)', ...pb.outputs.map((o) => `- ${o.name}: ${o.description}`)]
            : []),
        ].join('\n'),
      }),
    );
  }

  useTool({
    name: 'playbook_start',
    description:
      'Start running a learned playbook. Shows its steps to the developer as a live checklist. Then report each step with playbook_step. Pass the values of its {{parameters}} (e.g. {"mfe": "novo-front", "versao": "2.5.0"}); credentials ({{segredo:…}}) are not parameters.',
    input: v.object({ name: v.string(), target: v.optional(v.string()), params: v.optional(v.record(v.string(), v.string())) }),
    async run({ data }) {
      const pb = brain.playbook(data.name);
      if (!pb) return { output: { error: `playbook não existe: ${data.name}`, available: brain.playbooks().map((p) => p.name) } };
      // In an esteira, stages go in order: a later stage does not start while the current is open.
      const outOfOrder = pipelines.engine.startProblem(ctx.conversationId, pb.name);
      if (outOfOrder) return { output: { error: outOfOrder } };
      const run = brain.startRun(pb.name, ctx.conversationId, data.params);
      ctx.setActiveRun({ runId: run.id, playbook: pb.name, autonomy: pb.autonomy });
      pipelines.engine.runStarted(run);
      showRun(run.id);
      const steps = run.steps.map((s) => ({ id: s.id, label: s.label, how: s.how }));
      const level = pb.autonomy === 'observe' ? 'só observar' : LEVEL_NAMES[pb.level];
      if (!pb.outputs.length) return { output: { runId: run.id, autonomy: level, steps } };
      const outputs = pb.outputs.map((o) => ({ name: o.name, description: o.description }));
      return { output: { runId: run.id, autonomy: level, steps, outputs, note: 'Ao terminar, registre os valores com outputs no playbook_step.' } };
    },
  });

  useTool({
    name: 'playbook_step',
    description:
      'Report progress of the running playbook: mark a step running, done, failed, waiting (for CI, approval, a follow-up) or skipped, with a short note. ' +
      'With `outputs`, record what the playbook hands over (only the names it declares, e.g. {"versao": "2.5.0", "pr_url": "…"}): the next stage of an esteira and agents use them. Never credentials.',
    input: v.object({
      stepId: v.string(),
      status: v.picklist(['running', 'done', 'failed', 'waiting', 'skipped']),
      note: v.optional(v.string()),
      outputs: v.optional(v.record(v.string(), v.pipe(v.string(), v.maxLength(2000)))),
    }),
    async run({ data }) {
      if (!ctx.activeRun) return { output: { error: 'nenhum playbook em execução' } };
      // A step whose last tool failed is not done: fix it, or say it failed or was skipped.
      const last = toolOutcomes.lastIn(ctx.conversationId);
      if (data.status === 'done' && last?.failed) {
        return {
          output: {
            error: `o passo ${data.stepId} não pode ser dado como feito: a última ferramenta (${last.tool}) falhou${last.error ? ` (${last.error.slice(0, 200)})` : ''}.`,
            hint: 'Corrija e tente de novo, ou marque o passo como failed ou skipped com uma nota do que aconteceu.',
          },
        };
      }
      let outputs = data.outputs;
      if (outputs && Object.keys(outputs).length) {
        // A value that happens to be a credential never gets stored as a result.
        const secrets = (await Promise.all(vault.list().map((x) => vault.get(x.name)))).filter((x): x is string => !!x);
        outputs = Object.fromEntries(Object.entries(outputs).map(([k, val]) => [k, redact(val, secrets)]));
      }
      let run;
      try {
        run = brain.updateRunStep(ctx.activeRun.runId, data.stepId, data.status, data.note, outputs);
      } catch (error) {
        return { output: { error: error instanceof Error ? error.message : String(error) } };
      }
      showRun(run.id);
      if (run.status !== 'done' && run.status !== 'failed') {
        // The last step was given but some before it are still open: the run does not end until they are.
        const last = run.steps.at(-1);
        const open = run.steps.filter((s) => s.status === 'pending' || s.status === 'running').map((s) => s.id);
        if (last?.id === data.stepId && last.status === 'done' && open.length) {
          return {
            output: {
              runStatus: run.status,
              pendentes: open,
              hint: `O procedimento só termina quando todos os passos fecham. Marque ${open.join(', ')} com playbook_step (done se foi feito, skipped se não precisou), com uma nota. Sem isso, a esteira não segue.`,
            },
          };
        }
        return { output: { runStatus: run.status } };
      }
      ctx.setActiveRun(null);
      // The level and the review come when the turn ends (review/review.ts), after every failure is in.
      // Part of an esteira: the engine says what comes next (the next stage, or wait for the developer).
      const next = pipelines.engine.runFinished(run);
      return { output: { runStatus: run.status, ...(next ? { esteira: next } : {}) } };
    },
  });
}
