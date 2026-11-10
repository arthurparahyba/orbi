import { describe, expect, it } from 'vitest';
import { followupPill, whenLabel } from '../src/views/conversation/followups';

const f = (dueAt: string, status: 'scheduled' | 'delivering' = 'scheduled') => ({ id: 'x', conversationId: 'c', dueAt, note: 'n', status, attempts: 0, createdAt: dueAt });

describe('retorno agendado na conversa', () => {
  const now = new Date('2026-11-10T15:00:00');
  it('o cabeçalho diz quando volta, em vez de "Pronto"', () => {
    expect(followupPill(f(new Date('2026-11-10T15:40:00').toISOString()), now)).toEqual({ tone: 'waiting', text: 'Volto às 15:40' });
    expect(followupPill(f(new Date('2026-11-10T15:40:00').toISOString(), 'delivering'), now)?.text).toBe('Voltando agora…');
    expect(followupPill(undefined, now)).toBeUndefined();
  });
  it('outro dia mostra a data', () => {
    expect(whenLabel(new Date('2026-11-11T09:05:00').toISOString(), now)).toBe('11/11 09:05');
  });
});
