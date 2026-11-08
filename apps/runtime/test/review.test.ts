import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrainStore } from '../src/brain/store.ts';
import { pipelineConfigProblems, stepClaimProblems } from '../src/brain/domain/review.ts';
import { commandCategory } from '../src/autonomy/policy.ts';
import { savePath } from '../src/agents/tools/terminal.ts';
import { reviewConversation, reviewInstruction } from '../src/review/review.ts';
import { Inbox } from '../src/conversations/inbox.ts';
import { PipelineRuns } from '../src/pipelines/runs.ts';
import { PipelineEngine } from '../src/pipelines/engine.ts';

const pb = (name: string, steps: Array<[string, string]>, outputs: string[] = []) => ({
  name, description: name, trigger: '', appliesTo: null, autonomy: 'ask' as const, instructions: '', learnedFrom: null, variationOf: null,
  steps: steps.map(([id, how]) => ({ id, label: id, how })), outputs: outputs.map((o) => ({ name: o, description: o })),
});

/** The esteira as it was on the developer's machine (top-repos-github-para-gitstars). */
function gitstars(b: BrainStore) {
  b.savePlaybook(pb('consultar', [['buscar', 'run_command gh api … --jq'], ['entregar', 'show_ui table']], ['lista_tsv']));
  b.savePlaybook(pb('gerar', [['obter-lista', 'Usar a saída do playbook consultar'], ['definir-destino', 'ask_developer pedindo o caminho da pasta. Não assumir.'], ['gerar-html', 'run_command python3 que escreve index.html']], ['html_path']));
  b.savePlaybook(pb('publicar', [['copiar-html', 'run_command cp /Users/arthur/projetos/top-100-github/index.html /Users/arthur/projetos/gitstars/index.html']], ['pages_url']));
  return b.savePipeline({
    name: 'top-repos', description: '',
    inputs: [{ name: 'destino', description: 'pasta' }],
    stages: [
      { id: 'coletar', label: 'Coletar', passage: 'auto', options: [{ playbook: 'consultar' }] },
      { id: 'gerar', label: 'Gerar', passage: 'auto', options: [{ playbook: 'gerar', map: { lista: 'coletar.lista_tsv', destino: 'entrada.destino' } }] },
      { id: 'publicar', label: 'Publicar', passage: 'ask', options: [{ playbook: 'publicar' }] },
    ],
  });
}

test('configuração: dado que não chega, passo que pergunta e caminho fixo', () => {
  const b = new BrainStore(':memory:');
  const p = gitstars(b);
  const problems = pipelineConfigProblems(p, (n) => b.playbook(n), { gerar: { html_path: '/Users/arthur/projetos/top-100-github/index.html' } }).map((x) => `${x.stage}: ${x.text}`);
  assert.deepEqual(problems, [
    'gerar: gerar não recebe {{lista}}: o dado coletar.lista_tsv não chega. Use {{lista}} nos passos.',
    'gerar: gerar não recebe {{destino}}: o dado entrada.destino não chega. Use {{destino}} nos passos.',
    'gerar: passo definir-destino de gerar pergunta ao desenvolvedor; na esteira, receba como parâmetro o que já vem de antes (destino, lista_tsv).',
    'publicar: publicar não recebe nada das etapas anteriores (não há {{parâmetros}} nos passos): os dados só chegam se o modelo lembrar.',
    'publicar: passo copiar-html de publicar usa o valor fixo "/Users/arthur/projetos/top-100-github/index.html", que é o html_path entregue pela etapa gerar: use {{html_path}}.',
  ]);
  // Fixed: parameters in the steps, no asking.
  b.savePlaybook(pb('gerar', [['gerar-html', 'run_command python3 que lê {{lista}} e escreve {{destino}}/index.html']], ['html_path']));
  b.savePlaybook(pb('publicar', [['copiar-html', 'run_command cp {{html_path}} /Users/arthur/projetos/gitstars/index.html']], ['pages_url']));
  assert.deepEqual(b.pipelineWarnings(b.pipeline('top-repos')!), []);
});

test('passo dado como feito com a ferramenta falhada', () => {
  const run = {
    steps: [{ id: 'buscar', label: '', how: '', status: 'done' as const }, { id: 'entregar', label: '', how: '', status: 'done' as const, note: 'Tabela exibida' }],
    deviations: [{ kind: 'falha' as const, detail: 'show_ui falhou', tool: 'show_ui', step: 'entregar', at: '' }],
  };
  assert.deepEqual(stepClaimProblems(run), ['passo entregar foi dado como feito ("Tabela exibida"), mas show_ui falhou']);
});

test('revisão: execuções terminadas, uma vez só, com problemas e configuração da esteira', () => {
  const b = new BrainStore(':memory:');
  gitstars(b);
  const db = (b as unknown as { db: never }).db;
  const inbox = new Inbox(db);
  const runs = new PipelineRuns(db);
  const engine = new PipelineEngine({ brain: b, runs, inbox });
  engine.start('top-repos', { destino: '/x' }, { conversationId: 'c1' });
  const run = b.startRun('consultar', 'c1');
  engine.runStarted(run);
  b.updateRunStep(run.id, 'buscar', 'done');
  b.updateRunStep(run.id, 'entregar', 'done', 'Tabela exibida');
  // The failure of a call made alongside the step that closed the run arrives later.
  assert.equal(b.runForFailureIn('c1')?.id, run.id);
  b.addRunDeviation(run.id, { kind: 'falha', detail: 'show_ui falhou: Validation failed', tool: 'show_ui', step: 'entregar' });
  const s = { brain: b, inbox, pipelines: { runs, engine } };
  const review = reviewConversation(s, 'c1')!;
  assert.deepEqual(review.runs.map((r) => [r.playbook, r.problems]), [['consultar', ['passo entregar foi dado como feito ("Tabela exibida"), mas show_ui falhou']]]);
  assert.equal(review.runs[0].level, undefined, 'com problema não sobe');
  assert.equal(review.pipeline, 'top-repos');
  assert.ok(review.config.length >= 3);
  assert.match(reviewInstruction(review), /configuração de gerar: gerar não recebe \{\{lista\}\}/);
  assert.equal(reviewConversation(s, 'c1'), null, 'revisada uma vez só');
});

test('gh api -X GET é leitura; saveTo resolve o caminho', () => {
  assert.equal(commandCategory('gh', ['api', '-X', 'GET', 'search/repositories', '-f', 'q=stars:>1']), 'comandos-leitura');
  assert.equal(commandCategory('gh', ['api', '--method=GET', 'x', '-f', 'a=1']), 'comandos-leitura');
  assert.equal(commandCategory('gh', ['api', '-X', 'POST', 'x']), 'comandos-escrita');
  assert.equal(commandCategory('gh', ['api', 'x', '-f', 'a=1']), 'comandos-escrita', 'sem método, -f é POST');
  assert.equal(savePath('~/p/top.tsv', '/ws', '/home/a'), '/home/a/p/top.tsv');
  assert.equal(savePath('dados/top.tsv', '/ws'), '/ws/dados/top.tsv');
  assert.equal(savePath('/tmp/x.tsv', '/ws'), '/tmp/x.tsv');
});
