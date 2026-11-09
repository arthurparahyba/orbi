import { useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';

const SECRET_NAME = /^[a-z0-9][a-z0-9._/@-]{0,127}$/;

/**
 * Asking for a credential without ever seeing it: Orbi proposes a name, the
 * developer types the value in a card in the conversation, and the app saves
 * it straight to the vault (POST /api/inbox/:id/secret). What comes back to
 * Orbi is only that {{segredo:nome}} now exists.
 */
export const secrets = defineCapability({ name: 'secrets', needs: ['inbox', 'vault'], register: useSecrets });

function useSecrets(ctx: AgentContext, { inbox, vault }: Deps<'inbox' | 'vault'>) {

  useTool({
    name: 'ask_secret',
    description:
      'Ask the developer for a credential (password, token, key) you need, e.g. to log in while learning or running a procedure. Propose a name like "github/senha". The developer types the value in a card that saves it straight to the vault; you never see it. Ends your turn; a signal tells you when it is saved. Then use {{segredo:<name>}} in browser_act and in the playbook.',
    input: v.object({
      name: v.pipe(v.string(), v.regex(SECRET_NAME, 'use letras minúsculas, números e . _ / @ - (ex.: github/senha)')),
      description: v.pipe(v.string(), v.maxLength(200)),
      reason: v.pipe(v.string(), v.maxLength(300)),
    }),
    async run({ data }) {
      if (vault.has(data.name)) return { output: `Já existe no cofre: use {{segredo:${data.name}}}.` };
      const item = inbox.add({ kind: 'secret', conversationId: ctx.conversationId, title: `Credencial: ${data.description || data.name}`, detail: data.reason });
      ctx.ui({ component: 'secret', id: `secret-${item.id}`, name: data.name, description: data.description, reason: data.reason, inboxId: item.id });
      return { output: { asked: true, note: 'Espere o sinal de que foi guardada. Não peça o valor na conversa.' }, terminate: true };
    },
  });
}
