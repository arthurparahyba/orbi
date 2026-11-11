import { useAgentStart, useDelivery } from '../runtime-port.ts';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';

/**
 * The developer typed something while a procedure was running (docs/funcionalidades/19): usually a
 * correction ("não, é por Releases"). It is noted in the run, on the step it was in, so the review
 * at the end may change that step, and only that one. It does not count against the level: it may
 * have been just a confirmation. An answer given on a question card is not an intervention.
 */
export const interventions = defineCapability({ name: 'interventions', needs: ['brain', 'inbox'], register: useInterventions });

function useInterventions(ctx: AgentContext, { brain, inbox }: Deps<'brain' | 'inbox'>) {
  const delivery = useDelivery();
  useAgentStart(() => {
    if (delivery?.kind !== 'user' || !delivery.body.trim()) return;
    const answeredOnCard = inbox.list({ status: 'answered' }).some((i) => i.conversationId === ctx.conversationId && i.answer === delivery.body);
    if (!answeredOnCard) brain.execution.noteIntervention(ctx.conversationId, delivery.body);
  });
}
