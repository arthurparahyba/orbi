import { Hono } from 'hono';
import { CardMessage, ChooseConversationModel, CreateConversation, RenameConversation } from '@orbi/contracts';
import type { Agent } from '../../agents/runtime-port.ts';
import { tellAgent } from './conversations/src/tell.ts';
import type { OrbiServices } from '../../services.ts';
import { body, HttpError, notFound } from '../../http/errors.ts';
import { listConversations } from './use-cases/list-conversations.ts';
import { conversationNotebook } from './use-cases/conversation-notebook.ts';
import { chooseConversationModel } from './use-cases/choose-conversation-model.ts';

/**
 * What the Orbi reads when a message is written inside a card: the text, and what the card shows
 * now. A learning card's content comes from the inbox (its current version), not from the app.
 */
export function cardMessageBody(m: { card: string; title: string; context: string; text: string }, item?: { title: string; detail: string; status: string; version?: number }): string {
  const shown = item ? `${item.title}${item.version ? ` (versão ${item.version})` : ''} · ${item.status === 'open' ? 'pendente' : item.status}\n${item.detail}` : m.context;
  return `Mensagem escrita dentro do cartão "${item?.title ?? m.title}" (${m.card}):\n${m.text}\n\nO que o cartão mostra agora:\n${shown.slice(0, 8000)}`;
}

export function conversationRoutes(s: OrbiServices, agent?: Agent) {
  const { conversations } = s;
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
    .get('/', (c) => c.json(listConversations(s)))
    .get('/:id/notebook', (c) => {
      const notebook = conversationNotebook(s, c.req.param('id'));
      if ('refused' in notebook) throw notFound(notebook.refused);
      return c.json(notebook);
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
      const item = chooseConversationModel(s, c.req.param('id'), model);
      if ('refused' in item) {
        if (item.refused === 'conversa-nao-existe') throw notFound('conversa');
        throw new HttpError(400, 'unknown_model', item.detail);
      }
      return c.json(item);
    })
    .patch('/:id', async (c) => {
      const { title } = await body(c, RenameConversation);
      const item = conversations.touch(c.req.param('id'), title);
      if (!item) throw notFound('conversa');
      return c.json(item);
    });
}
