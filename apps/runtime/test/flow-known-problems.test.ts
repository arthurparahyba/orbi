import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, brain } from './support/flow.ts';

test('problema conhecido: o que falhou e depois passou vira conhecimento; da próxima vez, a falha já vem com a solução', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(`${tmpdir()}/orbi-sonar-`);
  // Fails the first time it sees a folder (like a quality gate before the tests), passes after.
  const code = [
    'import os, sys',
    'flag = os.path.join(sys.argv[1], "testes")',
    'if not os.path.exists(flag):',
    '    open(flag, "w").close()',
    '    print("ERROR: Quality Gate failed. Coverage on New Code 62.1% is less than 80%", file=sys.stderr)',
    '    sys.exit(1)',
    'print("Quality Gate passed")',
  ].join('\n');
  brain.savePlaybook({
    name: 'subir-dev', description: 'Sobe para dev', trigger: '', appliesTo: null, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null,
    steps: [{ id: 'acompanhar', label: 'Acompanhar o workflow', how: 'run_script gate.py {{pasta}}' }],
    scripts: [{ name: 'gate.py', description: 'confere o quality gate', code }],
  });
  brain.setPlaybookLevel('subir-dev', { level: 3 });
  const pasta = `${dir}/a`;
  (await import('node:fs')).mkdirSync(pasta);
  let firstResult = '';
  let review = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'subir-dev', params: { pasta } }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_script', { script: 'gate.py', args: [pasta], purpose: 'Conferir o quality gate' }), { stopReason: 'toolUse' }),
    (context) => { firstResult = JSON.stringify(context); return fauxAssistantMessage(fauxToolCall('run_script', { script: 'gate.py', args: [pasta], purpose: 'Conferir de novo' }), { stopReason: 'toolUse' }); },
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'acompanhar', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Pronto.')),
    (context) => { review = JSON.stringify(context); return fauxAssistantMessage(fauxText('Proponho o problema conhecido.')); },
  ]);
  const first = init(Orbi, { id: 'chat:teste-sonar-1' });
  await first.read(await first.dispatch('sobe para dev'));
  assert.match(firstResult, /Coverage on New Code 62/);
  assert.doesNotMatch(firstResult, /Problema conhecido no cérebro/, 'o cérebro ainda não conhece esse erro');
  for (let i = 0; i < 100 && !review; i++) await new Promise((r) => setTimeout(r, 50));
  assert.match(review, /aprender com subir-dev: o passo acompanhar \(Acompanhar o workflow\) esbarrou em/);
  assert.match(review, /Coverage on New Code 62/);
  const run = brain.lastRunIn('chat:teste-sonar-1')!;
  assert.equal(run.status, 'done');
  assert.deepEqual(run.deviations.map((d) => [d.kind, d.recovered]), [['comando', true]], 'a falha do comando ficou no histórico, marcada como contornada');

  // The developer approves what the Orbi proposed: a problem the brain now knows.
  brain.upsertType({ name: 'Problema', description: 'Problema conhecido', relations: {}, requires: [] });
  brain.upsertEntity({ id: 'sonar-cobertura-codigo-novo', type: 'Problema', body: '', props: {
    sintoma: 'Quality Gate failed. Coverage on New Code', causa: 'cobertura de código novo abaixo de 80%', solucao: 'o agente de código adiciona testes nos arquivos alterados e delega de novo', onde: 'subir-dev, acompanhar',
  } });

  // Next time: the failure comes with the solution, and nothing new to learn.
  const pasta2 = `${dir}/b`;
  (await import('node:fs')).mkdirSync(pasta2);
  let secondResult = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'subir-dev', params: { pasta: pasta2 } }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_script', { script: 'gate.py', args: [pasta2], purpose: 'Conferir o quality gate' }), { stopReason: 'toolUse' }),
    (context) => { secondResult = JSON.stringify(context); return fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'acompanhar', status: 'failed', note: 'cobertura 62%, mínimo 80%: o agente de código adiciona testes' }), { stopReason: 'toolUse' }); },
    fauxAssistantMessage(fauxText('Falhou no quality gate.')),
    (context) => { review2 = JSON.stringify(context); return fauxAssistantMessage(fauxText('Revisado.')); },
  ]);
  let review2 = '';
  const second = init(Orbi, { id: 'chat:teste-sonar-2' });
  await second.read(await second.dispatch('sobe para dev'));
  assert.match(secondResult, /knownProblems.*sonar-cobertura-codigo-novo.*o agente de código adiciona testes/);
  for (let i = 0; i < 100 && !review2; i++) await new Promise((r) => setTimeout(r, 50));
  assert.doesNotMatch(review2, /aprender com subir-dev/, 'já conhecido: nada novo a aprender');
  const again = brain.lastRunIn('chat:teste-sonar-2')!;
  assert.deepEqual(again.deviations.map((d) => [d.kind, d.known]), [['comando', true]], 'já era conhecido: não pede para aprender de novo');
});
