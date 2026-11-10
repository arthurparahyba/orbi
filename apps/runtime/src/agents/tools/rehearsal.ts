import { useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';
import { REHEARSAL } from '../../brain/domain/rehearsal.ts';

/**
 * The rehearsal (docs/funcionalidades/18): taught a procedure, the Orbi first tries it out with
 * the developer, step by step, and ends agreeing on where it starts and ends. Only then the
 * learning card. The actions themselves go through their own tools and the gate (in a rehearsal,
 * what publishes always asks); these tools only keep the checklist and the agreement.
 */
export const rehearsal = defineCapability({ name: 'rehearsal', needs: ['brain', 'inbox'], register: useRehearsal });

function useRehearsal(ctx: AgentContext, { brain, inbox }: Deps<'brain' | 'inbox'>) {
  const show = (runId: string) => {
    const run = brain.run(runId);
    if (!run) return;
    ctx.ui({
      component: 'stepper',
      id: `run-${run.id}`,
      title: `Ensaio: ${run.params.objetivo ?? ''}`,
      status: run.status,
      steps: run.steps.map((s) => ({ id: s.id, label: s.label, status: s.status, note: s.note })),
    });
  };
  const current = () => (ctx.activeRun?.playbook === REHEARSAL ? ctx.activeRun.runId : null);

  useTool({
    name: 'rehearsal_start',
    description:
      'Start a rehearsal: when the developer explains a procedure, try it out with them before learning it. Shows a checklist that grows as you try each part. ' +
      'Then do each part with the usual tools (browser, terminal), reporting it with rehearsal_step, and end with rehearsal_finish.',
    input: v.object({ goal: v.pipe(v.string(), v.description('What the explained procedure is for, in a few words')) }),
    async run({ data }) {
      if (ctx.activeRun) return { output: { error: `já há algo em execução nesta conversa (${ctx.activeRun.playbook}); termine antes de ensaiar` } };
      const run = brain.execution.startRehearsal(ctx.conversationId, data.goal);
      ctx.setActiveRun({ runId: run.id, playbook: REHEARSAL, autonomy: 'ask' });
      show(run.id);
      return { output: { runId: run.id, note: 'Ensaio começou. O que publica sempre pede aprovação. Relate cada parte com rehearsal_step.' } };
    },
  });

  useTool({
    name: 'rehearsal_step',
    description:
      'Report a part of the rehearsal: a new step (by its label) or an update of one (by id): running, done, failed, waiting (login approval, a deploy) or skipped, with a short note of what you found ("o botão se chama Criar release, não Nova versão").',
    input: v.object({
      id: v.optional(v.string()),
      label: v.string(),
      status: v.picklist(['running', 'done', 'failed', 'waiting', 'skipped']),
      note: v.optional(v.string()),
    }),
    async run({ data }) {
      const runId = current();
      if (!runId) return { output: { error: 'nenhum ensaio em andamento; comece com rehearsal_start' } };
      try {
        const run = brain.execution.rehearsalStep(runId, data);
        show(run.id);
        return { output: { steps: run.steps.map((s) => ({ id: s.id, label: s.label, status: s.status })) } };
      } catch (error) {
        return { output: { error: error instanceof Error ? error.message : String(error) } };
      }
    },
  });

  useTool({
    name: 'rehearsal_finish',
    description:
      'End the rehearsal by agreeing with the developer: when the procedure starts, what it receives each time, when it ends, what stays out, and what the rehearsal corrected in the explanation. ' +
      'Shows the agreement for the developer to confirm and ends your turn. After they confirm, propose the procedure with brain_learn and testedRun = this runId.',
    input: v.object({
      start: v.string(),
      receives: v.array(v.string()),
      end: v.string(),
      outside: v.optional(v.array(v.string())),
      corrections: v.optional(v.array(v.object({ explained: v.string(), actual: v.string() }))),
    }),
    async run({ data }) {
      const runId = current();
      if (!runId) return { output: { error: 'nenhum ensaio em andamento' } };
      const agreement = { start: data.start, receives: data.receives, end: data.end, outside: data.outside ?? [], corrections: data.corrections ?? [] };
      let run;
      try {
        run = brain.execution.finishRehearsal(runId, agreement);
      } catch (error) {
        return { output: { error: error instanceof Error ? error.message : String(error) } };
      }
      ctx.setActiveRun(null);
      show(run.id);
      const question = 'Entendi o procedimento assim. Confere?';
      const item = inbox.add({ kind: 'question', conversationId: ctx.conversationId, title: question, detail: 'Está certo\nAjustar' });
      ctx.ui({ component: 'agreement', id: `agreement-${run.id}`, runId: run.id, question, ...agreement, inboxId: item.id });
      return { output: { runId: run.id, asked: true, next: 'Quando o desenvolvedor confirmar, proponha o procedimento com brain_learn e testedRun.' }, terminate: true };
    },
  });
}
