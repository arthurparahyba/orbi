import { describe, expect, it } from 'vitest';
import type { RunCall } from '../src/api';
import { groupCalls, isProblem, runTotals, size } from '../src/views/brain/runCalls';

const call = (id: string, over: Partial<RunCall> = {}): RunCall => ({
  id, runId: 'r1', conversationId: 'c', step: 'extrair', tool: 'browser_act', summary: 'evaluate_script',
  status: 'ok', approval: null, error: '', durationMs: 100, chars: 0, marks: [], at: '2026-11-14T21:17:00Z', ...over,
});
const steps = [{ id: 'abrir', label: 'Abrir', status: 'done' }, { id: 'extrair', label: 'Extrair', status: 'done' }];

describe('registro da execução', () => {
  it('agrupa as chamadas pelos passos, na ordem, e põe o que está fora deles no fim', () => {
    const groups = groupCalls([call('1'), call('2', { step: 'abrir' }), call('3', { step: null }), call('4', { step: 'sumiu' })], steps);
    expect(groups.map((g) => [g.title, g.calls.map((c) => c.id)])).toEqual([
      ['1 · Abrir', ['2']], ['2 · Extrair', ['1']], ['Fora dos passos', ['3', '4']],
    ]);
  });
  it('problema é falha, marca ou algo que você decidiu; chamada limpa não é', () => {
    expect(isProblem(call('1'))).toBe(false);
    expect(isProblem(call('1', { status: 'erro' }))).toBe(true);
    expect(isProblem(call('1', { marks: ['caro'] }))).toBe(true);
    expect(isProblem(call('1', { approval: 'aprovada' }))).toBe(false);
  });
  it('soma o que a execução custou: leitura, aprovações, falhas e leituras caras', () => {
    const totals = runTotals([
      call('1', { chars: 81_204, marks: ['caro', 'cortado'] }),
      call('2', { chars: 300, approval: 'aprovada' }),
      call('3', { status: 'erro', error: 'JSONDecodeError' }),
      call('4', { approval: 'sozinha' }),
    ]);
    expect(totals).toMatchObject({ calls: 4, chars: 81_504, approvals: 1, failures: 1, expensive: 1, expensiveChars: 81_204 });
    expect(size(81_204)).toBe('81 mil');
  });
});
