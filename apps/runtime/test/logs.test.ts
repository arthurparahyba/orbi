/**
 * O registro do runtime na tela (documento 29). O que não dá para conferir lendo o código: o que
 * conta como linha reconhecida, o que acontece com o que não é reconhecido, e se credencial sai.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseLines, onlyAsked } from '../src/contexts/telemetry/src/log-lines.ts';
import { tailOf } from '../src/contexts/telemetry/src/log-file.ts';
import { recentLog } from '../src/contexts/telemetry/index.ts';

const fileWith = (lines: string[]): string => {
  const file = join(mkdtempSync(join(tmpdir(), 'orbi-log-')), 'runtime.log');
  writeFileSync(file, lines.join('\n') + '\n');
  return file;
};

test('linha do logger é reconhecida; o que não é fica marcado como crua', () => {
  const lines = parseLines(
    [
      '{"t":"2026-11-17T12:00:00.000Z","level":"info","msg":"runtime iniciado","model":"claude"}',
      '14:31:02 WARN  servidor MCP não conectou  server=jira',
      'file:///app/node_modules/foo/index.js:12',
      '    at async Promise.all (index 0)',
      '{"isso":"json sem level nem msg"}',
      '{quebrado',
    ].join('\n'),
  );

  assert.deepEqual(lines.map((l) => l.kind), ['orbi', 'orbi', 'raw', 'raw', 'raw', 'raw']);
  assert.deepEqual(lines[0], {
    kind: 'orbi', at: '2026-11-17T12:00:00.000Z', level: 'info', msg: 'runtime iniciado', attrs: { model: 'claude' },
  });
  assert.equal(lines[1]!.level, 'warn', 'o formato bonito do terminal também é reconhecido');
  assert.equal(lines[4]!.kind, 'raw', 'JSON sem a forma do logger não é do logger: não se adivinha');
});

test('filtro de nível esconde a linha crua, porque não dá para afirmar que ela passa', () => {
  const lines = parseLines('{"t":"x","level":"info","msg":"ok"}\npilha de erro qualquer\n{"t":"y","level":"error","msg":"caiu"}');

  assert.deepEqual(onlyAsked(lines, {}).map((l) => l.msg), ['ok', 'pilha de erro qualquer', 'caiu']);
  assert.deepEqual(onlyAsked(lines, { level: 'warn' }).map((l) => l.msg), ['caiu']);
  assert.deepEqual(onlyAsked(lines, { text: 'PILHA' }).map((l) => l.msg), ['pilha de erro qualquer'], 'o texto não liga para maiúsculas');
  assert.deepEqual(onlyAsked(lines, { text: 'nada disso' }), []);
});

test('o arquivo é lido do fim, e um arquivo que não existe não é erro de pedido', () => {
  const file = fileWith(Array.from({ length: 500 }, (_, i) => `{"t":"x","level":"info","msg":"linha ${i}"}`));
  const tail = tailOf(file, 10);
  assert.ok(!('refused' in tail));
  assert.ok(tail.bytes > 0);
  assert.match(tail.text.trimEnd().split('\n').at(-1)!, /linha 499/, 'o fim do arquivo é o que importa');

  const faltando = tailOf(join(tmpdir(), 'nao-existe-mesmo', 'runtime.log'), 10);
  assert.ok('refused' in faltando && faltando.refused === 'sem-arquivo');
});

test('credencial que por acaso esteja no log não sai na resposta', async () => {
  const file = fileWith([
    '{"t":"x","level":"error","msg":"o plugin recusou","detail":"token s3nh4-secreta-do-yara inválido"}',
    'o plugin imprimiu: Authorization: Bearer s3nh4-secreta-do-yara',
  ]);
  const d = {
    config: { logFile: file },
    vault: { list: () => [{ name: 'yara' }], get: async () => 's3nh4-secreta-do-yara' },
  } as never;

  const log = await recentLog(d, {});
  assert.ok(!('refused' in log));
  const texto = JSON.stringify(log.lines);
  assert.doesNotMatch(texto, /s3nh4-secreta-do-yara/, 'nem na linha do logger nem na que o plugin imprimiu');
  assert.match(texto, /••••••/);
  assert.equal(log.raw, 1, 'a linha do plugin conta como não reconhecida, e a tela diz isso');
});
