import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payloadOf } from '../src/agents/tools/browser.ts';

/** browser_act saveTo: what the page returns goes straight to a file, without its wrapper. */
test('saveTo do navegador: grava o JSON de dentro do bloco, ou o texto inteiro', () => {
  const evaluate = 'Script ran on page and returned:\n```json\n[{"asin":"B0X","preco":"R$ 3.199"}]\n```';
  assert.equal(payloadOf(evaluate), '[{"asin":"B0X","preco":"R$ 3.199"}]');
  assert.equal(payloadOf('texto simples'), 'texto simples');
});
