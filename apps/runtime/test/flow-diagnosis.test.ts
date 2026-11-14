import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxText, fauxToolCall, init, Orbi, app, brain, waitFor } from './support/flow.ts';
import { services } from '../src/services.ts';

/**
 * O diagnóstico (docs/funcionalidades/24) com o Flue de verdade: um defeito que não é do
 * procedimento não volta como mudança no procedimento, e a conversa recebe uma linha dizendo o
 * que foi. Aqui o defeito é do modelo: ele chamou a ferramenta errado e não se recuperou.
 */
test('diagnóstico: problema do modelo não vira mudança no procedimento, e a revisão manda dizer numa linha', async () => {
  const id = 'chat:diagnostico';
  brain.savePlaybook({
    name: 'listar', description: 'Lista os itens', appliesTo: null, trigger: 'pedirem a lista', autonomy: 'ask',
    steps: [{ id: 'listar', label: 'Listar', how: 'mostrar a lista para o desenvolvedor' }],
    instructions: '', learnedFrom: null, variationOf: null, outputs: [],
  });
  brain.setPlaybookLevel('listar', { level: 3 }); // sem cartão: o que interessa é o diagnóstico
  let review = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'listar' }), { stopReason: 'toolUse' }),
    // Argumento que não valida, e o modelo desiste dessa ferramenta: ninguém corrigiu na hora.
    fauxAssistantMessage(fauxToolCall('show_ui', {}), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'mkdir', args: ['diag-teste'], purpose: 'criar a pasta da lista' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'listar', status: 'done', note: 'listei de outro jeito' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Pronto.')),
    (context) => { review = JSON.stringify(context); return fauxAssistantMessage(fauxText('Houve 1 problema do modelo nesta execução; não é do seu procedimento.')); },
  ]);
  const orbi = init(Orbi, { id });
  await orbi.read(await orbi.dispatch('lista os itens'));
  const run = brain.lastRunIn(id)!;

  await waitFor(() => services().diagnoses.forRun(run.id).length > 0, 'o diagnóstico da execução');
  const found = services().diagnoses.forRun(run.id);
  assert.deepEqual(found.map((f) => [f.detector, f.category, f.minor]), [['chamada-errada', 'modelo', undefined]]);
  assert.match(found[0]!.title, /o modelo chamou show_ui errado/);

  await waitFor(() => review.length > 0, 'a revisão na conversa');
  assert.match(review, /1 problema do modelo nesta execução, que não são do procedimento/);
  assert.match(review, /Não proponha mudança nenhuma no procedimento/);
  assert.doesNotMatch(review, /Proponha tudo com UM brain_learn/, 'nada a propor: não é caso de corrigir o procedimento');
  assert.doesNotMatch(review, /- mudar listar/, 'o procedimento não é acusado');

  const api = await (await app.request(`/api/diagnoses?run=${run.id}`)).json() as Array<{ id: string; title: string }>;
  assert.equal(api.length, 1);
  // "Ver o que vai": o texto da issue, sem nada do trabalho do desenvolvedor.
  const draft = await (await app.request(`/api/diagnoses/${api[0]!.id}/issue`)).json() as { title: string; body: string; swaps: Array<{ to: string }> };
  assert.match(draft.title, /o modelo chamou show_ui errado \(chamada-errada\)/);
  assert.match(draft.body, /## Ambiente/);
  assert.doesNotMatch(draft.body, /listar/, 'o nome do procedimento e do passo não saem');
  assert.ok(draft.swaps.some((x) => x.to === '<procedimento-1>'));
  assert.equal((await app.request('/api/diagnoses/nao-existe/issue')).status, 404);
  assert.equal((await app.request(`/api/diagnoses/${api[0]!.id}/dismiss`, { method: 'POST' })).status, 200);
  assert.equal(services().diagnoses.list().filter((f) => f.runId === run.id).length, 0, 'dispensado sai da lista');
  assert.equal((await app.request('/api/diagnoses/nao-existe/dismiss', { method: 'POST' })).status, 404);
});
