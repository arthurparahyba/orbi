import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CommandNotFoundError, findBinary, runCommand } from '../src/terminal/exec.ts';

test('pasta inexistente: erro diz que é a pasta, não o programa', async () => {
  await assert.rejects(
    runCommand('git', ['--version'], { cwd: '/tmp/orbi-nao-existe/~/projetos' }),
    /pasta onde o comando rodaria não existe: \/tmp\/orbi-nao-existe/,
  );
});

test('programa ausente: erro diz qual e como instalar', async () => {
  await assert.rejects(runCommand('gh', ['--version'], { env: { PATH: '/nenhum' } }), (err: Error) => {
    assert.ok(err instanceof CommandNotFoundError);
    assert.match(err.message, /`gh` não está instalado.*brew install gh/);
    return true;
  });
});

test('programa presente roda normalmente', async () => {
  assert.ok(findBinary('git'));
  const r = await runCommand('git', ['--version'], { cwd: '/tmp' });
  assert.equal(r.exitCode, 0);
});
