import { useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import { UiComponent } from '@orbi/contracts';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';

/** Voice: show components in the conversation and ask the developer. */
export const voice = defineCapability({ name: 'voice', needs: ['inbox'], register: useVoice });

function useVoice(ctx: AgentContext, { inbox }: Deps<'inbox'>) {

  useTool({
    name: 'show_ui',
    description:
      'Show the developer a component in the conversation: status, table, link or code. Reuse an `id` to update a component in place. Use it to make progress visible instead of long text.',
    input: v.object({ component: UiComponent }),
    async run({ data }) {
      ctx.ui(data.component);
      return { output: 'shown' };
    },
  });

  useTool({
    name: 'ask_developer',
    description:
      'Ask the developer something only they can answer (a decision, a missing fact, how to do a step you do not know). Ends your turn; the answer arrives as their next message.',
    input: v.object({ question: v.string(), options: v.optional(v.array(v.string())) }),
    async run({ data }) {
      const item = inbox.add({ kind: 'question', conversationId: ctx.conversationId, title: data.question, detail: (data.options ?? []).join('\n') });
      ctx.ui({ component: 'question', id: `q-${item.id}`, question: data.question, options: data.options ?? [], inboxId: item.id });
      return { output: { asked: true }, terminate: true };
    },
  });
}
