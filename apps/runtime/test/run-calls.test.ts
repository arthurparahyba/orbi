import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callSummary, EXPENSIVE_CHARS, expensiveChars, marksOf, transcript, type RunCall } from '../src/brain/domain/run-calls.ts';
import { isCallError } from '../src/brain/domain/levels.ts';

/** The registry of the execution (docs/funcionalidades/24). */
const call = (over: Partial<RunCall> = {}): RunCall => ({
  id: 'c1', runId: 'r1', conversationId: 'chat:x', step: 'extrair', tool: 'browser_act', summary: 'evaluate_script',
  status: 'ok', approval: null, error: '', durationMs: 120, chars: 0, marks: [], at: '2026-11-14T21:17:03Z', ...over,
});

test('marcas: leitura cara, resposta cortada e chamada errada do modelo', () => {
  assert.deepEqual(marksOf({ chars: EXPENSIVE_CHARS, status: 'ok', error: '' }, 'ok', isCallError), ['caro']);
  assert.deepEqual(marksOf({ chars: 300, status: 'ok', error: '' }, 'inicio\n…[truncado]', isCallError), ['cortado']);
  assert.deepEqual(marksOf({ chars: 40, status: 'ok', error: '' }, '…[12000 caracteres omitidos]…', isCallError), ['cortado']);
  assert.deepEqual(marksOf({ chars: 10, status: 'erro', error: 'Tool mcp__chrome__evaluate_script not found' }, '', isCallError), ['chamada']);
  assert.deepEqual(marksOf({ chars: 10, status: 'erro', error: 'JSONDecodeError: line 1' }, '', isCallError), []);
  assert.equal(expensiveChars([call({ chars: 81_204, marks: ['caro'] }), call({ chars: 300 })]), 81_204);
});

test('resumo da chamada: os valores que dizem o que ela faz, cortados', () => {
  assert.equal(callSummary({ tool: 'evaluate_script', saveTo: 'promo.json', args: { function: 'x' } }), 'evaluate_script · saveTo=promo.json');
  assert.equal(callSummary({ binary: 'head', args: ['-c', '300', 'promo.json'] }), 'head · args=-c 300 promo.json');
  assert.match(callSummary({ how: 'x'.repeat(200) }), /^how=x{60}…$/);
  assert.equal(callSummary(undefined), '');
});

test('execução completa como texto: por passo, com o que falhou e o que custou', () => {
  const run = {
    id: 'r1', playbook: 'promo', status: 'done', startedAt: '2026-11-14T21:10:00Z', finishedAt: '2026-11-14T21:20:00Z',
    params: { busca: 'livros' }, outputs: { html_path: 'saida/p.html' },
    steps: [{ id: 'abrir', label: 'Abrir', status: 'done' }, { id: 'extrair', label: 'Extrair', status: 'done', note: 'em lotes' }],
  };
  const text = transcript(run, [
    call({ id: 'a', step: 'abrir', tool: 'mcp__chrome__navigate_page', summary: 'url=https://x', chars: 400 }),
    call({ id: 'b', step: 'extrair', chars: 81_204, approval: 'aprovada', marks: ['caro', 'cortado'], summary: 'evaluate_script · saveTo=promo.json' }),
    call({ id: 'c', step: 'extrair', tool: 'run_script', status: 'erro', error: 'JSONDecodeError: line 1', chars: 60 }),
    call({ id: 'd', step: null, tool: 'brain_learn', summary: 'reason=corrigir' }),
  ], [{ kind: 'comando', detail: 'gerar_html.py falhou', step: 'extrair', recovered: true }]);
  assert.match(text, /# promo · done/);
  assert.match(text, /recebeu: busca=livros/);
  assert.match(text, /entregou: html_path=saida\/p\.html/);
  assert.match(text, /4 chamadas · 82 mil caracteres ao modelo · 1 aprovações/);
  assert.match(text, /## 1 · Abrir \(done\)\n- 21:17:03 mcp__chrome__navigate_page url=https:\/\/x → ok · 120 ms · 400 caracteres/);
  assert.match(text, /## 2 · Extrair \(done\) — em lotes/);
  assert.match(text, /evaluate_script · saveTo=promo\.json → ok · aprovada · 120 ms · 81 mil caracteres \[leitura cara, resposta cortada\]/);
  assert.match(text, /run_script .* → erro .*\n {4}erro: JSONDecodeError: line 1/);
  assert.match(text, /- desvio \(comando, recuperado\): gerar_html\.py falhou/);
  assert.match(text, /## Fora dos passos\n- .*brain_learn/);
});
