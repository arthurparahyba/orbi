import { Hono } from 'hono';
import { ChooseConversationModel, CreateConversation, RenameConversation } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body, HttpError, notFound } from '../errors.ts';
import { conversationState, type ConversationState } from '../../conversations/state.ts';
import { buildNotebook } from '../../conversations/notebook.ts';
import { modelChoices } from '../../llm/choices.ts';

/** Where each conversation is, from the brain: open learning cards and the procedure learned in each one. */
function stateReader({ brain, inbox }: OrbiServices): (id: string) => ConversationState {
  const learning = new Set(inbox.list({ status: 'open' }).filter((i) => i.kind === 'learning').map((i) => i.conversationId));
  const learned = new Map<string, { name: string; level: 1 | 2 | 3; at: string }>();
  for (const pb of brain.procedures.playbooks()) {
    const prev = pb.learnedFrom ? learned.get(pb.learnedFrom) : undefined;
    if (pb.learnedFrom && (!prev || prev.at < pb.updatedAt)) learned.set(pb.learnedFrom, { name: pb.name, level: pb.level, at: pb.updatedAt });
  }
  return (id) => {
    const l = learned.get(id);
    return conversationState({ lastRun: brain.execution.lastRunIn(id), learningOpen: learning.has(id), learned: l && { name: l.name, level: l.level } });
  };
}

/** The sidebar list and the panel beside a conversation. The app opens /agents/orbi/<id> for each one. */
export function conversationRoutes(s: OrbiServices) {
  const { conversations, agents, brain } = s;
  return new Hono()
    .get('/', (c) => {
      // Conversations a coding agent asked for carry who asked (the list shows a badge).
      const byConversation = new Map(agents.requests.list(1000).map((r) => [r.conversationId, r]));
      // Where each one is (teaching, doing, learned): from the brain, nothing stored for it.
      const stateOf = stateReader(s);
      return c.json(
        conversations.list().map((conv) => {
          const r = byConversation.get(conv.id);
          const state = stateOf(conv.id);
          return r ? { ...conv, state, origin: { agent: r.agent, requestId: r.id, procedure: r.procedure, ...r.context } } : { ...conv, state };
        }),
      );
    })
    .get('/:id/notebook', (c) => {
      const id = c.req.param('id');
      if (!conversations.get(id)) throw notFound('conversa');
      const state = stateReader(s)(id);
      const lastRun = brain.execution.lastRunIn(id);
      const procedure = state.mode === 'ensinando' ? undefined : brain.procedures.playbook(state.playbook);
      return c.json(buildNotebook({
        conversationId: id, state, lastRun, procedure,
        entities: brain.facts.graph().entities,
        runIds: brain.execution.runsIn(id).map((r) => r.id),
        readiness: state.mode === 'fazendo' && lastRun ? brain.execution.readiness(lastRun.id) : [],
      }));
    })
    .post('/', async (c) => {
      const { title } = await body(c, CreateConversation);
      return c.json(conversations.create(title), 201);
    })
    .delete('/:id', (c) => {
      if (!conversations.delete(c.req.param('id'))) throw notFound('conversa');
      return c.json({ deleted: true });
    })
    .put('/:id/model', async (c) => {
      const { model } = await body(c, ChooseConversationModel);
      // Only a model the active provider offers: a name typed by hand never reaches the agent.
      if (model && !modelChoices(s.llm, {}).models.some((m) => m.id === model)) throw new HttpError(400, 'unknown_model', `o modelo ${model} não está entre os oferecidos`);
      const item = conversations.setModel(c.req.param('id'), model);
      if (!item) throw notFound('conversa');
      return c.json(item);
    })
    .patch('/:id', async (c) => {
      const { title } = await body(c, RenameConversation);
      const item = conversations.touch(c.req.param('id'), title);
      if (!item) throw notFound('conversa');
      return c.json(item);
    });
}
