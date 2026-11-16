import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxText, fauxToolCall, init, Orbi, app, brain, waitFor } from './support/flow.ts';
import { services } from '../src/services.ts';
import { reportBrief } from '../src/diagnosis/report.ts';

/**
 * O relatório do diagnóstico (docs/funcionalidades/24, fase 3): quem escreve e quando é escolha do
 * desenvolvedor; o diagnosticador recebe os achados e o registro, e escreve o que ele lê.
 */
test('o que o diagnosticador recebe: os achados e só o que chama atenção no registro', () => {
  const run = {
    id: 'r1', playbook: 'promo', status: 'done', kind: 'run', deviations: [{ kind: 'comando', detail: 'gerar.py saiu com 1', step: 'extrair', recovered: true }],
    steps: [{ id: 'abrir', label: 'Abrir', status: 'done' }, { id: 'extrair', label: 'Extrair', status: 'done' }],
  } as never;
  const call = (over: Record<string, unknown>) => ({ id: 'c', step: 'extrair', tool: 'browser_act', summary: '', status: 'ok', approval: null, error: '', chars: 0, marks: [], at: '' }) as never;
  const brief = reportBrief(run, [
    { ...(call({}) as object), tool: 'playbook_start', step: 'abrir', chars: 900 } as never,
    { ...(call({}) as object), summary: 'evaluate_script', chars: 81_204, marks: ['caro'], approval: 'aprovada' } as never,
    { ...(call({}) as object), tool: 'run_script', status: 'erro', error: 'JSONDecodeError', chars: 60 } as never,
  ], [{ id: 'd1', runId: 'r1', playbook: 'promo', detector: 'arquivo-cortado', category: 'orbi', title: 'o arquivo pode estar cortado', detail: 'detalhe', hint: 'browser.ts:53', step: 'extrair', fingerprint: 'fp', times: 3, status: 'open', at: '' }]);
  assert.match(brief, /Execução de promo \(done\), 3 chamadas, 82 mil caracteres ao modelo/);
  assert.match(brief, /- \[orbi\] o arquivo pode estar cortado: detalhe \(onde olhar: browser\.ts:53\) · 3ª vez nesta máquina/);
  assert.match(brief, /- passo 2 · Extrair · browser_act evaluate_script → ok \(aprovada\) · 81 mil caracteres \[caro\]/);
  assert.match(brief, /- passo 2 · Extrair · run_script → erro · 60 caracteres\n {2}erro: JSONDecodeError/);
  assert.doesNotMatch(brief, /playbook_start/, 'chamada limpa não entra');
  assert.match(brief, /Desvios registrados:\n- comando \(recuperado\) no passo 2 · Extrair: gerar\.py saiu com 1/);
});

test('"Analisar esta execução": o diagnosticador escreve, e o relatório fica na execução', async () => {
  const id = 'chat:relatorio';
  brain.savePlaybook({
    name: 'listar', description: 'Lista', appliesTo: null, trigger: 'pedirem', autonomy: 'ask',
    steps: [{ id: 'listar', label: 'Listar', how: 'mostrar a lista' }], instructions: '', learnedFrom: null, variationOf: null, outputs: [],
  });
  brain.setPlaybookLevel('listar', { level: 3 });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'listar' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'listar', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Pronto.')),
  ]);
  const orbi = init(Orbi, { id });
  await orbi.read(await orbi.dispatch('lista'));
  const run = brain.lastRunIn(id)!;

  // O padrão não gasta nada: só as regras, nenhum relatório.
  assert.deepEqual(await (await app.request('/api/diagnoses/setup')).json(), { who: 'regras', when: 'quando-houver' });
  await waitFor(() => faux.getPendingResponseCount() === 0, 'a revisão terminar');
  assert.equal(services().diagnoses.report(run.id), undefined);

  // Pedindo, o diagnosticador escreve, seja qual for a configuração.
  let brief = '';
  faux.setResponses([
    (context) => {
      brief = JSON.stringify(context);
      return fauxAssistantMessage(fauxToolCall('write_report', { text: 'Nada que atrapalhe nesta execução: um passo foi dado como feito sem chamada nenhuma.' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxText('Relatório escrito.')),
  ]);
  const asked = await app.request(`/api/diagnoses/report?run=${run.id}`, { method: 'POST' });
  assert.equal(asked.status, 200);
  await waitFor(() => !!services().diagnoses.report(run.id), 'o relatório');
  const report = services().diagnoses.report(run.id)!;
  assert.match(report.text, /^Nada que atrapalhe/);
  assert.equal(report.by, 'modelo');
  assert.match(brief, /Execução de listar/, 'o diagnosticador recebeu o registro');
  assert.match(brief, /diagnosticador do Orbi/, 'com as instruções dele');
  const fromApi = await (await app.request(`/api/diagnoses/report?run=${run.id}`)).json() as { text: string };
  assert.match(fromApi.text, /^Nada que atrapalhe/);
  assert.equal((await app.request('/api/diagnoses/report?run=nao-existe', { method: 'POST' })).status, 404);

  // A escolha fica guardada.
  const saved = await (await app.request('/api/diagnoses/setup', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ who: 'modelo' }) })).json();
  assert.deepEqual(saved, { who: 'modelo', when: 'quando-houver' });
});
