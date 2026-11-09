import { describe, expect, it } from 'vitest';
import { contentKey, isNearBottom } from '../src/components/chat/scroll';

describe('rolagem da conversa', () => {
  it('perto do fim conta como acompanhando', () => {
    expect(isNearBottom({ scrollTop: 920, scrollHeight: 1500, clientHeight: 500 })).toBe(true);
    expect(isNearBottom({ scrollTop: 200, scrollHeight: 1500, clientHeight: 500 })).toBe(false);
  });
  it('a mesma lista recarregada não muda a chave; mensagem nova ou texto chegando muda', () => {
    const a = [{ id: '1', parts: [{ text: 'oi' }] }];
    expect(contentKey(a)).toBe(contentKey([{ id: '1', parts: [{ text: 'oi' }] }]));
    expect(contentKey(a)).not.toBe(contentKey([...a, { id: '2', parts: [] }]));
    expect(contentKey(a)).not.toBe(contentKey([{ id: '1', parts: [{ text: 'oi, tudo' }] }]));
  });
});
