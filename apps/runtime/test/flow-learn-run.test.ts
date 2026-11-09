import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, inbox, components, playbook, conversation } from './support/flow.ts';

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
