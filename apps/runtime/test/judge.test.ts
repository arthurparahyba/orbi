import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, outOfScope, RECURRING_AFTER } from '../src/brain/domain/judge.ts';
import { runDeviations, workedAround, type Deviation } from '../src/brain/domain/levels.ts';
import { asKnownProblem, recurrence } from '../src/brain/domain/knowledge.ts';
import { credentialProblems } from '../src/brain/domain/learning.ts';

/** The end-of-run review: autonomy before perfection (docs/funcionalidades/19). */

const at = '2026-11-10T20:00:00.000Z';
const cert: Deviation = { kind: 'falha', detail: 'run_script falhou: certificate verify failed', tool: 'run_script', step: 'banco', at, problem: 'cert-rds' };
const problem = asKnownProblem({ id: 'cert-rds', type: 'Problema', props: { sintoma: 'certificate verify failed', solucao: 'usar o bundle rds-ca', raiz: 'instalar o bundle da AWS no Python do ambiente' }, body: '', updatedAt: at })!;
const run = (over: Record<string, unknown> = {}) => ({
  status: 'done',
  steps: [{ id: 'tasks', status: 'done' }, { id: 'banco', status: 'done' }],
  deviations: [] as Deviation[],
  actions: [] as Array<{ fingerprint: string; tool: string; effect: 'leitura'; summary: string; step: string | null }>,
  asked: 4,
  ...over,
});
const never = () => false;

test('nível: problema conhecido contornado com a solução conhecida não conta como desvio', () => {
  assert.equal(workedAround(cert, run().steps), true);
  assert.deepEqual(runDeviations(run({ deviations: [cert] })), [], 'a execução fica limpa e pode subir');
  // Unknown failure, or the step did not end well: still counts.
  assert.equal(runDeviations(run({ deviations: [{ ...cert, problem: undefined }] })).length, 1);
  assert.equal(runDeviations(run({ deviations: [cert], steps: [{ id: 'banco', status: 'failed' }] })).length, 2);
});

test('recorrência: execuções seguidas, da mais nova para trás, com o mesmo problema', () => {
  const r = (p?: string) => ({ deviations: p ? [{ ...cert, problem: p }] : [] });
  assert.equal(recurrence([r('cert-rds'), r('cert-rds'), r(), r('cert-rds')], 'cert-rds'), 2);
  assert.equal(recurrence([r(), r('cert-rds')], 'cert-rds'), 0);
});

test('juiz: problema recorrente vira "corrigir o ambiente", uma vez só', () => {
  const v = judge({ run: run({ deviations: [cert] }), findings: [], recurring: [{ problem, runs: RECURRING_AFTER }], environmentAsked: never });
  assert.deepEqual(v.map((x) => x.kind), ['fixEnvironment']);
  assert.equal((v[0] as any).problem.raiz, 'instalar o bundle da AWS no Python do ambiente');
  assert.deepEqual(judge({ run: run(), findings: [], recurring: [{ problem, runs: 1 }], environmentAsked: never }), [], 'uma vez só não é recorrente');
  assert.deepEqual(judge({ run: run(), findings: [], recurring: [{ problem, runs: 5 }], environmentAsked: () => true }), [], 'já perguntado: não insiste');
});

test('juiz: melhoria que não muda resultado nem autonomia vira ideia guardada', () => {
  const v = judge({ run: run(), findings: [{ kind: 'melhoria', analyzer: 'tabela-copiada', text: 'faça o script imprimir o componente' }], recurring: [], environmentAsked: never });
  assert.deepEqual(v.map((x) => x.kind), ['keepIdea']);
});

test('juiz: melhoria que corta muitas aprovações muda só os passos dela', () => {
  const py = (step: string) => ({ fingerprint: 'run_command python3 -c print(1)', tool: 'run_command', effect: 'leitura' as const, summary: '', step });
  const v = judge({ run: run({ asked: 4, actions: [py('banco'), py('banco')] }), findings: [{ kind: 'melhoria', analyzer: 'python-na-hora', text: 'guarde como script' }], recurring: [], environmentAsked: never });
  assert.equal(v[0].kind, 'changeProcedure');
  assert.deepEqual((v[0] as any).steps, ['banco']);
  assert.match((v[0] as any).why, /corta 2 de 4 aprovações/);
  // One of ten: not worth it.
  assert.equal(judge({ run: run({ asked: 10, actions: [py('banco')] }), findings: [{ kind: 'melhoria', analyzer: 'python-na-hora', text: 'x' }], recurring: [], environmentAsked: never })[0].kind, 'keepIdea');
});

test('juiz: execução que não chegou ao fim pode mudar, só nos passos com problema; problema novo é para aprender', () => {
  const v = judge({
    run: run({ status: 'failed', steps: [{ id: 'tasks', status: 'done' }, { id: 'banco', status: 'failed' }] }),
    findings: [{ kind: 'problema', analyzer: 'desvios', text: 'passo banco falhou' }, { kind: 'aprender', analyzer: 'problema-conhecido', text: 'registre o erro novo' }],
    recurring: [], environmentAsked: never,
  });
  assert.deepEqual(v.map((x) => x.kind), ['changeProcedure', 'learnProblem']);
  assert.deepEqual((v[0] as any).steps, ['banco']);
});

test('mudança mínima: passos fora do escopo pedido ficam como estão', () => {
  const before = [{ id: 'tasks', label: 'Ver as tasks', how: 'aws ecs' }, { id: 'banco', label: 'Ver o banco', how: 'psql' }];
  assert.deepEqual(outOfScope(before, [before[0], { ...before[1], how: 'run_script banco.py' }], ['banco']), []);
  assert.deepEqual(outOfScope(before, [{ ...before[0], label: 'Listar tasks' }, before[1], { id: 'extra', label: 'x', how: '' }], ['banco']), ['tasks', 'extra (novo)']);
  assert.deepEqual(outOfScope(before, [before[0]], ['tasks']), ['banco (removido)']);
});

test('fatos: credencial nunca vira fato; referência ao cofre e endereço do banco sim', () => {
  assert.equal(credentialProblems({ senha: 'x1' }).length, 1);
  assert.equal(credentialProblems({ db_password: 'x1' }).length, 1);
  assert.equal(credentialProblems({ acesso: 'AKIAABCDEFGHIJKLMNOP' }).length, 1);
  assert.deepEqual(credentialProblems({ senha: '{{segredo:rds/senha}}', endereco: 'app-x.cluster.rds.amazonaws.com', token_url: 'https://sso/token' }), []);
});

test('intervenção: o que o desenvolvedor digita durante a execução fica no passo, não conta no nível e abre a mudança só nele', async () => {
  const { BrainStore } = await import('../src/brain/store.ts');
  const b = new BrainStore(':memory:');
  b.savePlaybook({ name: 'publicar', description: 'Publica', trigger: '', appliesTo: null, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null,
    steps: [{ id: 'abrir', label: 'Abrir', how: '' }, { id: 'criar', label: 'Criar', how: '' }] });
  const run = b.startRun('publicar', 'c1');
  b.execution.noteIntervention('c1', 'não, é por Releases › Criar release');
  const after = b.run(run.id)!;
  const d = after.deviations.find((x) => x.kind === 'intervencao')!;
  assert.match(d.detail, /você escreveu no passo abrir: "não, é por Releases › Criar release"/);
  assert.deepEqual(runDeviations({ ...after, status: 'done', steps: after.steps.map((s) => ({ ...s, status: 'done' })) }), [], 'não segura o nível');
  const v = judge({ run: { ...after, status: 'done', steps: after.steps.map((s) => ({ ...s, status: 'done' })) }, findings: [], recurring: [], environmentAsked: never });
  assert.equal(v[0].kind, 'changeProcedure');
  assert.deepEqual((v[0] as any).steps, ['abrir']);
  assert.match((v[0] as any).why, /se foi só uma confirmação, não mude nada/);
  // Outside a run, or in a rehearsal, typing is just the conversation.
  b.execution.noteIntervention('c2', 'oi');
  assert.equal(b.runs().filter((r) => r.conversationId === 'c2').length, 0);
});
