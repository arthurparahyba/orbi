import { tellAgent } from '../conversations/tell.ts';
import { HttpError } from '../http/errors.ts';
import type { InboxHandler } from './types.ts';

/** A credential the Orbi needs: the value goes to the vault only; the conversation learns the reference. */
export const secret: InboxHandler = {
  id: 'credencial',
  matches: (item) => item.kind === 'secret',
  async secret(item, { name, value, description }, d) {
    if (value) await d.vault.set(name, value, { description, origin: d.vault.has(name) ? undefined : 'adicionada por você na conversa' });
    else if (!d.vault.has(name)) throw new HttpError(400, 'invalid_body', 'digite o valor: essa credencial ainda não está no cofre');
    const receipt = await tellAgent(d.events, d.agent, {
      id: item.conversationId,
      message: { kind: 'signal', type: 'secret-saved', tagName: 'secret-saved', body: `O desenvolvedor guardou a credencial no cofre: {{segredo:${name}}}. Use essa referência; o valor você não vê.`, attributes: { name } },
    });
    d.inbox.resolve(item.id, 'answered', `{{segredo:${name}}}`);
    return { status: 202, body: receipt };
  },
};
