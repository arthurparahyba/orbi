import { Hono } from 'hono';
import { NOT_THIS, handlerFor, type InboxAction, type InboxHandler } from '../../inbox/index.ts';
import { Answer, Decision, InboxStatusQuery, ProvideSecret } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { HttpError, body, notFound, query } from '../errors.ts';
import type { Agent } from './types.ts';

/** What waits for the developer. Decisions and answers go back into the conversation. */
export function inboxRoutes({ inbox, events, vault, brain, pipelines, config }: OrbiServices, agent: Agent) {
  const open = (id: string) => {
    const item = inbox.get(id);
    if (!item) throw notFound('item');
    if (item.status !== 'open') throw new HttpError(409, 'conflict', `este item já foi decidido (${item.status})`);
    return item;
  };

  const deps = { inbox, events, vault, brain, pipelines, config, agent };
  /** The item's handler does the action (inbox/): the route knows no kind of item. */
  const act = async <A extends InboxAction>(id: string, action: A, input?: Parameters<NonNullable<InboxHandler[A]>>[1]) => {
    const item = open(id);
    const handler = handlerFor(item);
    const run = handler?.[action] as ((item: unknown, a: unknown, b?: unknown) => unknown) | undefined;
    if (!run) throw new HttpError(409, 'conflict', NOT_THIS[action]);
    return (await (action === 'keep' || action === 'dismiss' ? run.call(handler, item, deps) : run.call(handler, item, input, deps))) as { status: 200 | 202; body: unknown };
  };

  return new Hono()
    .get('/', (c) => {
      const status = query(c, 'status', InboxStatusQuery);
      // ?status= (empty) lists everything; no parameter lists what is open.
      return c.json(inbox.list(status === '' ? {} : { status: status ?? 'open' }));
    })
    .post('/:id/decision', async (c) => {
      const { decision, approver = 'Desenvolvedor' } = await body(c, Decision);
      const r = await act(c.req.param('id'), 'decide', { decision, approver });
      return c.json(r.body, r.status);
    })
    // A note that only informs (a level or a passage changed): seen.
    .post('/:id/dismiss', async (c) => {
      const r = await act(c.req.param('id'), 'dismiss');
      return c.json(r.body, r.status);
    })
    // "Manter": undo the automatic change the note is about.
    .post('/:id/keep', async (c) => {
      const r = await act(c.req.param('id'), 'keep');
      return c.json(r.body, r.status);
    })
    .post('/:id/answer', async (c) => {
      const { text } = await body(c, Answer);
      const r = await act(c.req.param('id'), 'answer', text);
      return c.json(r.body, r.status);
    })
    .post('/:id/secret', async (c) => {
      // The value goes to the vault only. The conversation learns the reference, never the value.
      const input = await body(c, ProvideSecret);
      const r = await act(c.req.param('id'), 'secret', input);
      return c.json(r.body, r.status);
    });
}
