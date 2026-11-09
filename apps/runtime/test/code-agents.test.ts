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
  agents.save({ id: 'script', name: 'Agente de teste', command: `bash ${agent} --model {modelo} -- {prompt}` });
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
