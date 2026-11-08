import { Hono } from 'hono';
import { tellAgent } from '../../conversations/tell.ts';
import { Answer, Decision, InboxStatusQuery, ProvideSecret } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { HttpError, body, notFound, query } from '../errors.ts';
import type { Agent } from './types.ts';

/** What waits for the developer. Decisions and answers go back into the conversation. */
export function inboxRoutes({ inbox, events, vault, brain, pipelines }: OrbiServices, agent: Agent) {
  const open = (id: string) => {
    const item = inbox.get(id);
    if (!item) throw notFound('item');
    if (item.status !== 'open') throw new HttpError(409, 'conflict', `este item já foi decidido (${item.status})`);
    return item;
  };

  return new Hono()
    .get('/', (c) => {
      const status = query(c, 'status', InboxStatusQuery);
      // ?status= (empty) lists everything; no parameter lists what is open.
      return c.json(inbox.list(status === '' ? {} : { status: status ?? 'open' }));
    })
    .post('/:id/decision', async (c) => {
      const { decision, approver = 'Desenvolvedor' } = await body(c, Decision);
      const item = open(c.req.param('id'));
      if (!item.approvalId || item.kind === 'level') throw new HttpError(409, 'conflict', 'este item não é uma aprovação');
      inbox.resolve(item.id, decision === 'approve' ? 'approved' : 'denied');
      const receipt = await tellAgent(events, agent, {
        id: item.conversationId,
        message: {
          kind: 'signal',
          type: 'tool-approval',
          body: `${approver} ${decision === 'approve' ? 'aprovou' : 'negou'}: ${item.title}`,
          attributes: { approvalId: item.approvalId, decision, approver },
        },
      });
      return c.json(receipt, 202);
    })
    // A note that only informs (a level or a passage changed): seen.
    .post('/:id/dismiss', (c) => {
      const item = open(c.req.param('id'));
      if (item.kind !== 'level') throw new HttpError(409, 'conflict', 'só avisos podem ser dispensados');
      return c.json(inbox.resolve(item.id, 'answered', 'ok'));
    })
    // "Manter": undo the automatic change the note is about.
    .post('/:id/keep', (c) => {
      const item = open(c.req.param('id'));
      if (item.kind !== 'level' || !item.routine || !item.approvalId) throw new HttpError(409, 'conflict', 'este aviso não tem o que manter');
      const [kind, subject] = [item.routine.slice(0, item.routine.indexOf(':')), item.routine.slice(item.routine.indexOf(':') + 1)];
      if (kind === 'playbook') {
        if (!brain.playbook(subject)) throw notFound('playbook');
        brain.setPlaybookLevel(subject, { level: Number(item.approvalId) as 1 | 2 | 3 }, item.conversationId);
      } else if (kind === 'passage') {
        pipelines.engine.keepAsking(subject, item.conversationId);
      } else throw new HttpError(409, 'conflict', 'aviso desconhecido');
      return c.json(inbox.resolve(item.id, 'answered', 'mantido'));
    })
    .post('/:id/answer', async (c) => {
      const { text } = await body(c, Answer);
      const item = open(c.req.param('id'));
      if (item.kind !== 'question') throw new HttpError(409, 'conflict', 'este item não é uma pergunta');
      inbox.resolve(item.id, 'answered', text);
      const receipt = await tellAgent(events, agent, { id: item.conversationId, message: { kind: 'user', body: text } });
      return c.json(receipt, 202);
    })
    .post('/:id/secret', async (c) => {
      // The value goes to the vault only. The conversation learns the reference, never the value.
      const { name, value, description } = await body(c, ProvideSecret);
      const item = open(c.req.param('id'));
      if (item.kind !== 'secret') throw new HttpError(409, 'conflict', 'este item não pede credencial');
      if (value) await vault.set(name, value, { description, origin: vault.has(name) ? undefined : 'adicionada por você na conversa' });
      else if (!vault.has(name)) throw new HttpError(400, 'invalid_body', 'digite o valor: essa credencial ainda não está no cofre');
      inbox.resolve(item.id, 'answered', `{{segredo:${name}}}`);
      const receipt = await tellAgent(events, agent, {
        id: item.conversationId,
        message: { kind: 'signal', type: 'secret-saved', tagName: 'secret-saved', body: `O desenvolvedor guardou a credencial no cofre: {{segredo:${name}}}. Use essa referência; o valor você não vê.`, attributes: { name } },
      });
      return c.json(receipt, 202);
    });
}
