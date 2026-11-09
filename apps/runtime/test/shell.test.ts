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

test('.env: troca a linha ativa, aproveita o exemplo comentado, ou acrescenta', async () => {
  const { withEnvValue } = await import('../src/settings/env-file.ts');
  const path = 'C:\\Program Files\\Git\\bin\\bash.exe';
  assert.equal(withEnvValue('A=1\nORBI_SHELL=/x\n', 'ORBI_SHELL', path), `A=1\nORBI_SHELL='${path}'\n`);
  assert.equal(withEnvValue('# ORBI_SHELL=C:\\\\algo\nB=2\n', 'ORBI_SHELL', path), `ORBI_SHELL='${path}'\nB=2\n`);
  assert.equal(withEnvValue('B=2', 'ORBI_SHELL', path), `B=2\nORBI_SHELL='${path}'\n`);
});

test('agente duas vezes no build (Windows): a entrega usa a cópia registrada', async () => {
  const { registeredAgent } = await import('../src/agents/runtime-port.ts');
  function Orbi() {}
  const copy = { Orbi() {} }.Orbi; // same name, another function value
  const other = function Outro() {};
  const reg = [{ identity: 'orbi', agent: Orbi }];
  assert.equal(registeredAgent(Orbi as never, reg), Orbi);
  assert.equal(registeredAgent(copy as never, reg), Orbi, 'a cópia vira a registrada');
  assert.equal(registeredAgent(other as never, reg), other, 'outro agente não é trocado');
});

test('pendências: cada tipo tem seu handler, o mais específico primeiro', async () => {
  const { handlerFor } = await import('../src/inbox/index.ts');
  const { noteSubject } = await import('../src/inbox/level.ts');
  const item = (x: object) => ({ id: 'i', conversationId: 'c', title: '', detail: '', status: 'open', createdAt: '', ...x }) as never;
  assert.equal(handlerFor(item({ kind: 'question', routine: 'config:shell' }))?.id, 'caminho-do-shell');
  assert.equal(handlerFor(item({ kind: 'question' }))?.id, 'pergunta');
  assert.equal(handlerFor(item({ kind: 'learning', approvalId: 'x' }))?.id, 'aprovação');
  assert.equal(handlerFor(item({ kind: 'level', approvalId: '2' }))?.decide, undefined, 'aviso não se aprova');
  assert.deepEqual(noteSubject({ routine: 'passage:top/publicar' }), { kind: 'passage', key: 'top/publicar' });
  assert.deepEqual(noteSubject({ routine: 'playbook:a:b' }), { kind: 'playbook', name: 'a:b' });
});

test('agente de código: o pedido vai como último argumento, ou onde está {prompt}, entre aspas', async () => {
  const { agentLine } = await import('../src/code/code-agent.ts');
  assert.equal(agentLine('claude -p', "corrija o 'teste'"), `claude -p 'corrija o '\\''teste'\\'''`);
  assert.equal(agentLine('codex exec {prompt} --full-auto', 'x; rm -rf /'), `codex exec 'x; rm -rf /' --full-auto`);
});

test('agente de código de verdade (um script no lugar do claude): corrige na cópia, devolve arquivos e diff, e o push sobe', async (t) => {
  const { findShell } = await import('../src/terminal/shell.ts');
  const shell = findShell(process.env);
  if (!shell || process.platform === 'win32') return t.skip('precisa de bash');
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { createCodeFixer } = await import('../src/code/code-agent.ts');
  const root = mkdtempSync(join(tmpdir(), 'orbi-agent-'));
  const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, stdio: 'pipe' }).toString();
  // A bare "origin" and a clone in the workspace, with a bug.
  g(root, 'init', '-q', '--bare', 'origin.git');
  const ws = join(root, 'ws');
  g(root, 'clone', '-q', join(root, 'origin.git'), join(ws, 'app'));
  writeFileSync(join(ws, 'app', 'soma.txt'), '1+1=3\n');
  g(join(ws, 'app'), 'add', '.');
  g(join(ws, 'app'), 'commit', '-qm', 'bug');
  g(join(ws, 'app'), 'push', '-q', 'origin', 'HEAD:main');
  // The "coding agent": fixes the file and says what it did.
  const agent = join(root, 'agente.sh');
  writeFileSync(agent, '#!/bin/bash\necho "1+1=2" > soma.txt\necho "corrigi a soma: $1" | head -c 40\n');
  const fixer = createCodeFixer({ workspace: ws, scratchDir: join(root, 'scratch'), cliEnv: {}, command: `bash ${agent}`, shell: () => shell });
  const fix = await fixer.prepare({ repo: 'org/app', branch: 'main', diagnosis: 'a soma está errada' });
  assert.deepEqual(fix.files, ['soma.txt']);
  assert.match(fix.diff, /\+1\+1=2/);
  assert.match(fix.summary, /corrigi a soma/);
  assert.match(await fixer.push(fix.id, 'Corrige a soma'), /enviado para main/);
  const fresh = join(root, 'conferir');
  g(root, 'clone', '-q', '-b', 'main', join(root, 'origin.git'), fresh);
  assert.equal(readFileSync(join(fresh, 'soma.txt'), 'utf8'), '1+1=2\n');
});

test('plataforma: o que muda por sistema vem de uma implementação por sistema', async () => {
  const { platformFor } = await import('../src/platform/index.ts');
  const win = platformFor('win32'), mac = platformFor('darwin'), lin = platformFor('freebsd');
  assert.equal(lin.id, 'linux', 'outro sistema se comporta como Linux');
  assert.deepEqual(win.programAliases('python3').map((a) => a.name), ['python', 'py', 'python3']);
  assert.deepEqual(mac.programAliases('python3').map((a) => a.name), ['python3']);
  assert.equal(win.needsShell('C:\\x\\npm.cmd'), true);
  assert.equal(mac.needsShell('/usr/local/bin/npm'), false);
  assert.equal(win.skipsPathDir('C:\\Users\\a\\AppData\\Local\\Microsoft\\WindowsApps'), true);
  assert.match(win.shellQuestion, /Git Bash/);
  assert.ok(lin.chromePaths({}).some((p) => p.includes('chrom')));
});
