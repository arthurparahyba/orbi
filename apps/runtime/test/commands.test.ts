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
