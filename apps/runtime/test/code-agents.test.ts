/**
 * Coding agents of this machine: the registry (which agent and model does each task), the
 * command line with the request and the model, and a real run in a throwaway copy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/database.ts';
import { CATALOG, CodeAgents, agentLine, commandProblems } from '../src/code-agents/index.ts';

const db = () => openDatabase(join(mkdtempSync(join(tmpdir(), 'orbi-ca-')), 'orbi.db'));

test('linha do agente: pedido no fim ou em {prompt}, entre aspas; modelo em {modelo}', () => {
  assert.equal(agentLine('claude -p', "corrija o 'teste'"), `claude -p 'corrija o '\\''teste'\\'''`);
  assert.equal(agentLine('codex exec {prompt} --full-auto', 'x; rm -rf /'), `codex exec 'x; rm -rf /' --full-auto`);
  assert.equal(agentLine('claude -p --model {modelo} -- {prompt}', 'oi', 'claude-haiku-5-5'), `claude -p --model 'claude-haiku-5-5' -- 'oi'`);
  assert.equal(agentLine('claude -p --model {modelo} -- {prompt}', 'oi', null), `claude -p -- 'oi'`, 'sem modelo, a opção sai');
  assert.equal(agentLine('x -m={modelo} {prompt}', 'oi'), `x 'oi'`);
});

test('comando: um programa, uma linha', () => {
  assert.deepEqual(commandProblems('claude -p -- {prompt}'), []);
  assert.ok(commandProblems('claude -p && rm -rf ~').length);
  assert.ok(commandProblems('a\nb').length);
  assert.ok(commandProblems("echo 'a;b' {prompt}").length === 0, 'dentro de aspas pode');
});

test('catálogo: todo comando é válido e tem lugar para o pedido', () => {
  for (const c of CATALOG) {
    assert.deepEqual(commandProblems(c.command), [], c.id);
    assert.ok(c.command.startsWith(c.binary), c.id);
    assert.ok(c.command.includes('{prompt}'), c.id);
  }
});

test('cadastro: salvar, tarefa com agente e modelo, remover tira a tarefa', () => {
  const agents = new CodeAgents(db());
  assert.equal(agents.available(), false);
  agents.save({ id: 'claude-code', name: 'Claude Code', command: 'claude -p --model {modelo} -- {prompt}', models: ['claude-haiku-5-5', ' claude-haiku-5-5 '], source: 'catalogo' });
  assert.deepEqual(agents.get('claude-code')?.models, ['claude-haiku-5-5']);
  assert.equal(agents.get('claude-code')?.binary, 'claude');
  agents.assign('investigar', 'claude-code', 'claude-haiku-5-5');
  assert.equal(agents.forTask('investigar')?.model, 'claude-haiku-5-5');
  assert.equal(agents.forTask('corrigir'), null);
  assert.equal(agents.describe(), 'investigar: Claude Code · claude-haiku-5-5');
  assert.throws(() => agents.assign('corrigir', 'nao-existe'), /não cadastrado/);
  assert.throws(() => agents.save({ id: 'Ruim', name: 'x', command: 'x' }), /kebab/);
  agents.remove('claude-code');
  assert.equal(agents.forTask('investigar'), null);
});

test('ORBI_CODE_AGENT continua valendo enquanto nada foi cadastrado', () => {
  const agents = new CodeAgents(db(), 'claude -p');
  assert.equal(agents.forTask('corrigir')?.agent.command, 'claude -p');
  assert.equal(agents.forTask('corrigir')?.agent.source, 'env');
  agents.save({ id: 'cursor', name: 'Cursor', command: 'cursor-agent -p {prompt}' });
  agents.assign('corrigir', 'cursor');
  assert.equal(agents.forTask('corrigir')?.agent.id, 'cursor');
  assert.equal(agents.forTask('investigar')?.agent.id, 'env');
});

test('agente de código de verdade (um script no lugar do claude): corrige na cópia, devolve arquivos e diff, e o push sobe', async (t) => {
  const { findShell } = await import('../src/terminal/shell.ts');
  const shell = findShell(process.env);
  if (!shell || process.platform === 'win32') return t.skip('precisa de bash');
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { createCodeFixer } = await import('../src/code-agents/index.ts');
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
  writeFileSync(agent, '#!/bin/bash\necho "1+1=2" > soma.txt\necho "corrigi a soma: $4" | head -c 40\n');
  const agents = new CodeAgents(db());
  agents.save({ id: 'script', name: 'Agente de teste', command: `bash ${agent} --model {modelo} -- {prompt}`, runIn: 'background' });
  agents.assign('corrigir', 'script', 'modelo-x');
  const fixer = createCodeFixer({ workspace: ws, scratchDir: join(root, 'scratch'), cliEnv: {}, agents, shell: () => shell });
  const fix = await fixer.prepare({ repo: 'org/app', branch: 'main', diagnosis: 'a soma está errada' });
  assert.deepEqual(fix.files, ['soma.txt']);
  assert.match(fix.diff, /\+1\+1=2/);
  assert.match(fix.summary, /corrigi a soma/);
  assert.equal(fix.agent, 'Agente de teste');
  assert.equal(fix.model, 'modelo-x');
  assert.match(await fixer.push(fix.id, 'Corrige a soma'), /enviado para main/);
  const fresh = join(root, 'conferir');
  g(root, 'clone', '-q', '-b', 'main', join(root, 'origin.git'), fresh);
  assert.equal(readFileSync(join(fresh, 'soma.txt'), 'utf8'), '1+1=2\n');
});


test('API: cadastra, escolhe agente e modelo por tarefa, recusa comando com dois programas', async () => {
  const { Hono } = await import('hono');
  const { codeAgentRoutes } = await import('../src/http/routes/code-agents.ts');
  const { installErrorHandling } = await import('../src/http/errors.ts');
  const app = new Hono();
  installErrorHandling(app);
  app.route('/api/code-agents', codeAgentRoutes({ codeAgents: new CodeAgents(db()), config: { scratchDir: tmpdir(), shell: null, cliEnv: {} } as never }));
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`/api/code-agents${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

  const initial = await (await call('GET', '')).json();
  assert.ok(initial.catalog.some((c: { id: string }) => c.id === 'devin'));
  assert.equal((await call('PUT', '/claude-code', { name: 'Claude Code', command: 'claude -p --model {modelo} -- {prompt}', models: ['claude-haiku-5-5'], source: 'catalogo' })).status, 200);
  assert.equal((await call('PUT', '/ruim', { name: 'x', command: 'claude -p; rm -rf ~' })).status, 400);
  const assigned = await (await call('PUT', '/tasks/investigar', { agent: 'claude-code', model: 'claude-haiku-5-5' })).json();
  assert.deepEqual(assigned.tasks, [{ task: 'investigar', agent: 'claude-code', model: 'claude-haiku-5-5' }]);
  assert.equal((await call('PUT', '/tasks/outra', { agent: 'claude-code' })).status, 404);
  const tested = await (await call('POST', '/claude-code/test', {})).json();
  assert.equal(tested.ok, false, 'sem shell, o teste diz o motivo em vez de quebrar');
  assert.equal((await call('DELETE', '/claude-code')).status, 200);
});

test('o agente roda com a sessão do desenvolvedor, sem as chaves e configurações do Orbi', async (t) => {
  const { findShell } = await import('../src/terminal/shell.ts');
  const { runShell } = await import('../src/terminal/exec.ts');
  const { rememberOrbiEnvKeys } = await import('../src/terminal/orbi-env.ts');
  const shell = findShell(process.env);
  if (!shell || process.platform === 'win32') return t.skip('precisa de bash');
  Object.assign(process.env, { HTTPS_PROXY: 'http://proxy.empresa:8080', ANTHROPIC_API_KEY: 'sk-do-orbi', ORBI_LLM: 'yara', GH_TOKEN_DO_ORBI: 'x' }); // ANTHROPIC_API_KEY here plays the developer's own
  rememberOrbiEnvKeys(['GH_TOKEN_DO_ORBI']);
  try {
    const r = await runShell(shell, 'echo "$HTTPS_PROXY|$ANTHROPIC_API_KEY|$ORBI_LLM|$GH_TOKEN_DO_ORBI"', { inherit: 'developer', shell, cwd: tmpdir() });
    const inside = !!process.env.CLAUDECODE; // this test may itself run inside a Claude Code session
    assert.equal(r.stdout.trim(), `http://proxy.empresa:8080|${inside ? '' : 'sk-do-orbi'}||`, 'proxy e chave da sessão do desenvolvedor sim; config e .env do Orbi não');
  } finally {
    for (const k of ['HTTPS_PROXY', 'ANTHROPIC_API_KEY', 'ORBI_LLM', 'GH_TOKEN_DO_ORBI']) delete process.env[k];
  }
});

test('Orbi iniciado de dentro de uma sessão do Claude Code: o agente não herda a identidade dela', async () => {
  const { orbiOwn } = await import('../src/terminal/orbi-env.ts');
  const parent = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 's' };
  assert.equal(orbiOwn('ANTHROPIC_BASE_URL', parent), true);
  assert.equal(orbiOwn('CLAUDE_CODE_OAUTH_TOKEN', parent), true);
  assert.equal(orbiOwn('HTTPS_PROXY', parent), false);
  assert.equal(orbiOwn('CLAUDE_CONFIG_DIR', {}), false, 'fora de uma sessão, a configuração do desenvolvedor vale');
});

test('janela do terminal: o script roda a linha, guarda a saída e o código, e o Orbi espera', async (t) => {
  const { findShell } = await import('../src/terminal/shell.ts');
  const shell = findShell(process.env);
  if (!shell || process.platform === 'win32') return t.skip('precisa de bash');
  const { runInTerminalWindow, windowScript } = await import('../src/code-agents/terminal-window.ts');
  const { spawn } = await import('node:child_process');
  const script = windowScript({ line: "echo 'oi do agente'", cwd: 'C:\\Users\\a', title: 'teste', log: 'C:\\x\\log', done: 'C:\\x\\fim' });
  assert.match(script, /cd 'C:\/Users\/a'/, 'caminhos do Windows com / para o bash');
  assert.match(script, /PIPESTATUS/);
  const dir = mkdtempSync(join(tmpdir(), 'orbi-win-'));
  // The "window": runs the script right here, like the terminal would.
  const open = (s: string) => { spawn('bash', [s], { stdio: 'ignore' }); };
  const ok = await runInTerminalWindow({ line: "echo 'oi do agente'", cwd: dir, title: 'teste', scratchDir: dir, shell, open, pollMs: 50 });
  assert.equal(ok.exitCode, 0);
  assert.match(ok.stdout, /oi do agente/);
  const bad = await runInTerminalWindow({ line: "echo 'Failed to authenticate' >&2; false", cwd: dir, title: 'teste', scratchDir: dir, shell, open, pollMs: 50 });
  assert.equal(bad.exitCode, 1);
  assert.match(bad.stderr, /Failed to authenticate/);
  const slow = await runInTerminalWindow({ line: 'sleep 5', cwd: dir, title: 'teste', scratchDir: dir, shell, open: () => {}, pollMs: 20, timeoutMs: 100 });
  assert.equal(slow.timedOut, true, 'janela que não termina: tempo esgotado');
});

test('plataforma: como abrir uma janela do terminal', async () => {
  const { platformFor } = await import('../src/platform/index.ts');
  assert.deepEqual(platformFor('darwin').terminalWindow('/t/run.command', null), { command: '/usr/bin/open', args: ['-a', 'Terminal', '/t/run.command'] });
  const win = platformFor('win32').terminalWindow('C:\\t\\run.command', 'C:\\Program Files\\Git\\bin\\bash.exe');
  assert.equal(win?.command, 'C:\\Program Files\\Git\\usr\\bin\\mintty.exe');
  assert.deepEqual(win?.args.slice(-3), ['/usr/bin/bash', '-l', 'C:/t/run.command']);
  assert.equal(platformFor('win32').terminalWindow('x', null), null);
});
