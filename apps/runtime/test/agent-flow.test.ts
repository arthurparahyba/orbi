/**
 * The whole learn → approve → run loop through the real Flue runtime, with Pi's
 * faux provider standing in for Claude Haiku 5.5 (scripted responses, no API key).
 * It drives the agent through the same HTTP routes the desktop app uses.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'orbi-flow-'));
Object.assign(process.env, {
  ORBI_DATA_DIR: dataDir,
  ORBI_WORKSPACE: dataDir,
  CHROME_MCP_AUTOSTART: 'false',
  CHROME_MCP_PORT: '1', // nothing listens: the optional MCP mount degrades gracefully
  ANTHROPIC_API_KEY: 'faux',
});

const { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText } = await import('@earendil-works/pi-ai');
const { setProvider, init } = await import('@flue/runtime');
const { start } = await import('@flue/runtime/node');
const { Orbi } = await import('../src/agents/orbi.ts');
const { default: app } = await import('../src/app.ts');
const { brain, inbox } = (await import('../src/services.ts')).services();

const faux = fauxProvider({ provider: 'anthropic', models: [{ id: 'claude-haiku-5-5', reasoning: true, contextWindow: 200_000 }] });
setProvider(faux.provider);

// app.ts runs startBackground: tool outcomes and the review at the end of each turn are wired.
let flue: { [Symbol.asyncDispose](): Promise<void> };
before(async () => {
  flue = (await start({ agents: [Orbi] })) as never;
});
after(async () => {
  await flue[Symbol.asyncDispose]();
});

const conversation = 'chat:teste-fluxo';

/** Components of the last `ui` data part of a reply (the part carries the full list). */
function components(reply: { data: Record<string, unknown[]> }): any[] {
  const parts = (reply.data.ui ?? []) as Array<{ components: unknown[] }>;
  return parts.at(-1)?.components ?? [];
}

const playbook = {
  name: 'versao-no-portal',
  description: 'Atualizar a versão de um front-end no Portal interno depois do deploy em dev.',
  appliesTo: 'FrontEnd',
  trigger: 'deploy de um front concluído em dev',
  autonomy: 'auto',
  steps: [
    { id: 'abrir', label: 'Abrir o portal', how: 'mcp__chrome__navigate_page na URL do portal' },
    { id: 'salvar', label: 'Trocar a versão e salvar', how: 'browser_act fill + click; conferir no snapshot' },
  ],
  instructions: 'Use a sessão do Chrome. Se pedir login, pergunte ao desenvolvedor.',
};

test('aprender: brain_learn fica pendente até o desenvolvedor aprovar', async () => {
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall('brain_learn', {
        reason: 'Arthur ensinou a atualizar a versão no portal',
        items: [
          { kind: 'entity', payload: { id: 'FrontEnd', type: 'Classe', props: { requires: ['registradoEm'] } } },
          { kind: 'entity', payload: { id: 'portal-interno', type: 'Portal', props: { url: 'http://portal.local/admin/menus' } } },
          { kind: 'entity', payload: { id: 'novo-front', type: 'Repositorio' } },
          { kind: 'edge', payload: { from: 'novo-front', rel: 'eUm', to: 'FrontEnd' } },
          { kind: 'playbook', payload: playbook },
          // The brain starts empty: the types come in the same batch (even after the entities that use them).
          { kind: 'type', payload: { name: 'Classe', description: 'Categoria de coisas' } },
          { kind: 'type', payload: { name: 'Portal', description: 'Sistema web operado pelo navegador' } },
          { kind: 'type', payload: { name: 'Repositorio', description: 'Repositório de código', relations: { eUm: 'Classe' } } },
        ],
      }),
      { stopReason: 'toolUse' },
    ),
  ]);

  const orbi = init(Orbi, { id: conversation });
  const reply = await orbi.read(await orbi.dispatch('Vou te ensinar a atualizar a versão do front no portal.'));

  assert.equal(brain.playbook('versao-no-portal'), undefined, 'nada é gravado antes da aprovação');
  const card = components(reply).find((p: any) => p.component === 'approval') as any;
  assert.ok(card, 'a conversa recebeu um card de aprovação');
  const item = inbox.list({ status: 'open' }).find((i) => i.kind === 'learning');
  assert.ok(item, 'o aprendizado entrou na caixa "Pedem sua atenção"');
  assert.equal(card.inboxId, item.id);

  // The developer approves through the same route the app calls.
  faux.setResponses([fauxAssistantMessage(fauxText('Guardei o playbook versao-no-portal.'))]);
  const res = await app.request(`/api/inbox/${item.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'approve', approver: 'Arthur' }),
  });
  assert.equal(res.status, 202);
  const receipt = await res.json();
  const after = await orbi.read(receipt);
  assert.match(after.text, /Guardei/);

  assert.ok(brain.playbook('versao-no-portal'), 'playbook gravado no cérebro');
  assert.equal(brain.get('novo-front')?.type, 'Repositorio');
  assert.deepEqual(brain.gaps(), [{ entity: 'novo-front', type: 'Repositorio', missing: 'registradoEm' }],
    'a regra da classe FrontEnd aponta a lacuna: em qual portal o novo-front aparece?');
});

test('executar: o playbook aprendido aparece como skill e vira um passo a passo', async () => {
  faux.setResponses([
    (context) => {
      // The learned playbook is in the system prompt's skill catalog.
      assert.match(JSON.stringify(context), /versao-no-portal/);
      return fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'versao-no-portal', target: 'novo-front' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'abrir', status: 'done', note: 'portal aberto' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'salvar', status: 'done', note: 'versão 0.1.0 salva' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Versão do novo-front atualizada no portal.')),
  ]);

  const orbi = init(Orbi, { id: 'chat:teste-execucao' });
  const reply = await orbi.read(await orbi.dispatch('Atualiza a versão do novo-front no portal.'));

  const run = brain.runs()[0];
  assert.equal(run.playbook, 'versao-no-portal');
  assert.equal(run.status, 'done');
  const steppers = components(reply).filter((p: any) => p.component === 'stepper') as any[];
  // One stepper (same id) updated in place as each step finished.
  assert.equal(steppers.length, 1);
  const last = steppers[0];
  assert.equal(last.status, 'done', 'o passo a passo chegou ao fim');
  assert.deepEqual(last.steps.map((s: any) => s.status), ['done', 'done']);
  assert.equal(brain.playbook('versao-no-portal')?.successes, 1);
});

test('já sei algo parecido: igual não interrompe; parecido mostra o cartão e vira variação', async () => {
  // The same thing: one line ("Já sei fazer isso") and the turn goes on.
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_similar', { text: 'atualizar versão do front no portal' }), { stopReason: 'toolUse' }),
    (context) => {
      assert.match(JSON.stringify(context), /versao-no-portal/, 'a busca achou o playbook pelo objetivo');
      return fauxAssistantMessage(fauxToolCall('similar_found', { verdict: 'same', playbook: 'versao-no-portal' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxText('Seguindo o versao-no-portal.')),
  ]);
  const same = init(Orbi, { id: 'chat:teste-igual' });
  const sameReply = await same.read(await same.dispatch('Atualiza a versão do front no portal'));
  const known = components(sameReply).find((p: any) => p.component === 'known') as any;
  assert.equal(known.playbook.name, 'versao-no-portal');
  assert.equal(known.playbook.successes, 1, 'o histórico vem do cérebro, não do modelo');
  assert.match(sameReply.text, /Seguindo/);

  // Similar: the card, a question in the inbox, and the turn ends.
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('similar_found', {
      verdict: 'similar',
      playbook: 'versao-no-portal',
      known: 'Sei atualizar a versão no portal interno; no portal de parceiros você ainda não me mostrou.',
      relation: 'mesmo objetivo, outro lugar',
      reuse: ['Abrir o portal'],
      changes: ['Outro portal e outra aba'],
      suggestion: 'Guardar como variação: os dois portais continuam valendo.',
      options: [{ label: 'Guardar como variação' }, { label: 'Substituir o que eu sabia' }, { label: 'São coisas diferentes' }],
    }), { stopReason: 'toolUse' }),
  ]);
  const conv = init(Orbi, { id: 'chat:teste-parecido' });
  const reply = await conv.read(await conv.dispatch('Atualiza a versão do front no portal de parceiros'));
  const card = components(reply).find((p: any) => p.component === 'similar') as any;
  assert.ok(card, 'cartão "Já sei algo parecido"');
  assert.equal(card.playbook.uses, 1);
  assert.deepEqual(card.options.map((o: any) => o.label), ['Guardar como variação', 'Substituir o que eu sabia', 'São coisas diferentes']);
  const question = inbox.get(card.inboxId)!;
  assert.equal(question.kind, 'question');
  assert.equal(question.status, 'open');

  // The developer chooses; Orbi stores a variation, which waits for approval as any learning.
  faux.setResponses([
    (context) => {
      assert.match(JSON.stringify(context), /Guardar como variação/, 'a escolha chegou ao agente');
      return fauxAssistantMessage(fauxToolCall('brain_learn', {
        reason: 'variação para o portal de parceiros',
        items: [{ kind: 'playbook', payload: {
          ...playbook,
          name: 'versao-no-portal-parceiros',
          variationOf: 'versao-no-portal',
          steps: [playbook.steps[0], { id: 'salvar', label: 'Trocar o release e salvar', how: 'aba Publicação, campo Release' }],
        } }],
      }), { stopReason: 'toolUse' });
    },
  ]);
  const answered = await app.request(`/api/inbox/${card.inboxId}/answer`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Guardar como variação' }),
  });
  assert.equal(answered.status, 202);
  await conv.read(await answered.json());
  const learning = inbox.list({ status: 'open' }).find((i) => i.kind === 'learning' && i.conversationId === 'chat:teste-parecido')!;
  faux.setResponses([fauxAssistantMessage(fauxText('Guardei a variação.'))]);
  const approved = await app.request(`/api/inbox/${learning.id}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }),
  });
  await conv.read(await approved.json());
  assert.equal(brain.playbook('versao-no-portal-parceiros')?.variationOf, 'versao-no-portal');
  assert.equal(brain.playbook('versao-no-portal')?.steps[1].label, 'Trocar a versão e salvar', 'a base não muda');
});

test('agendar retorno: o Orbi encerra o turno e é acordado depois', async () => {
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('schedule_followup', { minutes: 5, note: 'conferir o run 123 do ci.yml' }), { stopReason: 'toolUse' }),
  ]);
  const orbi = init(Orbi, { id: 'chat:teste-retorno' });
  await orbi.read(await orbi.dispatch('Acompanha o CI do api-pagamentos.'));
  const later = new Date(Date.now() + 6 * 60_000).toISOString();
  const due = brain.claimDueFollowups(later);
  assert.equal(due.length, 1);
  assert.equal(due[0].conversationId, 'chat:teste-retorno');
  assert.equal(brain.claimDueFollowups(later).length, 0, 'cada retorno dispara uma vez só');
});

test('pedido de agente (MCP): delega, o Orbi roda o procedimento e devolve o resultado', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const { agents, vault } = (await import('../src/services.ts')).services();
  await vault.set('github/senha', 'valor-que-nao-vaza', { description: 'Senha do GitHub' });
  const created = await app.request('/api/agents/clients', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Claude Code' }) });
  const { token } = (await created.json()) as { token: string };
  const client = new Client({ name: 'teste', version: '0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3000/mcp'), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
      fetch: async (url, init) => app.request(String(url), init as RequestInit),
    }),
  );

  faux.setResponses([
    (context) => {
      const prompt = JSON.stringify(context);
      assert.match(prompt, /Pedido do agente \\"Claude Code\\" pelo MCP/);
      assert.match(prompt, /agent_reply/, 'a conversa pedida por um agente tem a ferramenta de resposta');
      assert.match(prompt, /\{\{segredo:github\/senha\}\} \(Senha do GitHub\)/, 'o Orbi sabe o nome das credenciais do cofre');
      assert.equal(prompt.includes('valor-que-nao-vaza'), false, 'mas nunca o valor');
      return fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'versao-no-portal', target: 'novo-front' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'abrir', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'salvar', status: 'done', note: 'versão 0.2.0 salva' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('agent_reply', { status: 'done', summary: 'Versão 0.2.0 do novo-front salva no portal.', links: ['http://portal.local/admin/menus'] }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Feito, avisei o agente.')),
  ]);

  const res = (await client.callTool({
    name: 'orbi_delegate',
    arguments: { procedure: 'versao-no-portal', task: 'Atualizar a versão do novo-front para 0.2.0', context: { repo: 'acme/novo-front', branch: 'main' } },
  })) as { content: Array<{ text: string }> };
  const { request_id } = JSON.parse(res.content[0].text) as { request_id: string };

  const status = async () => JSON.parse(((await client.callTool({ name: 'orbi_status', arguments: { request_id } })) as { content: Array<{ text: string }> }).content[0].text);
  for (let i = 0; i < 100 && agents.requests.get(request_id)?.status === 'running'; i++) await new Promise((r) => setTimeout(r, 50));
  const final = await status();
  assert.equal(final.status, 'done');
  assert.equal(final.summary, 'Versão 0.2.0 do novo-front salva no portal.');
  assert.deepEqual(final.links, ['http://portal.local/admin/menus']);

  const list = (await (await app.request('/api/conversations')).json()) as Array<{ id: string; origin?: { agent: string; repo?: string } }>;
  const conv = list.find((c) => c.origin?.agent === 'Claude Code');
  assert.ok(conv, 'a conversa aparece marcada com quem pediu');
  assert.equal(conv.origin?.repo, 'acme/novo-front');
  assert.equal(brain.lastRunIn(conv.id)?.status, 'done');
  await client.close();
});

test('esteira pedida por agente (MCP): roda a etapa, para na passagem que pergunta, segue com o desenvolvedor e responde', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const { agents, pipelines } = (await import('../src/services.ts')).services();
  const pb = (name: string, label: string, outputs: string[]) =>
    brain.savePlaybook({
      name, description: name, trigger: '', appliesTo: null, autonomy: 'auto', instructions: '', learnedFrom: null, variationOf: null,
      steps: [{ id: 'p0', label, how: '' }], outputs: outputs.map((o) => ({ name: o, description: o })),
    });
  pb('workflow-dev-teste', 'Acompanhar o workflow de {{repo}}', ['versao']);
  pb('promover-hml-teste', 'Promover {{versao}} para homologação', ['url_hml']);
  brain.savePipeline({
    name: 'entrega-teste',
    description: 'Do workflow de dev até homologação',
    inputs: [{ name: 'repo', description: 'repositório' }],
    stages: [
      { id: 'dev', label: 'Workflow dev', passage: 'auto', options: [{ playbook: 'workflow-dev-teste' }] },
      { id: 'hml', label: 'Homologação', passage: 'ask', options: [{ playbook: 'promover-hml-teste' }] },
    ],
  });
  const json = async (res: Response) => (await res.json()) as any;
  const created = await json(await app.request('/api/agents/clients', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Codex' }) }));
  await app.request(`/api/agents/clients/${created.client.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ canRunPipelines: true }) });
  const client = new Client({ name: 'teste', version: '0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3000/mcp'), {
      requestInit: { headers: { authorization: `Bearer ${created.token}` } },
      fetch: async (url, init) => app.request(String(url), init as RequestInit),
    }),
  );
  const call = async (name: string, args: Record<string, unknown>) =>
    JSON.parse(((await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }> }).content[0].text);
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(ok());
  };

  // Stage 1 runs alone; the destination given by an agent does not open the passage that asks.
  faux.setResponses([
    (context) => {
      assert.match(JSON.stringify(context), /etapa 1 de 2 \(Workflow dev\)/);
      return fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'workflow-dev-teste', params: { repo: 'acme/portal' } }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'p0', status: 'done', outputs: { versao: '2.5.0' } }), { stopReason: 'toolUse' }),
    (context) => {
      assert.match(JSON.stringify(context), /autorização do desenvolvedor/);
      return fauxAssistantMessage(fauxText('Workflow dev terminou; a homologação espera você.'));
    },
  ]);
  const { request_id } = await call('orbi_run_pipeline', { name: 'entrega-teste', inputs: { repo: 'acme/portal' }, destination: 'hml' });
  const conversationId = agents.requests.get(request_id)!.conversationId;
  await until(() => pipelines.runs.inConversation(conversationId)?.status === 'waiting');
  let status = await call('orbi_status', { request_id });
  assert.equal(status.status, 'waiting');
  assert.equal(status.pipeline.stage, '2 de 2 · Homologação');
  assert.deepEqual(status.pipeline.data, { 'dev.versao': '2.5.0' });

  // The developer lets it go on: stage 2 gets versao from stage 1, then Orbi answers the agent.
  faux.setResponses([
    (context) => {
      assert.match(JSON.stringify(context), /promover-hml-teste.*versao.*2\.5\.0/);
      return fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'promover-hml-teste', params: { versao: '2.5.0' } }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'p0', status: 'done', outputs: { url_hml: 'https://hml.acme/portal' } }), { stopReason: 'toolUse' }),
    (context) => {
      assert.match(JSON.stringify(context), /responda ao agente com agent_reply/);
      return fauxAssistantMessage(fauxToolCall('agent_reply', { status: 'done', summary: 'Portal 2.5.0 em homologação.', links: ['https://hml.acme/portal'] }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxText('Entrega concluída.')),
  ]);
  const run = pipelines.runs.inConversation(conversationId)!;
  const decided = await app.request(`/api/pipeline-runs/${run.id}/decide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'continue' }) });
  assert.equal(decided.status, 202);
  await until(() => agents.requests.get(request_id)?.status === 'done');
  status = await call('orbi_status', { request_id });
  assert.equal(status.summary, 'Portal 2.5.0 em homologação.');
  assert.equal(pipelines.runs.get(run.id)?.status, 'done');
  assert.deepEqual(status.pipeline.data, { 'dev.versao': '2.5.0', 'hml.url_hml': 'https://hml.acme/portal' });
  await client.close();
});

test('revisão no fim: falha em paralelo com o passo é pega, pede correção e não sobe; execução limpa sobe; Manter desfaz', async () => {
  brain.savePlaybook({
    name: 'mostrar-top', description: 'Mostra o top', trigger: '', appliesTo: null, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null,
    steps: [{ id: 'mostrar', label: 'Mostrar no chat', how: 'show_ui table' }],
  });
  const card = { component: { component: 'status', id: 's1', title: 'Top 10', state: 'info', text: '10 de 100' } };
  const until = async (ok: () => boolean, what: string) => {
    for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(ok(), what);
  };

  // As the real model did: the failing show_ui and the step's "done" in the same batch.
  let review = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'mostrar-top' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage([fauxToolCall('show_ui', {}), fauxToolCall('playbook_step', { stepId: 'mostrar', status: 'done', note: 'Tabela exibida' })], { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Mostrei o top.')),
    (context) => {
      review = JSON.stringify(context);
      return fauxAssistantMessage(fauxText('Proponho corrigir o passo de mostrar.'));
    },
  ]);
  const first = init(Orbi, { id: 'chat:teste-revisao-1' });
  await first.read(await first.dispatch('mostra o top'));
  await until(() => review !== '', 'a revisão chega à conversa');
  assert.match(review, /Revisão da execução, feita pelo runtime/);
  assert.match(review, /passo mostrar foi dado como feito.*mas show_ui falhou/);
  assert.match(review, /UM brain_learn/);
  const run1 = brain.lastRunIn('chat:teste-revisao-1')!;
  assert.deepEqual(run1.deviations.map((d) => [d.kind, d.tool, d.step]), [['falha', 'show_ui', 'mostrar']]);
  assert.equal(brain.playbook('mostrar-top')!.level, 1, 'com problema não sobe');
  assert.equal(brain.unreviewedRunsIn('chat:teste-revisao-1').length, 0);

  // A clean run: the review brings the level change (card data in the signal) and a note in Pendências.
  let clean = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'mostrar-top' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('show_ui', card), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'mostrar', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Pronto.')),
    (context) => {
      clean = JSON.stringify(context);
      return fauxAssistantMessage(fauxText('Subiu para N2.'));
    },
  ]);
  const second = init(Orbi, { id: 'chat:teste-revisao-2' });
  await second.read(await second.dispatch('mostra o top de novo'));
  await until(() => clean !== '', 'a revisão da execução limpa chega');
  assert.match(clean, /mostrar-top sem problemas/);
  assert.equal(brain.playbook('mostrar-top')!.level, 2);
  const note = inbox.list({ status: 'open' }).find((i) => i.kind === 'level' && i.routine === 'playbook:mostrar-top')!;
  assert.equal(note.title, 'mostrar-top subiu para N2 · Assistido');
  const kept = await app.request(`/api/inbox/${note.id}/keep`, { method: 'POST' });
  assert.equal(kept.status, 200);
  assert.deepEqual([brain.playbook('mostrar-top')!.level, brain.playbook('mostrar-top')!.levelBy], [1, 'user']);
  assert.equal((await app.request(`/api/inbox/${note.id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) })).status, 409);
});

test('passo esquecido: marcar o último com outro aberto avisa na hora, e o procedimento só termina fechando', async () => {
  brain.savePlaybook({
    name: 'coletar-teste', description: 'Coleta', trigger: '', appliesTo: null, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null,
    steps: [{ id: 'buscar', label: 'Buscar', how: '' }, { id: 'montar', label: 'Montar', how: '' }, { id: 'entregar', label: 'Entregar', how: '' }],
  });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'coletar-teste' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'buscar', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'entregar', status: 'done' }), { stopReason: 'toolUse' }),
    (context) => {
      assert.match(JSON.stringify(context), /pendentes.*montar.*Sem isso, a esteira não segue/);
      return fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'montar', status: 'done', note: 'montado junto com buscar' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxText('Pronto.')),
    () => {
      reviewed = true;
      return fauxAssistantMessage(fauxText('Subiu para N2.'));
    },
  ]);
  let reviewed = false;
  const orbi = init(Orbi, { id: 'chat:teste-passo-esquecido' });
  await orbi.read(await orbi.dispatch('coleta'));
  assert.equal(brain.lastRunIn('chat:teste-passo-esquecido')!.status, 'done');
  for (let i = 0; i < 100 && !reviewed; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(reviewed, 'a revisão (subiu de nível) chega');
});

test('credencial pela conversa: o cartão guarda no cofre e o Orbi só recebe a referência', async () => {
  const { vault } = (await import('../src/services.ts')).services();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('ask_secret', { name: 'gitlab/token', description: 'Token do GitLab', reason: 'para entrar no GitLab e apagar o repositório' }), { stopReason: 'toolUse' }),
  ]);
  const orbi = init(Orbi, { id: 'chat:teste-credencial' });
  const reply = await orbi.read(await orbi.dispatch('Vou te ensinar a apagar um repositório no GitLab.'));
  const card = components(reply).find((p: any) => p.component === 'secret') as any;
  assert.equal(card?.name, 'gitlab/token');
  const item = inbox.get(card.inboxId)!;
  assert.equal(item.kind, 'secret');

  faux.setResponses([
    (context) => {
      const prompt = JSON.stringify(context);
      assert.match(prompt, /guardou a credencial no cofre: \{\{segredo:gitlab\/token\}\}/);
      assert.equal(prompt.includes('glpat-nao-pode-vazar'), false, 'o valor nunca chega ao modelo');
      return fauxAssistantMessage(fauxText('Credencial pronta, seguindo.'));
    },
  ]);
  const res = await app.request(`/api/inbox/${item.id}/secret`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'gitlab/token', value: 'glpat-nao-pode-vazar', description: 'Token do GitLab' }),
  });
  assert.equal(res.status, 202);
  await orbi.read(await res.json());
  assert.equal(await vault.get('gitlab/token'), 'glpat-nao-pode-vazar');
  assert.equal(inbox.get(item.id)?.answer, '{{segredo:gitlab/token}}', 'a pendência guarda a referência, não o valor');
  const again = await app.request(`/api/inbox/${item.id}/secret`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'gitlab/token', value: 'x' }) });
  assert.equal(again.status, 409);
});
