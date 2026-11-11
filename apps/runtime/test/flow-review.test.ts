import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, inbox, stepClaimProblemsOf, components, playbook, waitFor } from './support/flow.ts';

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
  assert.match(clean, /mostrar-top sem nada para mudar/);
  assert.match(clean, /Não proponha melhorias/);
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

test('esperar só o que existe; falha corrigida na hora não é problema; tabela do script vai direto para a conversa', async () => {
  brain.savePlaybook({
    name: 'mostrar-lista', description: 'Mostra a lista', trigger: '', appliesTo: null, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null,
    steps: [{ id: 'mostrar', label: 'Mostrar', how: 'run_script tabela.py show: true' }, { id: 'publicar', label: 'Publicar', how: 'run_command git push' }],
    scripts: [{ name: 'tabela.py', description: 'imprime a tabela', code: 'import json\nprint(json.dumps({"component": "table", "id": "t1", "title": "Lista", "columns": ["a"], "rows": [["1"], ["2"]]}))\n' }],
  });
  brain.setPlaybookLevel('mostrar-lista', { level: 3 }); // set by the developer: new actions run alone
  const card = { component: { component: 'status', id: 's1', title: 'Lista', state: 'info', text: 'ok' } };
  let refused = '';
  let shownResult = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'mostrar-lista' }), { stopReason: 'toolUse' }),
    // As the real model did: an empty show_ui, then the same call right, in the same step.
    fauxAssistantMessage(fauxToolCall('show_ui', {}), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('show_ui', card), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_script', { script: 'tabela.py', args: [], purpose: 'Mostrar a lista', show: true }), { stopReason: 'toolUse' }),
    (context) => { shownResult = JSON.stringify(context); return fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'mostrar', status: 'done' }), { stopReason: 'toolUse' }); },
    // "Waiting for approval" without having called the tool: refused, nothing to press.
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'publicar', status: 'waiting', note: 'aguardando aprovação' }), { stopReason: 'toolUse' }),
    (context) => { refused = JSON.stringify(context); return fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'publicar', status: 'done', note: 'nada novo a publicar' }), { stopReason: 'toolUse' }); },
    fauxAssistantMessage(fauxText('Pronto.')),
  ]);
  const orbi = init(Orbi, { id: 'chat:teste-esperar' });
  const reply = await orbi.read(await orbi.dispatch('mostra a lista'));
  assert.match(shownResult, /shown.*table.*rows.*2/);
  const table = components(reply).find((c: any) => c.component === 'table');
  assert.deepEqual(table?.rows, [['1'], ['2']], 'a tabela veio do script, sem o modelo copiar');
  assert.match(refused, /nada está esperando nesta conversa/);
  const run = brain.lastRunIn('chat:teste-esperar')!;
  assert.equal(run.status, 'done');
  // The slip is not a problem; copying the table by hand is a good idea but changes nothing in the
  // result or the autonomy: the judge keeps it in the Cérebro, quietly, without asking for a rewrite.
  await waitFor(() => brain.review.notes({ playbook: 'mostrar-lista', kind: 'idea' }).length > 0, 'a ideia guardada');
  const [idea] = brain.review.notes({ playbook: 'mostrar-lista', kind: 'idea' });
  assert.match(idea.text, /o passo mostrar mostrou a tabela copiando/);
  assert.equal(idea.status, 'kept');
  assert.deepEqual(run.deviations.map((d) => [d.tool, d.recovered]), [['show_ui', true]], 'a falha ficou marcada como corrigida na hora');
  assert.deepEqual(stepClaimProblemsOf(run), []);
});
