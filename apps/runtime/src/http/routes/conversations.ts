import { Hono } from 'hono';
import { CreateConversation, RenameConversation } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body, notFound } from '../errors.ts';
import { conversationState } from '../../conversations/state.ts';

/** The sidebar list. The app opens /agents/orbi/<id> for each one. */
export function conversationRoutes({ conversations, agents, brain, inbox }: OrbiServices) {
  return new Hono()
    .get('/', (c) => {
      // Conversations a coding agent asked for carry who asked (the list shows a badge).
      const byConversation = new Map(agents.requests.list(1000).map((r) => [r.conversationId, r]));
      // Where each one is (teaching, doing, learned): from the brain, nothing stored for it.
      const learning = new Set(inbox.list({ status: 'open' }).filter((i) => i.kind === 'learning').map((i) => i.conversationId));
      const learned = new Map<string, { name: string; level: 1 | 2 | 3; at: string }>();
      for (const pb of brain.procedures.playbooks()) {
        const prev = pb.learnedFrom ? learned.get(pb.learnedFrom) : undefined;
        if (pb.learnedFrom && (!prev || prev.at < pb.updatedAt)) learned.set(pb.learnedFrom, { name: pb.name, level: pb.level, at: pb.updatedAt });
      }
      return c.json(
        conversations.list().map((conv) => {
          const r = byConversation.get(conv.id);
          const l = learned.get(conv.id);
          const state = conversationState({ lastRun: brain.execution.lastRunIn(conv.id), learningOpen: learning.has(conv.id), learned: l && { name: l.name, level: l.level } });
          return r ? { ...conv, state, origin: { agent: r.agent, requestId: r.id, procedure: r.procedure, ...r.context } } : { ...conv, state };
        }),
      );
    })
    .post('/', async (c) => {
      const { title } = await body(c, CreateConversation);
      return c.json(conversations.create(title), 201);
    })
    .delete('/:id', (c) => {
      if (!conversations.delete(c.req.param('id'))) throw notFound('conversa');
      return c.json({ deleted: true });
    })
    .patch('/:id', async (c) => {
      const { title } = await body(c, RenameConversation);
      const item = conversations.touch(c.req.param('id'), title);
      if (!item) throw notFound('conversa');
      return c.json(item);
    });
}
