import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notJson, payloadOf } from '../src/agents/tools/browser.ts';

/** browser_act saveTo: what the page returns goes straight to a file, without its wrapper. */
test('saveTo do navegador: grava o JSON de dentro do bloco, ou o texto inteiro', () => {
  const evaluate = 'Script ran on page and returned:\n```json\n[{"asin":"B0X","preco":"R$ 3.199"}]\n```';
  assert.equal(payloadOf(evaluate), '[{"asin":"B0X","preco":"R$ 3.199"}]');
  assert.equal(payloadOf('texto simples'), 'texto simples');
});

test('saveTo do navegador: arquivo .json só recebe JSON (resposta cortada é recusada, não gravada quebrada)', () => {
  const cut = 'Script ran on page and returned:\n```json\n[{"titulo":"A"},{"titulo":"B\n…[truncado]';
  // Without its closing fence the block is not found: the whole text would go to the file.
  assert.equal(payloadOf(cut), cut);
  assert.match(notJson('saida/p.json', payloadOf(cut))!, /não é JSON \(começa com "Script ran on page/);
  assert.equal(notJson('saida/p.json', '[{"a":1}]'), undefined);
  assert.equal(notJson('saida/p.txt', 'qualquer coisa'), undefined);
});
