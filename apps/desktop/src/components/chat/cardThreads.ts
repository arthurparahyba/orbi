import type { FlueConversationMessage } from '@flue/react';

/**
 * The conversations inside cards (docs/funcionalidades/21), without React. A message written in a
 * card arrives as a signal (`cartao`, with the card's id); it and the Orbi's replies to it, up to
 * the next message of yours or the next signal, belong to that card and leave the main flow.
 */
export interface CardThreads {
  /** Card id → its messages, in order (the signal, then the Orbi's replies). */
  byCard: Map<string, FlueConversationMessage[]>;
  /** Messages shown inside a card instead of in the main flow. */
  inCards: Set<string>;
}

export const isCardMessage = (m: FlueConversationMessage) => m.role === 'system' && (m.signal?.tagName === 'cartao' || m.signal?.attributes?.type === 'card');
export const cardOf = (m: FlueConversationMessage) => String(m.signal?.attributes?.card ?? '');
/** What you wrote in the card (the signal's body also carries the card's content, for the Orbi). */
export const cardText = (m: FlueConversationMessage) => String(m.signal?.attributes?.text ?? '');

/**
 * Signals that start a turn of their own (shown in the chat or answering a card): they end the
 * card's conversation. Plumbing between a question and its answer (MCP availability, skill
 * updates, approval results) does not.
 */
const STARTERS = new Set(['followup', 'pipeline', 'review', 'conhecimento', 'knowledge', 'secret-saved', 'agent-request', 'tool-approval', 'shell-configured']);
const startsTurn = (m: FlueConversationMessage) => STARTERS.has(String(m.signal?.tagName ?? '')) || STARTERS.has(String(m.signal?.attributes?.type ?? ''));

export function cardThreads(messages: FlueConversationMessage[]): CardThreads {
  const byCard = new Map<string, FlueConversationMessage[]>();
  const inCards = new Set<string>();
  let current: string | undefined;
  for (const m of messages) {
    if (isCardMessage(m) && cardOf(m)) {
      current = cardOf(m);
      byCard.set(current, [...(byCard.get(current) ?? []), m]);
      inCards.add(m.id);
    } else if (current && m.role === 'assistant') {
      byCard.get(current)!.push(m);
      inCards.add(m.id);
    } else if (m.role === 'user' || (m.role === 'system' && startsTurn(m))) {
      current = undefined;
    }
  }
  return { byCard, inCards };
}

/** "3 mensagens sobre este cartão": what you wrote plus the Orbi's replies that have text. */
export function threadCount(thread: FlueConversationMessage[]): number {
  return thread.filter((m) => isCardMessage(m) || m.parts.some((p) => p.type === 'text' && p.text.trim())).length;
}
