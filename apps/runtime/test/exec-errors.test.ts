import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CommandNotFoundError, findBinary, runCommand } from '../src/terminal/exec.ts';
import { tmpdir } from 'node:os';

test('pasta inexistente: erro diz que é a pasta, não o programa', async () => {
  await assert.rejects(
    runCommand('git', ['--version'], { cwd: '/tmp/orbi-nao-existe/~/projetos' }),
    /pasta onde o comando rodaria não existe: \/tmp\/orbi-nao-existe/,
  );
});

test('programa ausente: erro diz qual e como instalar', async () => {
  await assert.rejects(runCommand('gh', ['--version'], { env: { PATH: '/nenhum' } }), (err: Error) => {
    assert.ok(err instanceof CommandNotFoundError);
    assert.match(err.message, /`gh` não está instalado.*(brew install gh|winget install GitHub\.cli)/);
    return true;
  });
});

test('programa presente roda normalmente', async () => {
  assert.ok(findBinary('git'));
  const r = await runCommand('git', ['--version'], { cwd: tmpdir() });
  assert.equal(r.exitCode, 0);
});

test('Windows: python3 vira python ou py, sem os atalhos da Store; dica de instalação com winget', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { join, delimiter } = await import('node:path');
  const { resolveBinary, installHint } = await import('../src/terminal/exec.ts');
  const root = mkdtempSync(join(tmpdir(), 'orbi-win-'));
  const store = join(root, 'WindowsApps');
  const py = join(root, 'Python312');
  mkdirSync(store);
  mkdirSync(py);
  const exe = '.EXE'; // Windows rules (platform 'win32'), on any machine
  writeFileSync(join(store, `python3${exe}`), '');
  writeFileSync(join(store, `python${exe}`), '');
  // Only the Store shortcuts: nothing real to run.
  assert.equal(resolveBinary('python3', store, 'win32'), null);
  writeFileSync(join(py, `py${exe}`), '');
  assert.deepEqual(resolveBinary('python3', [store, py].join(delimiter), 'win32'), { file: join(py, `py${exe}`), prefix: ['-3'] });
  writeFileSync(join(py, `python${exe}`), '');
  assert.deepEqual(resolveBinary('python3', [store, py].join(delimiter), 'win32'), { file: join(py, `python${exe}`), prefix: [] });
  assert.match(installHint('gh', 'win32')!, /winget install GitHub\.cli/);
  assert.match(installHint('gh', 'darwin')!, /brew install gh/);
});
