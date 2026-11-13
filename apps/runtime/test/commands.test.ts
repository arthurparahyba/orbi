import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, commandEffectOf, commandReads, installHint, profileOf } from '../src/commands/index.ts';

test('perfis de comando: um por CLI, e CLI sem perfil escreve só nesta máquina', () => {
  assert.equal(new Set(PROFILES.map((p) => p.binary)).size, PROFILES.length, 'um perfil por CLI');
  assert.equal(profileOf('ferramenta-interna'), undefined);
  assert.equal(commandReads('ferramenta-interna', ['list']), false);
  assert.equal(commandEffectOf('ferramenta-interna', ['list']), 'local');
  assert.equal(commandEffectOf('git', ['-C', 'x', 'status']), 'leitura');
  assert.equal(commandEffectOf('git', ['push', '--force']), 'apaga');
  assert.equal(commandEffectOf('gh', ['pr', 'create']), 'publica');
  assert.match(installHint('gh', 'win32')!, /winget/);
  assert.match(installHint('gh', 'linux')!, /brew|gh auth/, 'Linux usa a dica do macOS enquanto não tiver a sua');
  assert.equal(installHint('ferramenta-interna'), undefined);
});

test('ferramentas que só leem (head, tail, wc, ls, grep, find) não pedem; find que age ou apaga pede', () => {
  for (const [bin, args] of [['head', ['-c', '300', 'a.json']], ['tail', ['-n', '5', 'a.log']], ['wc', ['-l', 'a']], ['ls', ['-la']], ['grep', ['-rn', 'x', '.']], ['find', ['.', '-name', '*.py']]] as const) {
    assert.equal(commandReads(bin, args), true, bin);
  }
  assert.equal(commandReads('find', ['.', '-name', '*.tmp', '-delete']), false);
  assert.equal(commandEffectOf('find', ['.', '-name', '*.tmp', '-delete']), 'apaga');
  assert.equal(commandEffectOf('find', ['.', '-exec', 'rm', '{}', ';']), 'publica');
});

test('comando fora da lista é recusado antes do cartão, dizendo o que há', async () => {
  const { notAllowed } = await import('../src/agents/tools/terminal.ts');
  assert.deepEqual(notAllowed('cat', ['git', 'cat']), []);
  assert.match(notAllowed('head', ['git', 'cat'])[0], /head não está entre os comandos permitidos nesta máquina \(git, cat\).*cat para ler/);
  assert.equal(notAllowed('/bin/cat', ['cat']).length, 1);
});
