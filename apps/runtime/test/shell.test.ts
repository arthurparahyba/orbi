import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findShell, gitToolDirs, shQuote, shellEffect, shellLine } from '../src/terminal/shell.ts';
import { runCommand, runShell } from '../src/terminal/exec.ts';
import { commandCategory, commandEffect } from '../src/autonomy/policy.ts';
import { DEFAULT_ALLOWED } from '../src/config.ts';

test('shell: acha o Git Bash no Windows, aceita ORBI_SHELL e desliga com off', () => {
  const has = (paths: string[]) => (p: string) => paths.includes(p);
  const git = 'C:\\Program Files\\Git\\bin\\bash.exe';
  assert.equal(findShell({ ProgramFiles: 'C:\\Program Files' }, 'win32', has([git])), git);
  assert.equal(findShell({ ORBI_SHELL: 'off' }, 'win32', has([git])), null);
  assert.equal(findShell({ ORBI_SHELL: '/opt/bash' }, 'linux', has(['/opt/bash'])), '/opt/bash');
  assert.equal(findShell({}, 'linux', has(['/bin/bash'])), '/bin/bash');
  assert.equal(findShell({}, 'win32', has([])), null);
  assert.deepEqual(gitToolDirs('C:\\Program Files\\Git\\bin\\bash.exe', 'win32').map((d) => d.replace(/\\/g, '/')), [
    'C:/Program Files/Git/usr/bin', 'C:/Program Files/Git/mingw64/bin',
  ]);
  assert.deepEqual(gitToolDirs('/bin/bash', 'linux'), []);
});

test('shell: argumentos vão entre aspas simples, nada é interpretado', () => {
  assert.equal(shQuote("it's; rm -rf /"), `'it'\\''s; rm -rf /'`);
  assert.equal(shellLine('npm', ['install', '$HOME']), `npm 'install' '$HOME'`);
});

test('shell: o que a linha faz, pelo texto', () => {
  assert.equal(shellEffect('cat a.log | grep erro | wc -l'), 'publica');
  assert.equal(shellEffect('rm -rf build && npm run build'), 'apaga');
  assert.equal(shellEffect('git push --force origin main'), 'apaga');
  assert.equal(shellEffect('gh repo delete x --yes'), 'apaga');
  assert.equal(shellEffect('./deploy.sh dev'), 'publica');
});

test('comandos padrão: python, node, npm, mvn, cat; cat é leitura, npm publish publica', () => {
  for (const b of ['python', 'py', 'node', 'npm', 'mvn', 'cat']) assert.ok(DEFAULT_ALLOWED.includes(b), b);
  assert.equal(commandCategory('cat', ['a.txt']), 'comandos-leitura');
  assert.equal(commandEffect('npm', ['publish']), 'publica');
  assert.equal(commandEffect('npm', ['unpublish', 'x']), 'apaga');
  assert.equal(commandEffect('npm', ['install']), 'local');
  assert.equal(commandEffect('mvn', ['clean', 'deploy']), 'publica');
});

test('run_shell roda a linha no shell (pipe), no Windows pelo Git Bash', async (t) => {
  const shell = findShell(process.env);
  if (!shell) return t.skip('sem shell nesta máquina');
  const r = await runShell(shell, 'printf "a\\nb\\nc\\n" | wc -l', { cwd: tmpdir(), shell });
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout.trim(), '3');
});

test('no Windows, .cmd (npm) roda pelo Git Bash com os argumentos protegidos', async (t) => {
  if (process.platform !== 'win32') return t.skip('só no Windows');
  const shell = findShell(process.env);
  if (!shell) return t.skip('sem Git Bash');
  const r = await runCommand('npm', ['--version'], { cwd: tmpdir(), shell, allowed: ['npm'] });
  assert.equal(r.exitCode, 0, r.stderr);
  assert.match(r.stdout.trim(), /^\d+\.\d+/);
  const cat = await runCommand('cat', ['--version'], { cwd: tmpdir(), shell, allowed: ['cat'] });
  assert.equal(cat.exitCode, 0, 'cat do Git (usr\\bin) achado sem shell');
});
