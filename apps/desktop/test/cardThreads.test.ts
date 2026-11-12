import { describe, expect, it } from 'vitest';
import type { FlueConversationMessage } from '@flue/react';
import { cardText, cardThreads, threadCount } from '../src/components/chat/cardThreads';

const text = (t: string) => [{ type: 'text', text: t }] as FlueConversationMessage['parts'];
const user = (id: string, t: string) => ({ id, role: 'user', parts: text(t) }) as unknown as FlueConversationMessage;
const orbi = (id: string, t: string) => ({ id, role: 'assistant', parts: text(t) }) as unknown as FlueConversationMessage;
const inCard = (id: string, card: string, t: string) => ({ id, role: 'system', parts: text('corpo com o conteúdo do cartão'), signal: { tagName: 'cartao', attributes: { card, title: 'x', text: t } } }) as unknown as FlueConversationMessage;
const signal = (id: string, tagName: string) => ({ id, role: 'system', parts: [], signal: { tagName, attributes: {} } }) as unknown as FlueConversationMessage;

describe('conversa dentro do cartão', () => {
  it('a pergunta no cartão e as respostas a ela vão para o cartão; o resto fica no fluxo', () => {
    const msgs = [
      user('1', 'roda de novo'), orbi('2', 'propus dois cartões'),
      inCard('3', 'A', 'por que?'), orbi('4', 'porque o curl não é permitido'), signal('5', 'tool-approval-result'), orbi('6', 'e o JSON sai pronto'),
      inCard('7', 'B', 'e este?'), orbi('8', 'guarda o filtro'),
      user('9', 'valeu'), orbi('10', 'de nada'),
    ];
    const t = cardThreads(msgs);
    expect(t.byCard.get('A')!.map((m) => m.id)).toEqual(['3', '4', '6']);
    expect(t.byCard.get('B')!.map((m) => m.id)).toEqual(['7', '8']);
    expect([...t.inCards].sort()).toEqual(['3', '4', '6', '7', '8']);
    expect(t.inCards.has('10')).toBe(false);
    expect(cardText(msgs[2]!)).toBe('por que?');
    expect(threadCount(t.byCard.get('A')!)).toBe(3);
  });

  it('sinal de encanamento entre a pergunta e a resposta não tira a resposta do cartão', () => {
    const t = cardThreads([inCard('1', 'A', 'oi'), signal('2', 'mcp-unavailable'), orbi('3', 'resposta')]);
    expect(t.byCard.get('A')!.map((m) => m.id)).toEqual(['1', '3']);
  });

  it('outro sinal (revisão, esteira) encerra a conversa do cartão', () => {
    const t = cardThreads([inCard('1', 'A', 'oi'), orbi('2', 'oi'), signal('3', 'review'), orbi('4', 'revisei')]);
    expect(t.byCard.get('A')!.map((m) => m.id)).toEqual(['1', '2']);
    expect(t.inCards.has('4')).toBe(false);
  });
});
