import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, inbox, playbook } from './support/flow.ts';

test('script do procedimento: aprovado uma vez, a mesma ação com outros dados roda sozinha', async () => {
  brain.savePlaybook({
    name: 'gerar-relatorio', description: 'Gera o relatório', trigger: '', appliesTo: null, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null,
    steps: [{ id: 'gerar', label: 'Gerar', how: 'run_script eco.py {{pasta}}' }],
    scripts: [{ name: 'eco.py', description: 'imprime os argumentos', code: 'import sys\nprint("ok", *sys.argv[1:])\n' }],
  });
  brain.setPlaybookLevel('gerar-relatorio', { level: 2 });
  assert.deepEqual(brain.playbook('gerar-relatorio')!.scripts.map((x) => x.name), ['eco.py']);
  const until = async (ok: () => boolean, what: string) => {
    for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(ok(), what);
  };

  // Outside a procedure there is no script to run: nothing is asked.
  let outside = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('run_script', { script: 'eco.py', args: ['x'], purpose: 'teste' }), { stopReason: 'toolUse' }),
    (context) => { outside = JSON.stringify(context); return fauxAssistantMessage(fauxText('Não deu.')); },
  ]);
  const solo = init(Orbi, { id: 'chat:teste-script-fora' });
  await solo.read(await solo.dispatch('roda o eco'));
  assert.match(outside, /só roda dentro de um procedimento/);

  // First run: a new action asks; approved, it runs the stored code with the arguments.
  let ran = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'gerar-relatorio', params: { pasta: 'relatorios/jan' } }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_script', { script: 'eco.py', args: ['relatorios/jan'], purpose: 'Gerar o relatório' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Esperando a aprovação.')),
  ]);
  const first = init(Orbi, { id: 'chat:teste-script-1' });
  await first.read(await first.dispatch('gera o relatório em relatorios/jan'));
  const item = inbox.list({ status: 'open' }).find((i) => i.kind === 'approval' && i.conversationId === 'chat:teste-script-1')!;
  assert.ok(item, 'o script novo pede aprovação');
  faux.setResponses([
    (context) => { ran = JSON.stringify(context); return fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'gerar', status: 'done' }), { stopReason: 'toolUse' }); },
    fauxAssistantMessage(fauxText('Pronto.')),
  ]);
  const res = await app.request(`/api/inbox/${item.id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
  await first.read(await res.json());
  assert.match(ran, /ok relatorios\/jan/);
  // A clean run with no level change is reviewed quietly (no message): it leaves the known action.
  await until(
    () => brain.knownActions('gerar-relatorio').some((k) => /^run_script gerar-relatorio\/eco\.py@\w{8} \{\{pasta\}\}$/.test(k.fingerprint)),
    'virou ação conhecida, com o dado como parâmetro',
  );

  // Second run, other data: the same script runs alone at N2.
  let alone = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'gerar-relatorio', params: { pasta: 'relatorios/fev' } }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_script', { script: 'eco.py', args: ['relatorios/fev'], purpose: 'Gerar o relatório' }), { stopReason: 'toolUse' }),
    (context) => { alone = JSON.stringify(context); return fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'gerar', status: 'done' }), { stopReason: 'toolUse' }); },
    fauxAssistantMessage(fauxText('Pronto.')),
  ]);
  const second = init(Orbi, { id: 'chat:teste-script-2' });
  await second.read(await second.dispatch('gera o relatório em relatorios/fev'));
  assert.match(alone, /executed.*ok relatorios\/fev/);
  assert.equal(inbox.list({ status: 'open' }).filter((i) => i.kind === 'approval' && i.conversationId === 'chat:teste-script-2').length, 0);
});
