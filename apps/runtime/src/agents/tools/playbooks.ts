import { defineSkill, usePersistentState, useSkill, useTool } from '@flue/runtime';
import * as v from 'valibot';
import { services } from '../../services.ts';
import type { ActiveRun, AgentContext } from '../context.ts';

/** The playbook running in this conversation, kept across turns. */
export function useActiveRun() {
  return usePersistentState<ActiveRun>('activeRun', null);
}

/**
 * Playbooks: mounted as Agent Skills (the catalog line is cheap; the model
 * activates one to read its steps when a request matches its description),
 * plus the two tools that run one as a live checklist.
 */
export function usePlaybooks(ctx: AgentContext) {
  const { brain } = services();

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

  for (const pb of brain.playbooks()) {
    useSkill(
      defineSkill({
        name: pb.name,
        description: `${pb.description}${pb.appliesTo ? ` (aplica a: ${pb.appliesTo})` : ''}`,
        instructions: [
          pb.instructions,
          '',
          `Autonomia: ${pb.autonomy}. Usado ${pb.uses}x, ${pb.successes} com sucesso. Comece com playbook_start {"name":"${pb.name}"}.`,
          '',
          '## Passos',
          ...pb.steps.map((s, i) => `${i + 1}. [${s.id}] ${s.label} — ${s.how}`),
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
      const run = brain.startRun(pb.name, ctx.conversationId, data.params);
      ctx.setActiveRun({ runId: run.id, playbook: pb.name, autonomy: pb.autonomy });
      showRun(run.id);
      return { output: { runId: run.id, autonomy: pb.autonomy, steps: run.steps.map((s) => ({ id: s.id, label: s.label, how: s.how })) } };
    },
  });

  useTool({
    name: 'playbook_step',
    description: 'Report progress of the running playbook: mark a step running, done, failed, waiting (for CI, approval, a follow-up) or skipped, with a short note.',
    input: v.object({ stepId: v.string(), status: v.picklist(['running', 'done', 'failed', 'waiting', 'skipped']), note: v.optional(v.string()) }),
    async run({ data }) {
      if (!ctx.activeRun) return { output: { error: 'nenhum playbook em execução' } };
      const run = brain.updateRunStep(ctx.activeRun.runId, data.stepId, data.status, data.note);
      showRun(run.id);
      if (run.status === 'done' || run.status === 'failed') ctx.setActiveRun(null);
      return { output: { runStatus: run.status } };
    },
  });
}
