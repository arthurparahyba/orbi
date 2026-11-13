import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrainStore } from '../src/brain/store.ts';
import { pipelineConfigProblems, stepClaimProblems } from '../src/brain/domain/review.ts';
import { commandCategory } from '../src/autonomy/policy.ts';
import { savePath } from '../src/agents/tools/terminal.ts';
import { join, resolve } from 'node:path';
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
  const { run: delivery } = engine.start('top-repos', { destino: '/x' }, { conversationId: 'c1' });
  const run = b.startRun('consultar', 'c1');
  engine.runStarted(run);
  b.updateRunStep(run.id, 'buscar', 'done');
  b.updateRunStep(run.id, 'entregar', 'done', 'Tabela exibida');
  // The failure of a call made alongside the step that closed the run arrives later.
  assert.equal(b.runForFailureIn('c1')?.id, run.id);
  b.addRunDeviation(run.id, { kind: 'falha', detail: 'show_ui falhou: Validation failed', tool: 'show_ui', step: 'entregar' });
  const s = { brain: b, inbox, pipelines: { runs, engine } };
  assert.equal(reviewConversation(s, 'c1'), null, 'a entrega ainda roda: a revisão espera');
  engine.cancel(delivery.id);
  const review = reviewConversation(s, 'c1')!;
  assert.deepEqual(review.runs.map((r) => [r.playbook, r.findings.filter((f) => f.kind === 'problema').map((f) => f.text)]), [['consultar', ['passo entregar foi dado como feito ("Tabela exibida"), mas show_ui falhou']]]);
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
  assert.equal(savePath('~/p/top.tsv', '/ws', '/home/a'), join('/home/a', 'p/top.tsv'));
  assert.equal(savePath('dados/top.tsv', '/ws'), resolve('/ws', 'dados/top.tsv'));
  assert.equal(savePath('/tmp/x.tsv', '/ws'), '/tmp/x.tsv');
});

test('passo que já recebe o valor não é alarme; padrão sugerido; título da correção', async () => {
  const b = new BrainStore(':memory:');
  gitstars(b);
  b.savePlaybook(pb('gerar', [['definir-destino', 'Usar {{destino}}. Só perguntar ao desenvolvedor se vier vazio.'], ['gerar-html', 'lê {{lista}}']], ['html_path']));
  assert.equal(b.pipelineWarnings(b.pipeline('top-repos')!).filter((w) => w.stage === 'gerar').length, 0);
  const { defaultSuggestions } = await import('../src/brain/domain/review.ts');
  assert.deepEqual(defaultSuggestions([{ name: 'destino' }], [{ destino: '/x' }, { destino: '/x' }]), [{ input: 'destino', value: '/x', times: 2 }]);
  assert.deepEqual(defaultSuggestions([{ name: 'destino' }], [{ destino: '/x' }, { destino: '/y' }]), []);
  assert.deepEqual(defaultSuggestions([{ name: 'destino', default: '/x' }], [{ destino: '/x' }, { destino: '/x' }]), []);
  const { learnTitle } = await import('../src/agents/tools/brain.ts');
  const exists = (n: string) => n === 'gerar' || n === 'publicar';
  assert.equal(learnTitle([{ kind: 'playbook', payload: { name: 'gerar' } }, { kind: 'playbook', payload: { name: 'publicar' } }], 'r', exists), 'Corrigir 2 procedimentos: gerar, publicar');
  assert.equal(learnTitle([{ kind: 'playbook', payload: { name: 'gerar' } }, { kind: 'pipeline', payload: { name: 'top-repos' } }], 'r', exists), 'Corrigir o procedimento gerar e a esteira top-repos');
  assert.equal(learnTitle([{ kind: 'playbook', payload: { name: 'novo' } }], 'aprendi', exists), 'Aprender: aprendi');
});

test('esteira: etapa fora de ordem é recusada; revisão só no fim; procedimento aberto é apontado; encerrar', () => {
  const b = new BrainStore(':memory:');
  gitstars(b);
  const db = (b as unknown as { db: never }).db;
  const inbox = new Inbox(db);
  const runs = new PipelineRuns(db);
  const engine = new PipelineEngine({ brain: b, runs, inbox });
  const { run: delivery } = engine.start('top-repos', { destino: '/x' }, { conversationId: 'c2' });
  const first = b.startRun('consultar', 'c2');
  engine.runStarted(first);
  b.updateRunStep(first.id, 'entregar', 'done');
  assert.match(engine.startProblem('c2', 'gerar') ?? '', /etapa 1 \(Coletar.*faltam os passos buscar/);
  assert.equal(engine.startProblem('c2', 'consultar'), null);
  assert.equal(engine.startProblem('outra', 'gerar'), null);
  const s = { brain: b, inbox, pipelines: { runs, engine } };
  assert.equal(reviewConversation(s, 'c2'), null, 'entrega rodando: revisão espera');
  engine.cancel(delivery.id);
  assert.throws(() => engine.cancel(delivery.id), /encerrada/);
  const review = reviewConversation(s, 'c2')!;
  assert.equal(review.runs[0].status, 'open');
  assert.match(review.runs[0].findings[0].text, /ficou aberto: o passo buscar não foi fechado/);
  assert.equal(reviewConversation(s, 'c2'), null, 'uma vez só');
});

test('scripts do procedimento: validados, guardados, mantidos quando a mudança não fala deles; Python na hora vira sugestão', async () => {
  const { scriptProblems, scriptVersion } = await import('../src/brain/domain/scripts.ts');
  const { changeFromProposal } = await import('../src/brain/domain/learning.ts');
  const { inlineScriptSuggestions } = await import('../src/brain/domain/review.ts');
  const steps = [{ id: 'gerar', how: 'run_script gerar_html.py {{pasta}}' }, { id: 'outro', how: 'run_script falta.py' }];
  assert.deepEqual(scriptProblems([
    { name: 'gerar_html.py', description: '', code: 'print(1)' },
    { name: 'Ruim.sh', description: '', code: '' },
    { name: 'senha.py', description: '', code: 'print("{{segredo:token}}")' },
  ], steps), [
    'nome de script inválido: Ruim.sh (ex.: gerar_html.py)',
    'script Ruim.sh sem código',
    'script senha.py cita uma credencial: credenciais não entram em scripts',
    'passo outro usa o script falta.py, que não está no procedimento',
  ]);
  assert.notEqual(scriptVersion('a'), scriptVersion('b'));

  const b = new BrainStore(':memory:');
  const learned = changeFromProposal('playbook', { name: 'gerar', steps: [{ id: 'gerar', label: 'G', how: 'run_script gerar_html.py' }], scripts: [{ name: 'gerar_html.py', description: 'html', code: 'print(1)', effect: 'publica' }] }, 'chat:1');
  assert.ok(learned.kind === 'playbook');
  b.savePlaybook(learned.playbook);
  assert.deepEqual(b.playbook('gerar')!.scripts, [{ name: 'gerar_html.py', description: 'html', code: 'print(1)', effect: 'publica' }]);
  // A fix that only touches the steps keeps the scripts.
  const fix = changeFromProposal('playbook', { name: 'gerar', steps: [{ id: 'gerar', label: 'Gerar', how: 'run_script gerar_html.py {{pasta}}' }] }, 'chat:2');
  assert.ok(fix.kind === 'playbook');
  b.savePlaybook(fix.playbook);
  assert.equal(b.playbook('gerar')!.scripts.length, 1);
  assert.throws(() => b.editPlaybook('gerar', { steps: [{ id: 'x', label: 'X', how: 'run_script nao_tem.py' }] }), /nao_tem\.py/);

  assert.deepEqual(inlineScriptSuggestions({ actions: [
    { fingerprint: 'run_command python3 -c import json…', tool: 'run_command', effect: 'local', summary: '', step: 'gerar' },
    { fingerprint: 'run_command python3 -c print(2)', tool: 'run_command', effect: 'local', summary: '', step: 'gerar' },
    { fingerprint: 'run_script gerar/gerar_html.py@abcd1234 {{pasta}}', tool: 'run_script', effect: 'local', summary: '', step: 'gerar' },
    { fingerprint: 'run_command gh pr list', tool: 'run_command', effect: 'leitura', summary: '', step: 'listar' },
  ] }).map((x) => x.slice(0, 64)), ['o passo gerar rodou Python escrito na hora (python3 -c, 2 vezes)']);
});

test('pergunta condicional ("se der problema, perguntar") não é passo que pergunta', async () => {
  const { asksAlways } = await import('../src/brain/domain/review.ts');
  assert.equal(asksAlways("git add; commit; push origin main. Se index.lock aparecer, parar e perguntar; não remover o lock."), false);
  assert.equal(asksAlways('Caso o login peça MFA, ask_developer.'), false);
  assert.equal(asksAlways('Só perguntar ao desenvolvedor se vier vazio.'), true, 'esse pergunta sem condição antes do verbo; o {{parâmetro}} no passo é o que o libera');
  assert.equal(asksAlways('ask_developer pedindo o caminho da pasta. Não assumir.'), true);
});

test('problemas conhecidos: forma, quando um erro bate, e o que vira conhecimento', async () => {
  const { asKnownProblem, matchesProblem, knowledgeSuggestions } = await import('../src/brain/domain/knowledge.ts');
  const sonar = { id: 'sonar-cobertura', type: 'Problema', body: '', updatedAt: '', props: { sintoma: 'Quality Gate failed: coverage on new code', causa: 'cobertura de código novo abaixo de 80%', Solução: 'o agente de código adiciona testes nos arquivos alterados' } };
  const p = asKnownProblem(sonar)!;
  assert.equal(p.solucao, 'o agente de código adiciona testes nos arquivos alterados', 'chave com acento e maiúscula vale');
  assert.equal(asKnownProblem({ ...sonar, props: { url: 'x' } }), undefined, 'entidade sem sintoma e solução não é problema');
  assert.equal(matchesProblem(p, 'ERROR: Quality Gate failed\nCoverage on New Code 62.1% is less than 80%'), true);
  assert.equal(matchesProblem(p, 'fatal: not a git repository'), false);
  assert.equal(matchesProblem(p, 'build failed'), false, 'uma palavra solta em comum não basta');

  const steps = [{ id: 'acompanhar', label: 'Acompanhar o workflow', status: 'done' }, { id: 'checar', label: 'Checar a pasta', status: 'done' }, { id: 'deploy', label: 'Deploy', status: 'failed' }];
  const dev = (x: object) => ({ kind: 'comando' as const, detail: 'saiu com 1: erro', at: '', ...x });
  assert.deepEqual(knowledgeSuggestions({ steps, deviations: [
    dev({ command: 'gh run watch 1', step: 'acompanhar', recovered: true }),
    dev({ command: 'test -d /x', step: 'checar' }), // a check that exits 1 on purpose, never retried
    dev({ command: 'gh workflow run deploy', step: 'deploy' }),
    dev({ command: 'gh run view 2', step: 'deploy', known: true }), // already known
  ] }).map((t) => t.slice(0, 51)), [
    'o passo acompanhar (Acompanhar o workflow) esbarrou',
    'o passo deploy (Deploy) falhou em `gh workflow run ',
  ]);
});

test('revisão: cada analisador registrado vira achados do seu tipo, e só os que acharam algo explicam como corrigir', async () => {
  const { analyzeRun, howToFix } = await import('../src/review/analyzers/index.ts');
  const custom = { id: 'teste', kind: 'melhoria' as const, analyze: () => ['algo a melhorar'], howToFix: 'faça assim.' };
  const quiet = { id: 'calado', kind: 'problema' as const, analyze: () => [], howToFix: 'nunca aparece.' };
  const run = { id: 'r', playbook: 'p', conversationId: 'c', status: 'done', steps: [], startedAt: '', finishedAt: null, params: {}, outputs: {}, actions: [], deviations: [] } as never;
  const findings = analyzeRun(run, { open: false }, [custom, quiet, custom]);
  assert.deepEqual(findings, [{ kind: 'melhoria', text: 'algo a melhorar', analyzer: 'teste' }], 'mesmo texto uma vez só');
  assert.deepEqual(howToFix(findings, [custom, quiet]), ['faça assim.']);
});

test('corrigir só os passos mantém o que o procedimento entrega', () => {
  const b = new BrainStore(':memory:');
  b.savePlaybook(pb('promo', [['extrair', 'ler a página']], ['html_path']));
  b.learn([{ kind: 'playbook', payload: { name: 'promo', description: 'promo', trigger: 'promo', steps: [{ id: 'extrair', label: 'extrair', how: 'ler a página filtrada' }] } }], 'correção', 'c');
  assert.deepEqual(b.playbook('promo')!.outputs.map((o) => o.name), ['html_path']);
  assert.equal(b.playbook('promo')!.steps[0].how, 'ler a página filtrada');
});
