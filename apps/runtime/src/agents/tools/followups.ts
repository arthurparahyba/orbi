import { useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';
import { whenLabel } from '../../followups/domain.ts';

/**
 * Wake up later in the same conversation (docs/funcionalidades/11). One follow-up per conversation:
 * a new one replaces the one waiting, and the answer says so. The scheduler delivers it
 * (followups/scheduler.ts); the prompt says every turn whether one is waiting.
 */
export const followupTools = defineCapability({ name: 'followups', needs: ['followups', 'brain'], register: useFollowupTools });

function useFollowupTools(ctx: AgentContext, { followups, brain }: Deps<'followups' | 'brain'>) {
  useTool({
    name: 'schedule_followup',
    description:
      'Wake yourself up later in this conversation, e.g. to check a CI run, a deploy or an ECS task that takes minutes. Say what to check. ' +
      'There is one follow-up per conversation: scheduling replaces the one waiting. Ends your turn: tell the developer when you come back (the answer has the time).',
    input: v.object({
      minutes: v.pipe(v.number(), v.minValue(1), v.maxValue(1440)),
      note: v.pipe(v.string(), v.description('What to check when you come back')),
    }),
    async run({ data }) {
      try {
        // Inside a procedure, it wakes up the step that waits (the one running, or the next).
        const run = ctx.activeRun ? brain.run(ctx.activeRun.runId) : undefined;
        const step = run?.steps.find((x) => x.status === 'waiting' || x.status === 'running') ?? run?.steps.find((x) => x.status === 'pending');
        const { followup, replaced } = followups.schedule({ conversationId: ctx.conversationId, minutes: data.minutes, note: data.note, runId: run?.id ?? null, stepId: step?.id ?? null });
        return {
          output: {
            scheduled: true,
            at: whenLabel(followup.dueAt),
            ...(replaced ? { replaced: `o retorno das ${whenLabel(replaced.dueAt)} (${replaced.note}) foi substituído por este` } : {}),
          },
          terminate: true,
        };
      } catch (error) {
        return { output: { scheduled: false, error: error instanceof Error ? error.message : String(error) } };
      }
    },
  });

  useTool({
    name: 'cancel_followup',
    description: 'Cancel the follow-up waiting in this conversation (the thing it was going to check no longer matters, or the developer asked).',
    input: v.object({}),
    async run() {
      const active = followups.active(ctx.conversationId);
      if (!active) return { output: { cancelled: false, note: 'não havia retorno agendado nesta conversa' } };
      followups.cancel(active.id, 'orbi');
      return { output: { cancelled: true, was: `${whenLabel(active.dueAt)}: ${active.note}` } };
    },
  });
}
