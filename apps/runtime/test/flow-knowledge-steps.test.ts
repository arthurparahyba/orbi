import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, inbox, waitFor } from './support/flow.ts';

/**
 * Facts without repeating, and the step that found one looking in the brain first
 * (docs/funcionalidades/22), with the real Flue and a scripted model: the reviewer finds the
 * repository in step "repo" under another name of a fact the brain has; the runtime turns it into
 * that fact; the Orbi proposes the fact and the step changed in ONE card; approving keeps what the
 * fact had; the next run's review proposes nothing again.
 */
const ctx = (context: unknown) => JSON.stringify(context).replace(/\\"/g, '"');
const lastText = (context: any) => {
  const msgs = (context.messages ?? []).filter((m: any) => !JSON.stringify(m.content ?? '').includes('resource=\\"mcp\\"'));
  const last = msgs.at(-1);
  return { role: String(last?.role ?? ''), text: JSON.stringify(last?.content ?? '') };
};
const { services } = await import('../src/services.ts');
const knowledge: string[] = [];
const learnings: unknown[] = [];

const STEPS = [
  { id: 'repo', label: 'Achar o repositório', how: 'Consultar no GitHub (run_command cat repo.txt) o repositório da aplicação' },
  { id: 'pipeline', label: 'Rodar o pipeline', how: 'rodar o deploy no repositório' },
];

const router = (context: any) => {
  const all = ctx(context);
  const last = lastText(context);
  if (all.includes('revisor de conhecimento do Orbi')) {
    if (last.role === 'toolResult') return fauxAssistantMessage(fauxText('pronto'));
    // Under another name ("pagamentos" is pagamentos-api's other name), from step "repo".
    return fauxAssistantMessage(fauxToolCall('propose_facts', {
      facts: [{ kind: 'entity', id: 'pagamentos', type: 'Aplicacao', props: { repositorio: 'org/pagamentos-api', banco: 'pag-db' }, why: 'saída do GitHub', step: 'repo' }],
    }), { stopReason: 'toolUse' });
  }
  if (last.role === 'toolResult') return fauxAssistantMessage(fauxText('Ok.'));
  if (last.text.includes('Revisão de conhecimento da execução')) {
    knowledge.push(all);
    const items = [
      { kind: 'entity', payload: { id: 'pagamentos-api', type: 'Aplicacao', props: { banco: 'pag-db' } } },
      { kind: 'playbook', payload: { ...brain.playbook('fazer-deploy')!, steps: [{ ...STEPS[0], how: 'Consultar no Cérebro (brain_query) o repositório da aplicação; se não houver, consultar no GitHub (run_command cat repo.txt)' }, STEPS[1]] } },
    ];
    learnings.push(items);
    return fauxAssistantMessage(fauxToolCall('brain_learn', { reason: 'guardar o repositório e consultar o Cérebro antes', why: 'o repositório não muda a cada deploy', items } as never), { stopReason: 'toolUse' });
  }
  return fauxAssistantMessage(fauxText('Ok.'));
};

function run(mark: string) {
  writeFileSync(join(services().config.workspace, 'repo.txt'), `org/pagamentos-api (${mark})`);
  return [
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'fazer-deploy' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'repo', status: 'running' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'cat', args: ['repo.txt'], purpose: 'Achar o repositório' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'repo', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'pipeline', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Deploy feito.')),
    ...Array.from({ length: 10 }, () => router),
  ];
}

test('revisão de conhecimento: o mesmo fato com outro nome vira acréscimo, e o passo de onde veio passa a consultar o Cérebro, no mesmo cartão', async () => {
  services().config.knowledgeReview = true;
  brain.upsertType({ name: 'Aplicacao', description: 'Aplicação com repositório', relations: {}, requires: [], props: { repositorio: 'repositório no GitHub', banco: 'banco de dados' } });
  brain.upsertEntity({ id: 'pagamentos-api', type: 'Aplicacao', props: { repositorio: 'org/pagamentos-api', time: 'pag' }, body: '', aliases: ['pagamentos'] });
  brain.savePlaybook({ name: 'fazer-deploy', description: 'Deploy de uma aplicação', trigger: 'deploy', appliesTo: null, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null, steps: STEPS });

  faux.setResponses(run('primeira'));
  const one = init(Orbi, { id: 'chat:deploy-1' });
  await one.read(await one.dispatch('faz o deploy do pagamentos'));
  await waitFor(() => knowledge.length === 1, 'os fatos chegarem à conversa', 8000);

  const sent = knowledge[0]!;
  assert.match(sent, /pagamentos-api \(Aplicacao\)[^\]]*\[pagamentos é o mesmo que pagamentos-api[^\]]*acrescenta banco = pag-db/, 'outro nome do mesmo fato: vira acréscimo nele');
  assert.match(sent, /No MESMO brain_learn, inclua o procedimento fazer-deploy/);
  assert.match(sent, /- repo: Achar o repositório · hoje: Consultar no GitHub/);
  assert.doesNotMatch(sent, /- pipeline: Rodar o pipeline · hoje/, 'só o passo de onde veio o fato');

  // One card: the fact and the step. Approving keeps what the fact had.
  await waitFor(() => inbox.list({ status: 'open' }).some((i) => i.conversationId === 'chat:deploy-1' && i.kind === 'learning'), 'o cartão de aprendizado', 8000);
  const card = inbox.list({ status: 'open' }).find((i) => i.conversationId === 'chat:deploy-1' && i.kind === 'learning')!;
  assert.match(card.detail, /pagamentos-api/);
  assert.match(card.detail, /Consultar no Cérebro/);
  faux.setResponses([fauxAssistantMessage(fauxText('Guardado.')), ...Array.from({ length: 5 }, () => router)]);
  await one.read(await (await app.request(`/api/inbox/${card.id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) })).json());
  const fact = brain.get('pagamentos-api')!;
  assert.deepEqual(fact.props, { repositorio: 'org/pagamentos-api', time: 'pag', banco: 'pag-db' }, 'acrescentou sem apagar');
  assert.deepEqual(fact.aliases, ['pagamentos'], 'o outro nome continua');
  assert.equal(brain.get('pagamentos'), undefined, 'nenhum fato duplicado');
  assert.match(brain.playbook('fazer-deploy')!.steps.find((st) => st.id === 'repo')!.how, /Consultar no Cérebro/);
  assert.equal(brain.playbook('fazer-deploy')!.steps.find((st) => st.id === 'pipeline')!.how, STEPS[1]!.how);

  // Next run: the same fact is known and the step already looks in the brain: nothing to propose.
  faux.setResponses(run('segunda'));
  const two = init(Orbi, { id: 'chat:deploy-2' });
  await two.read(await two.dispatch('faz o deploy do pagamentos'));
  await waitFor(() => !!brain.lastRunIn('chat:deploy-2')?.finishedAt, 'a segunda execução terminar', 8000);
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(knowledge.length, 1, 'a revisão não propõe de novo');
});

test('brain_learn do Orbi: fato que é o mesmo que um existente volta antes do cartão', async () => {
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('brain_learn', { reason: 'guardar', items: [{ kind: 'entity', payload: { id: 'pagamentos_api', type: 'Aplicacao', props: { banco: 'pag-db' } } }] }), { stopReason: 'toolUse' }),
    (context: any) => {
      assert.match(ctx(context), /pagamentos_api (é o mesmo que|já está no cérebro como) pagamentos-api/);
      return fauxAssistantMessage(fauxText('Vou acrescentar no pagamentos-api.'));
    },
  ]);
  const o = init(Orbi, { id: 'chat:mesmo-fato' });
  await o.read(await o.dispatch('guarda que o pagamentos_api usa o pag-db'));
  assert.equal(inbox.list({ status: 'open' }).some((i) => i.conversationId === 'chat:mesmo-fato'), false, 'nenhum cartão');
});
