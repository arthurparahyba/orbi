import { Hono } from 'hono';
import { CardMessage, ChooseConversationModel, CreateConversation, RenameConversation } from '@orbi/contracts';
import type { Agent } from '../../agents/runtime-port.ts';
import { tellAgent } from '../../conversations/tell.ts';
import type { OrbiServices } from '../../services.ts';
import { body, HttpError, notFound } from '../errors.ts';
import { conversationState, type ConversationState } from '../../conversations/state.ts';
import { buildNotebook } from '../../conversations/notebook.ts';
import { modelChoices } from '../../llm/choices.ts';

/** Where each conversation is, from the brain: open learning cards and the procedure learned in each one. */
function stateReader({ brain, inbox, pipelines }: OrbiServices): (id: string) => ConversationState {
  const learning = new Set(inbox.list({ status: 'open' }).filter((i) => i.kind === 'learning').map((i) => i.conversationId));
  const learned = new Map<string, { name: string; level: 1 | 2 | 3; at: string }>();
  for (const pb of brain.procedures.playbooks()) {
    const prev = pb.learnedFrom ? learned.get(pb.learnedFrom) : undefined;
    if (pb.learnedFrom && (!prev || prev.at < pb.updatedAt)) learned.set(pb.learnedFrom, { name: pb.name, level: pb.level, at: pb.updatedAt });
  }
  return (id) => {
    const l = learned.get(id);
    const d = pipelines.runs.inConversation(id);
    return conversationState({ lastRun: brain.execution.lastRunIn(id), learningOpen: learning.has(id), learned: l && { name: l.name, level: l.level }, ...(d ? { delivery: { pipeline: d.pipeline, status: d.status } } : {}) });
  };
}

/** The sidebar list and the panel beside a conversation. The app opens /agents/orbi/<id> for each one. */
/**
 * What the Orbi reads when a message is written inside a card: the text, and what the card shows
 * now. A learning card's content comes from the inbox (its current version), not from the app.
 */
export function cardMessageBody(m: { card: string; title: string; context: string; text: string }, item?: { title: string; detail: string; status: string; version?: number }): string {
  const shown = item ? `${item.title}${item.version ? ` (versão ${item.version})` : ''} · ${item.status === 'open' ? 'pendente' : item.status}\n${item.detail}` : m.context;
  return `Mensagem escrita dentro do cartão "${item?.title ?? m.title}" (${m.card}):\n${m.text}\n\nO que o cartão mostra agora:\n${shown.slice(0, 8000)}`;
}

export function conversationRoutes(s: OrbiServices, agent?: Agent) {
  const { conversations, agents, brain } = s;
  return new Hono()
    // A message written inside a card: a signal in the same conversation, grouped in the card by the app.
    .post('/:id/card-message', async (c) => {
      const id = c.req.param('id');
      if (!agent) throw new HttpError(500, 'unavailable', 'sem agente para entregar a mensagem');
      const m = await body(c, CardMessage);
      const item = s.inbox.get(m.card);
      const own = item && item.conversationId === id ? item : undefined;
      const receipt = await tellAgent(s.events, agent, {
        id,
        message: { kind: 'signal', type: 'card', tagName: 'cartao', body: cardMessageBody(m, own), attributes: { card: m.card, title: own?.title ?? m.title, text: m.text } },
      });
      return c.json(receipt);
    })
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
      // In an esteira, the panel's steps are those of the stage running now (the latest run).
      const procedureName = state.mode === 'aprendido' || state.mode === 'fazendo' ? state.playbook : state.mode === 'esteira' && lastRun ? lastRun.playbook : undefined;
      const procedure = procedureName ? brain.procedures.playbook(procedureName) : undefined;
      return c.json(buildNotebook({
        conversationId: id, state, lastRun, procedure,
        entities: brain.facts.graph().entities,
        runIds: brain.execution.runsIn(id).map((r) => r.id),
        readiness: (state.mode === 'fazendo' || state.mode === 'esteira') && lastRun ? brain.execution.readiness(lastRun.id) : [],
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
