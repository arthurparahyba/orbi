/**
 * Fixing code with the coding agent of this machine, in the flow: an error nobody knows asks to
 * investigate and asks to apply; a known problem fixed by the agent goes alone where the rules
 * allow, and the developer is told (Pontos importantes).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, inbox, brain, components } from './support/flow.ts';

const { codeAgents, config, policy } = (await import('../src/services.ts')).services();
const root = config.workspace;
const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, stdio: 'pipe' }).toString();
const approve = (id: string) => app.request(`/api/inbox/${id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
const openIn = (conversation: string) => inbox.list({ status: 'open' }).filter((i) => i.conversationId === conversation);

before(() => {
  if (process.platform === 'win32' || !config.shell) return;
  // A bare "origin" and the clone in the workspace, with a bug on the delivery branch.
  g(root, 'init', '-q', '--bare', 'origin.git');
  g(root, 'clone', '-q', join(root, 'origin.git'), join(root, 'loja'));
  writeFileSync(join(root, 'loja', 'preco.txt'), 'R$ 1,234.56\n');
  g(join(root, 'loja'), 'add', '.');
  g(join(root, 'loja'), 'commit', '-qm', 'bug');
  g(join(root, 'loja'), 'push', '-q', 'origin', 'HEAD:feature/checkout');
  // The "coding agent": a script that fixes the file and says what it tried.
  mkdirSync(join(root, 'bin'), { recursive: true });
  const agent = join(root, 'bin', 'agente.sh');
  writeFileSync(agent, '#!/bin/bash\necho "R$ 1.234,56" > preco.txt\necho "tentativa 1: fixei pt-BR no formatador; testes passam"\n');
  codeAgents.save({ id: 'script', name: 'Agente de teste', command: `bash ${agent} --model {modelo} -- {prompt}`, models: ['modelo-x'], runIn: 'background' });
  codeAgents.assign('investigar', 'script', 'modelo-x');
  codeAgents.assign('corrigir', 'script', null);
});

test('erro que ninguém conhece: pede para investigar mesmo com comandos liberados, e pede para aplicar', async (t) => {
  if (process.platform === 'win32' || !config.shell) return t.skip('precisa de bash');
  policy.set('comandos-escrita', 'auto');
  policy.set('codigo-producao', 'auto');
  const id = 'chat:teste-investigar';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('code_agent_investigate', { repo: 'acme/loja', branch: 'feature/checkout', diagnosis: 'PriceTag espera R$ 1.234,56 e recebe R$ 1,234.56' }), { stopReason: 'toolUse' }),
  ]);
  const orbi = init(Orbi, { id });
  const first = await orbi.read(await orbi.dispatch('o job test quebrou no preço'));
  const ask = components(first).find((c: any) => c.component === 'approval') as any;
  assert.match(ask?.title ?? '', /Investigar com Agente de teste · modelo-x/, 'investigar sempre pede, até com tudo liberado');

  let fixId = '';
  faux.setResponses([
    (context) => {
      fixId = /"fixId\\?":\\?"([^"\\]+)/.exec(JSON.stringify(context))?.[1] ?? '';
      assert.ok(fixId, 'a investigação devolve o fixId');
      assert.match(JSON.stringify(context), /tentativa 1/);
      return fauxAssistantMessage(fauxToolCall('code_agent_push_fix', { fixId, commitMessage: 'Formata preço em pt-BR' }), { stopReason: 'toolUse' });
    },
  ]);
  const res = await approve(openIn(id)[0]!.id);
  const second = await orbi.read(await res.json());
  const apply = components(second).find((c: any) => c.component === 'approval' && /Aplicar a correção/.test(c.title)) as any;
  assert.ok(apply, 'aplicar o que a investigação achou também pede');

  faux.setResponses([fauxAssistantMessage(fauxText('Aplicada; rodando o passo de novo.'))]);
  const third = await orbi.read(await (await approve(openIn(id)[0]!.id)).json());
  const change = components(third).find((c: any) => c.component === 'code_change') as any;
  assert.equal(change?.alone, false);
  assert.equal(change?.inboxId, undefined, 'aprovada por você: nada a avisar em Pendências');
  const fresh = join(root, 'conferir-1');
  g(root, 'clone', '-q', '-b', 'feature/checkout', join(root, 'origin.git'), fresh);
  assert.equal(readFileSync(join(fresh, 'preco.txt'), 'utf8'), 'R$ 1.234,56\n');
});

test('problema conhecido corrigido pelo agente: segue sozinho onde as regras deixam, e avisa em Pendências', async (t) => {
  if (process.platform === 'win32' || !config.shell) return t.skip('precisa de bash');
  policy.set('comandos-escrita', 'auto');
  policy.set('codigo-producao', 'auto');
  // Back to the bug, on another delivery branch.
  g(join(root, 'loja'), 'push', '-q', 'origin', 'HEAD:feature/frete');
  brain.upsertType({ name: 'Problema', description: 'problemas conhecidos', relations: {}, requires: [] });
  brain.upsertEntity({ id: 'problema:preco-locale', type: 'Problema', props: { sintoma: 'espera R$ 1.234,56 recebe R$ 1,234.56', causa: 'formatador sem idioma', solucao: "fixar 'pt-BR' no formatador", quem_corrige: 'agente de código', conferir: 'npm test com LANG=en_US' }, body: '' });

  const id = 'chat:teste-conhecido';
  let prompt = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('code_agent_fix_known', { repo: 'acme/loja', branch: 'feature/frete', problem: 'problema:preco-locale', diagnosis: 'o mesmo teste de preço' }), { stopReason: 'toolUse' }),
    (context) => {
      prompt = JSON.stringify(context);
      const fixId = /"fixId\\?":\\?"([^"\\]+)/.exec(prompt)?.[1] ?? '';
      return fauxAssistantMessage(fauxToolCall('code_agent_push_fix', { fixId, commitMessage: 'Formata preço em pt-BR' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxText('Corrigido pelo problema conhecido.')),
  ]);
  const orbi = init(Orbi, { id });
  const reply = await orbi.read(await orbi.dispatch('o job test quebrou de novo no preço'));
  assert.equal(components(reply).some((c: any) => c.component === 'approval'), false, 'nada pediu aprovação');
  const change = components(reply).find((c: any) => c.component === 'code_change') as any;
  assert.equal(change?.alone, true);
  assert.match(change?.why, /Problema conhecido/);
  const note = inbox.get(change.inboxId)!;
  assert.equal(note.kind, 'code-change', 'fica em Pendências até você ver');
  const seen = await app.request(`/api/inbox/${note.id}/dismiss`, { method: 'POST' });
  assert.equal(seen.status, 200);
  assert.equal(inbox.get(note.id)!.status, 'answered');
});
