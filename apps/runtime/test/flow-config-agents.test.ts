import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Configurador, app, inbox, components } from './support/flow.ts';

// The configuration chat is its own agent: it looks, proposes on a card, and saves only when approved.
test('chat de configuração: propõe o cadastro num cartão, salva só depois de aprovado, e a aprovação volta para ele', async () => {
  const { codeAgents } = (await import('../src/services.ts')).services();
  const id = 'config:agentes-de-codigo';
  faux.setResponses([
    (context) => {
      const prompt = JSON.stringify(context);
      assert.match(prompt, /Agentes de código/, 'as instruções são as do chat de configuração');
      assert.equal(prompt.includes('playbook_start'), false, 'sem as ferramentas do Orbi das conversas');
      return fauxAssistantMessage(fauxToolCall('code_agents_register', {
        reason: 'achei o Claude Code no PATH; o --help mostra -p e --model',
        agents: [{ id: 'claude-code', name: 'Claude Code', command: 'claude -p --model {modelo} -- {prompt}', models: ['claude-haiku-5-5'], source: 'catalogo' }],
        tasks: [{ task: 'investigar', agent: 'claude-code', model: 'claude-haiku-5-5' }],
      }), { stopReason: 'toolUse' });
    },
  ]);
  const chat = init(Configurador, { id });
  const reply = await chat.read(await chat.dispatch('vê quais agentes eu tenho e cadastra'));
  const card = components(reply).find((p: any) => p.component === 'approval') as any;
  assert.ok(card, 'cartão de aprovação na conversa de configuração');
  assert.match(card.title, /Cadastrar o agente Claude Code/);
  assert.equal(codeAgents.get('claude-code'), undefined, 'nada salvo antes de aprovar');

  const item = inbox.list({ status: 'open' }).find((i) => i.conversationId === id)!;
  faux.setResponses([fauxAssistantMessage(fauxText('Cadastrado: o Claude Code investiga com claude-haiku-5-5.'))]);
  const res = await app.request(`/api/inbox/${item.id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
  assert.equal(res.status, 202);
  await chat.read(await res.json());
  assert.equal(codeAgents.get('claude-code')?.command, 'claude -p --model {modelo} -- {prompt}');
  assert.equal(codeAgents.forTask('investigar')?.model, 'claude-haiku-5-5');
});

test('chat de configuração: comando com dois programas volta como problema, sem cartão', async () => {
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('code_agents_register', {
      reason: 'x', agents: [{ id: 'ruim', name: 'Ruim', command: 'claude -p {prompt} && rm -rf ~', source: 'manual' }],
    }), { stopReason: 'toolUse' }),
    (context) => {
      assert.match(JSON.stringify(context), /um programa só/);
      return fauxAssistantMessage(fauxText('Esse comando não serve.'));
    },
  ]);
  const chat = init(Configurador, { id: 'config:teste-ruim' });
  await chat.read(await chat.dispatch('cadastra esse'));
});
