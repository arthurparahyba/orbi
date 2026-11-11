/**
 * The HTTP API, route by route: bodies validated against @orbi/contracts and
 * every error in the ApiError shape. (Approving and answering, which talk to
 * the agent, run end to end in agent-flow.test.ts.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { createOrbi } from '../src/compose.ts';
import { createHttpApp } from '../src/http/app.ts';
import { Orbi } from '../src/agents/orbi.ts';

const background = { bridge: () => undefined, bridgeError: () => 'desligado', restartChrome: async () => {}, stop: async () => {} };

async function setup(env: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-http-'));
  const orbi = await createOrbi(loadConfig({ ORBI_VAULT: 'file', CHROME_MCP_AUTOSTART: 'false', ...env }, cwd), {}, {});
  const app = createHttpApp(orbi, background, Orbi);
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { orbi, call };
}

const isApiError = (json: any, code: string) => {
  assert.equal(json.error?.code, code, JSON.stringify(json));
  assert.equal(typeof json.error.message, 'string');
};

test('conversas: criar, renomear, validar', async () => {
  const { call } = await setup();
  assert.deepEqual((await call('GET', '/api/conversations')).json, []);
  const created = await call('POST', '/api/conversations', {});
  assert.equal(created.status, 201);
  assert.equal(created.json.title, 'Nova conversa');
  const renamed = await call('PATCH', `/api/conversations/${created.json.id}`, { title: 'Deploy do portal' });
  assert.equal(renamed.json.title, 'Deploy do portal');

  const bad = await call('POST', '/api/conversations', { title: 42 });
  assert.equal(bad.status, 400);
  isApiError(bad.json, 'invalid_body');
  assert.equal(bad.json.error.details[0].path, 'title');
  const empty = await call('PATCH', `/api/conversations/${created.json.id}`, { title: '' });
  assert.equal(empty.status, 400);
  const missing = await call('PATCH', '/api/conversations/chat:nao-existe', { title: 'x' });
  assert.equal(missing.status, 404);
  isApiError(missing.json, 'not_found');
});

test('conversas: apagar some da lista e leva as pendências e o pedido do agente junto', async () => {
  const { orbi, call } = await setup();
  const a = (await call('POST', '/api/conversations', { title: 'fica' })).json;
  const b = (await call('POST', '/api/conversations', { title: 'apaga' })).json;
  orbi.inbox.add({ kind: 'question', conversationId: b.id, title: 'pergunta', detail: '' });
  orbi.inbox.add({ kind: 'question', conversationId: a.id, title: 'outra', detail: '' });
  const client = orbi.agents.clients.create('Claude Code').client;
  const req = orbi.agents.requests.add({ clientId: client.id, conversationId: b.id, task: 't', procedure: null, context: {} });

  assert.deepEqual((await call('DELETE', `/api/conversations/${b.id}`)).json, { deleted: true });
  assert.deepEqual((await call('GET', '/api/conversations')).json.map((c: any) => c.title), ['fica']);
  assert.deepEqual(orbi.inbox.list().map((i) => i.title), ['outra']);
  assert.equal(orbi.agents.requests.get(req.id)?.status, 'failed', 'o agente fica sabendo que a conversa foi apagada');
  assert.equal((await call('DELETE', `/api/conversations/${b.id}`)).status, 404);
});

test('ditado: o áudio vira texto e volta; nada vai para a conversa', async () => {
  const { orbi } = await setup();
  const app = createHttpApp(orbi, background, Orbi);
  const wav = Buffer.alloc(44 + 3200);
  wav.write('RIFF', 0); wav.write('WAVE', 8);
  const post = (body: Buffer) => app.request('/api/transcribe', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: new Uint8Array(body) });

  orbi.stt.set({ name: 'fake', transcribe: async (audio) => `ouvi ${audio.length} bytes` });
  assert.deepEqual(await (await post(wav)).json(), { text: `ouvi ${wav.length} bytes` });
  assert.equal((await post(Buffer.alloc(10))).status, 400);

  orbi.stt.set({ name: 'fake', transcribe: async () => { throw new Error('modelo não carregou'); } });
  const failed = await post(wav);
  assert.equal(failed.status, 500);
  assert.match(((await failed.json()) as any).error.message, /modelo não carregou/);

  orbi.stt.set(null);
  assert.equal((await post(wav)).status, 409, 'transcrição desligada');
  assert.deepEqual(orbi.conversations.list(), []);
});

test('pendências: filtro, validação e itens já decididos', async () => {
  const { orbi, call } = await setup();
  const approval = orbi.inbox.add({ kind: 'approval', conversationId: 'chat:1', title: 'Subir para dev', detail: '', approvalId: 'tc1' });
  const question = orbi.inbox.add({ kind: 'question', conversationId: 'chat:1', title: 'Qual branch?', detail: '' });
  assert.equal((await call('GET', '/api/inbox')).json.length, 2);
  isApiError((await call('GET', '/api/inbox?status=talvez')).json, 'invalid_query');

  const bad = await call('POST', `/api/inbox/${approval.id}/decision`, { decision: 'talvez' });
  assert.equal(bad.status, 400);
  isApiError(bad.json, 'invalid_body');
  assert.equal((await call('POST', '/api/inbox/nao-existe/decision', { decision: 'approve' })).status, 404);
  const notQuestion = await call('POST', `/api/inbox/${approval.id}/answer`, { text: 'main' });
  assert.equal(notQuestion.status, 409);
  const notApproval = await call('POST', `/api/inbox/${question.id}/decision`, { decision: 'approve' });
  assert.equal(notApproval.status, 409);

  orbi.inbox.resolve(approval.id, 'denied');
  const again = await call('POST', `/api/inbox/${approval.id}/decision`, { decision: 'approve' });
  assert.equal(again.status, 409);
  assert.match(again.json.error.message, /já foi decidido \(denied\)/);
  assert.equal((await call('GET', '/api/inbox?status=')).json.length, 2, '?status= lista tudo');
  assert.equal((await call('GET', '/api/inbox?status=denied')).json.length, 1);
});

test('gravações: validação e gravação inexistente', async () => {
  const { call } = await setup();
  assert.equal((await call('GET', '/api/recordings/active')).json, null);
  isApiError((await call('POST', '/api/recordings', { url: 'http://x' })).json, 'invalid_body');
  assert.equal((await call('GET', '/api/recordings/rec_x')).status, 404);
  assert.equal((await call('POST', '/api/recordings/rec_x/stop', {})).status, 404);
});

test('cofre: grava, lista sem valor e apaga', async () => {
  const { call } = await setup();
  isApiError((await call('PUT', '/api/vault/portal/senha', { value: '' })).json, 'invalid_body');
  assert.equal((await call('PUT', '/api/vault/portal/senha', { value: 'hunter2', description: 'Senha do portal' })).status, 200);
  const listed = await call('GET', '/api/vault');
  assert.deepEqual(listed.json.secrets.map((s: any) => s.name), ['portal/senha']);
  assert.ok(!JSON.stringify(listed.json).includes('hunter2'), 'o valor nunca sai pela API');
  assert.equal(listed.json.secrets[0].origin, 'adicionada por você');
  isApiError((await call('PUT', '/api/vault/GitHub Senha', { value: 'x' })).json, 'invalid_body');
  assert.equal((await call('DELETE', '/api/vault/portal/senha')).json.deleted, true);
});

test('cérebro e autonomia: leitura, 404 e validação', async () => {
  const { call } = await setup();
  const brain = await call('GET', '/api/brain');
  assert.deepEqual(brain.json.types, [], 'o cérebro começa vazio');
  assert.ok('stats' in brain.json);
  assert.equal((await call('GET', '/api/brain/entities/nada')).status, 404);
  assert.equal((await call('PATCH', '/api/brain/playbooks/nada', { autonomy: 'auto' })).status, 404);
  isApiError((await call('PATCH', '/api/brain/playbooks/nada', { autonomy: 'sempre' })).json, 'invalid_body');

  isApiError((await call('PATCH', '/api/autonomy', { category: 'tudo', level: 'auto' })).json, 'invalid_body');
  const set = await call('PATCH', '/api/autonomy', { category: 'comandos-escrita', level: 'auto' });
  assert.equal(set.json.categories['comandos-escrita'], 'auto');
  assert.equal((await call('GET', '/api/autonomy')).json.categories['comandos-escrita'], 'auto');
});

test('cérebro: editar e apagar entidades e procedimentos', async () => {
  const { orbi, call } = await setup();
  orbi.brain.upsertType({ name: 'Portal', description: '', relations: {}, requires: [] });
  orbi.brain.upsertEntity({ id: 'portal', type: 'Portal', props: { url: 'a' }, body: '' });
  orbi.brain.savePlaybook({ name: 'abrir-portal', description: 'Abre', trigger: '', appliesTo: null, autonomy: 'ask', steps: [{ id: 'a', label: 'Abrir', how: '' }], instructions: '', learnedFrom: null, variationOf: null });

  assert.equal((await call('GET', '/api/brain/entities/portal')).json.dependents.relations, 0);
  assert.equal((await call('PATCH', '/api/brain/entities/portal', { props: { url: 'b' } })).json.props.url, 'b');
  isApiError((await call('PATCH', '/api/brain/entities/portal', { body: 3 })).json, 'invalid_body');
  assert.equal((await call('PATCH', '/api/brain/entities/nada', {})).status, 404);

  const bad = await call('PUT', '/api/brain/playbooks/abrir-portal', { steps: [{ id: 'x', label: 'A', how: '' }, { id: 'x', label: 'B', how: '' }] });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error.message, /repetido/);
  isApiError((await call('PUT', '/api/brain/playbooks/abrir-portal', { steps: [] })).json, 'invalid_body');
  const ok = await call('PUT', '/api/brain/playbooks/abrir-portal', { trigger: 'deploy', steps: [{ id: 'a', label: 'Abrir o portal', how: 'navegador' }] });
  assert.equal(ok.json.steps[0].label, 'Abrir o portal');
  assert.equal(ok.json.trigger, 'deploy');

  assert.deepEqual((await call('DELETE', '/api/brain/playbooks/abrir-portal')).json, { deleted: true, detachedVariations: [] });
  assert.equal((await call('DELETE', '/api/brain/playbooks/abrir-portal')).status, 404);
  assert.deepEqual((await call('DELETE', '/api/brain/entities/portal')).json, { deleted: true, relations: 0 });
});

test('health, rota inexistente e token', async () => {
  const { call } = await setup({ ORBI_API_TOKEN: 'segredo' });
  const denied = await call('GET', '/api/health');
  assert.equal(denied.status, 401);
  isApiError(denied.json, 'unauthorized');
  const auth = { authorization: 'Bearer segredo' };
  const health = await call('GET', '/api/health', undefined, auth);
  assert.equal(health.json.llm, 'anthropic');
  assert.deepEqual(health.json.chrome, { error: 'desligado' });
  const missing = await call('GET', '/api/nada', undefined, auth);
  assert.equal(missing.status, 404);
  isApiError(missing.json, 'not_found');
});

test('modelo por conversa: opções do provedor com custo, escolher, voltar ao padrão, classificar', async () => {
  const { call } = await setup();
  const choices = await call('GET', '/api/model/choices');
  const def = choices.json.default;
  assert.equal(choices.json.models[0].id, def, 'o padrão vem primeiro');
  assert.deepEqual(choices.json.models.find((m: any) => m.id === 'claude-sonnet-5-5'), { id: 'claude-sonnet-5-5', tier: 'standard', tierBy: 'conhecido' });

  const conv = (await call('POST', '/api/conversations', {})).json;
  const chosen = await call('PUT', `/api/conversations/${conv.id}/model`, { model: 'claude-opus-5-5' });
  assert.equal(chosen.json.model, 'claude-opus-5-5');
  assert.equal((await call('GET', '/api/conversations')).json[0].model, 'claude-opus-5-5');
  const unknown = await call('PUT', `/api/conversations/${conv.id}/model`, { model: 'gpt-qualquer' });
  assert.equal(unknown.status, 400);
  isApiError(unknown.json, 'unknown_model');
  const back = await call('PUT', `/api/conversations/${conv.id}/model`, { model: null });
  assert.equal(back.json.model, undefined);

  const tiered = await call('PUT', '/api/model/tiers', { model: 'claude-opus-5-5', tier: 'standard' });
  assert.deepEqual(tiered.json.models.find((m: any) => m.id === 'claude-opus-5-5'), { id: 'claude-opus-5-5', tier: 'standard', tierBy: 'voce' });
  const bad = await call('PUT', '/api/model/tiers', { model: 'x', tier: 'caríssimo' });
  assert.equal(bad.status, 400);
  const roles = await call('GET', '/api/model/roles');
  assert.equal(roles.json.aprender.set, false);
  const learn = await call('PUT', '/api/model/roles', { role: 'aprender', model: 'claude-opus-5-5' });
  assert.deepEqual(learn.json.aprender, { model: 'claude-opus-5-5', set: true });
  const cleared = await call('PUT', '/api/model/roles', { role: 'aprender', model: null });
  assert.equal(cleared.json.aprender.set, false);
  assert.equal((await call('PUT', '/api/model/roles', { role: 'outro', model: null })).status, 400);
});
