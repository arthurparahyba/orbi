import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wireContexts, type Contexts } from '../src/wiring.ts';
import { citations, inputProblems, leakedSpecifics } from '../src/contexts/procedures/definition/src/concepts.ts';
import type { OntologyType } from '../src/language/index.ts';

/** Procedures over concepts (docs/funcionalidades/18): inputs, citations, specifics, passo 0. */

const TYPES: OntologyType[] = [
  { name: 'MicroFrontend', description: 'Front publicado por um portal', relations: { publicadoPor: 'Portal' }, requires: [], props: { repositorio: 'onde está o código' } },
  { name: 'Portal', description: 'Sistema web', relations: {}, requires: [], props: { endereco: 'URL', credencial: 'nome no cofre' }, knows: { achar: 'buscar pelo nome na lista de aplicações' } },
  { name: 'Versao', description: 'Número semver', relations: {}, requires: [] },
];
const typeOf = (name: string) => TYPES.find((t) => t.name === name);

const steps = [
  { id: 'abrir', label: 'Abrir o portal de {{mfe}}', how: 'navegador em {{mfe.publicadoPor.endereco}}' },
  { id: 'entrar', label: 'Entrar', how: '{{segredo:{{mfe.publicadoPor.credencial}}}}' },
  { id: 'publicar', label: 'Criar o release {{versao}}', how: 'Releases › Criar release' },
];
const inputs = [{ name: 'mfe', concept: 'MicroFrontend' }, { name: 'versao' }];

test('conceitos: citações válidas pelas ligações e propriedades do conceito', () => {
  assert.deepEqual(citations({ steps, instructions: '' }).sort(), ['mfe', 'mfe.publicadoPor.credencial', 'mfe.publicadoPor.endereco', 'versao']);
  assert.deepEqual(inputProblems({ steps, instructions: '', inputs }, typeOf), []);
});

test('conceitos: citação que o conceito não tem, entrada que não existe, conceito que não existe', () => {
  const bad = [
    { id: 'a', label: 'x', how: '{{mfe.publicadoPor.senha}} e {{ambiente}} e {{mfe.repositorio.url}}' },
  ];
  const problems = inputProblems({ steps: bad, instructions: '', inputs: [...inputs, { name: 'app', concept: 'Aplicacao' }] }, typeOf);
  assert.ok(problems.some((p) => /"senha" não é propriedade nem ligação de Portal/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => /"ambiente" não é uma entrada/.test(p)));
  assert.ok(problems.some((p) => /"repositorio" é propriedade de MicroFrontend, não leva/.test(p)));
  assert.ok(problems.some((p) => /conceito Aplicacao não existe/.test(p)));
  // The older procedures, without inputs, keep their free {{parameters}}.
  assert.deepEqual(inputProblems({ steps: bad, instructions: '' }, typeOf), []);
});

test('conceitos: nome específico escrito no procedimento volta como "é fato ou entrada?"', () => {
  const entitiesOf = (type: string) => (type === 'MicroFrontend' ? [{ id: 'checkout-mfe', type, props: {}, body: '', aliases: ['checkout'], updatedAt: '' }] : []);
  const leaked = leakedSpecifics({ steps: [{ id: 'a', label: 'Abrir o checkout-mfe', how: 'portal' }], instructions: '', inputs, appliesTo: 'MicroFrontend' }, entitiesOf);
  assert.equal(leaked.length, 1);
  assert.match(leaked[0], /"checkout-mfe".*fato ou entrada/);
  // Inside a citation or part of another word, it is not a leak.
  assert.deepEqual(leakedSpecifics({ steps: [{ id: 'a', label: 'Abrir {{mfe}}', how: 'checkout-mfe-novo' }], instructions: '', inputs, appliesTo: null }, entitiesOf), []);
});

function brainWithFacts(): Contexts {
  const brain = wireContexts(openDatabase(':memory:'));
  for (const t of TYPES) brain.knowledge.upsertType(t);
  brain.knowledge.upsertEntity({ id: 'portal-deploy', type: 'Portal', props: { endereco: 'http://portal.local/apps', credencial: 'portal-deploy' }, body: '' });
  brain.knowledge.upsertEntity({ id: 'checkout-mfe', type: 'MicroFrontend', props: {}, body: '' });
  brain.knowledge.addEdge({ from: 'checkout-mfe', rel: 'publicadoPor', to: 'portal-deploy' });
  brain.procedures.definition.savePlaybook({
    name: 'atualizar-versao-mfe', description: 'Publica uma versão de um MFE', appliesTo: 'MicroFrontend', trigger: 'subir versão de MFE',
    autonomy: 'ask', steps, instructions: '', learnedFrom: null, variationOf: null, intent: 'Publicar uma Versao de um MicroFrontend', inputs,
  });
  return brain;
}

test('aprender: o procedimento com nome específico é recusado; com a entrada, passa', () => {
  const brain = brainWithFacts();
  const problems = brain.learning.learnProblems([
    { kind: 'playbook', payload: { name: 'outro', description: 'x', trigger: 'x', instructions: '', inputs, steps: [{ id: 'a', label: 'Abrir checkout-mfe', how: 'x' }] } },
  ]);
  assert.match(problems.join('\n'), /checkout-mfe.*fato ou entrada/);
  assert.deepEqual(brain.learning.learnProblems([{ kind: 'playbook', payload: { name: 'outro', description: 'x', trigger: 'x', instructions: '', inputs, steps } }]), []);
});

test('aprender: tipo de novo sem ligações mantém as que tinha; propriedades somam', () => {
  const brain = brainWithFacts();
  brain.learning.learn([{ kind: 'type', payload: { name: 'MicroFrontend', description: '', props: { time: 'dono' } } }], 'x', 'chat:x');
  const t = brain.knowledge.type('MicroFrontend')!;
  assert.deepEqual(t.relations, { publicadoPor: 'Portal' });
  assert.deepEqual(t.props, { repositorio: 'onde está o código', time: 'dono' });
  assert.equal(t.description, 'Front publicado por um portal');
  // A fact learned through the card says where it came from.
  brain.learning.learn([{ kind: 'entity', payload: { id: 'perfil-mfe', type: 'MicroFrontend', aliases: ['perfil'] } }], 'x', 'chat:x');
  assert.equal(brain.knowledge.get('perfil-mfe')?.source, 'cartao:chat:x');
  assert.deepEqual(brain.knowledge.get('perfil-mfe')?.aliases, ['perfil']);
});

test('passo 0: o que o cérebro sabe preenche os passos; o resto é para resolver', () => {
  const brain = brainWithFacts();
  const known = brain.procedures.execution.startRun('atualizar-versao-mfe', 'chat:a', { mfe: 'checkout-mfe', versao: '2.14.0' });
  assert.equal(known.steps[0].how, 'navegador em http://portal.local/apps');
  assert.equal(known.steps[1].how, '{{segredo:portal-deploy}}', 'a credencial continua referência do cofre');
  assert.equal(known.steps[2].label, 'Criar o release 2.14.0');
  assert.deepEqual(brain.procedures.execution.inputState(known.id), { toResolve: [], unknown: [] });

  const unknown = brain.procedures.execution.startRun('atualizar-versao-mfe', 'chat:b', { mfe: 'xpto', versao: '1.3.0' });
  const state = brain.procedures.execution.inputState(unknown.id);
  assert.deepEqual(state.toResolve, [{ input: 'mfe', value: 'xpto', concept: 'MicroFrontend', candidates: [] }]);
  assert.equal(unknown.steps[0].how, 'navegador em {{mfe.publicadoPor.endereco}}');
});

test('passo 0: achou investigando vira fato com outro nome; da próxima vez vai direto; desfazer tira', () => {
  const brain = brainWithFacts();
  const run = brain.procedures.execution.startRun('atualizar-versao-mfe', 'chat:c', { mfe: 'xpto', versao: '1.3.0' });
  const { run: after, learned } = brain.procedures.execution.resolveInput(run.id, 'mfe', { entity: 'xpto-mfe', relations: [{ rel: 'publicadoPor', to: 'portal-deploy' }] });
  assert.equal(learned.learned, 'created');
  assert.equal(after.steps[0].how, 'navegador em http://portal.local/apps');
  const fact = brain.knowledge.get('xpto-mfe')!;
  assert.deepEqual(fact.aliases, ['xpto']);
  assert.equal(fact.source, `execucao:${run.id}`);

  // Next time "xpto" is known: nothing to resolve.
  const again = brain.procedures.execution.startRun('atualizar-versao-mfe', 'chat:d', { mfe: 'xpto', versao: '1.4.0' });
  assert.equal(again.resolved?.mfe.entity, 'xpto-mfe');
  assert.deepEqual(brain.procedures.execution.inputState(again.id).toResolve, []);

  // An existing fact by another name: the name becomes an alias, and undo takes only that back.
  const third = brain.procedures.execution.startRun('atualizar-versao-mfe', 'chat:e', { mfe: 'checkout', versao: '2.0.0' });
  assert.equal(brain.procedures.execution.resolveInput(third.id, 'mfe', { entity: 'checkout-mfe' }).learned.learned, 'alias');
  assert.deepEqual(brain.knowledge.get('checkout-mfe')?.aliases, ['checkout']);
  brain.procedures.execution.undoResolved(third.id, 'mfe');
  assert.deepEqual(brain.knowledge.get('checkout-mfe')?.aliases, []);
  assert.ok(brain.knowledge.get('checkout-mfe'), 'desfazer um outro nome não apaga o fato');

  brain.procedures.execution.undoResolved(run.id, 'mfe');
  assert.equal(brain.knowledge.get('xpto-mfe'), undefined, 'o fato criado na execução sai');
  assert.equal(brain.procedures.execution.run(run.id)?.resolved?.mfe.undone, true);
});

test('passo 0: só fatos de um conceito que existe, do tipo da entrada', () => {
  const brain = brainWithFacts();
  const run = brain.procedures.execution.startRun('atualizar-versao-mfe', 'chat:f', { mfe: 'portal', versao: '1' });
  assert.throws(() => brain.procedures.execution.resolveInput(run.id, 'mfe', { entity: 'portal-deploy' }), /é Portal, não MicroFrontend/);
  assert.throws(() => brain.procedures.execution.resolveInput(run.id, 'versao', { entity: '1.0.0' }), /não tem a entrada versao com conceito/);
});

// ── fase 4: sei / não sei ──
import { afterCommand } from '../src/contexts/tools/terminal/src/runner.ts';
import { openDatabase } from '../src/db/database.ts';

function environmentBrain(): Contexts {
  const brain = wireContexts(openDatabase(':memory:'));
  brain.knowledge.upsertType({ name: 'Ambiente', description: 'onde roda', relations: { recurso: '*' }, requires: [], props: { profile: 'profile da AWS CLI' } });
  brain.knowledge.upsertType({ name: 'ServicoECS', description: 'serviço', relations: {}, requires: [], knows: { de_pe: 'running = desired' } });
  brain.knowledge.upsertType({ name: 'NLB', description: 'balanceador', relations: {}, requires: [], knows: { de_pe: 'targets healthy' } });
  brain.knowledge.upsertType({ name: 'FilaSQS', description: 'fila', relations: {}, requires: [] });
  brain.knowledge.upsertEntity({ id: 'pag-hml', type: 'Ambiente', props: { profile: 'pag-hml' }, body: '' });
  for (const [id, type] of [['pag-api-svc', 'ServicoECS'], ['pag-nlb', 'NLB'], ['pag-eventos', 'FilaSQS']]) {
    brain.knowledge.upsertEntity({ id, type, props: {}, body: '' });
    brain.knowledge.addEdge({ from: 'pag-hml', rel: 'recurso', to: id });
  }
  brain.procedures.definition.savePlaybook({
    name: 'validar-ambiente', description: 'Confere se um ambiente está de pé', appliesTo: 'Ambiente', trigger: 'validar ambiente',
    autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null, inputs: [{ name: 'ambiente', concept: 'Ambiente' }],
    steps: [
      { id: 'conectar', label: 'Conectar', how: 'AWS CLI com --profile {{ambiente.profile}}' },
      { id: 'conferir', label: 'Conferir cada recurso', how: '{{ambiente.recurso[].de_pe}}' },
    ],
  });
  return brain;
}

test('sei / não sei: [] percorre a ligação e usa o saber do conceito de cada um', () => {
  assert.deepEqual(inputProblems({ steps: [{ id: 'a', label: 'x', how: '{{mfe.publicadoPor[].de_pe}}' }], instructions: '', inputs }, typeOf), []);
  assert.match(inputProblems({ steps: [{ id: 'a', label: 'x', how: '{{mfe.repositorio[].de_pe}}' }], instructions: '', inputs }, typeOf)[0], /só uma ligação pode ter \[\]/);
  assert.match(inputProblems({ steps: [{ id: 'a', label: 'x', how: '{{mfe.publicadoPor[].a.b}}' }], instructions: '', inputs }, typeOf)[0], /vem só o nome do saber/);

  const brain = environmentBrain();
  const run = brain.procedures.execution.startRun('validar-ambiente', 'chat:amb', { ambiente: 'pag-hml' });
  assert.equal(run.steps[0].how, 'AWS CLI com --profile pag-hml');
  assert.equal(run.steps[1].how, '{{ambiente.recurso[].de_pe}}', 'com um recurso sem saber, o passo não é preenchido pela metade');
  const items = brain.procedures.execution.readiness(run.id);
  assert.deepEqual(items.filter((i) => !i.known).map((i) => [i.label, i.detail]), [['pag-eventos (FilaSQS)', 'não sei "de_pe"']]);
  assert.ok(items.some((i) => i.known && i.label === 'pag-api-svc (ServicoECS)' && i.detail === 'running = desired'));
  assert.deepEqual(brain.procedures.execution.inputState(run.id).unknown, ['pag-eventos (FilaSQS): não sei "de_pe"']);

  // Taught what "de pé" is for a queue (a saber of the concept), every environment with a queue knows it.
  brain.learning.learn([{ kind: 'type', payload: { name: 'FilaSQS', description: '', knows: { de_pe: 'DLQ vazia' } } }], 'x', 'chat:amb');
  const again = brain.procedures.execution.startRun('validar-ambiente', 'chat:amb2', { ambiente: 'pag-hml' });
  assert.match(again.steps[1].how, /pag-eventos \(FilaSQS\): DLQ vazia/);
  assert.deepEqual(brain.procedures.execution.readiness(again.id).filter((i) => !i.known), []);
});

test('sei / não sei: erro que o cérebro nunca viu, dentro de um procedimento, é dito como tal', () => {
  const brain = environmentBrain();
  brain.procedures.execution.startRun('validar-ambiente', 'chat:erro', { ambiente: 'pag-hml' });
  const failed = { exitCode: 1, stdout: '', stderr: 'HTTP 500 do catálogo de serviços' };
  assert.equal((afterCommand(brain.procedures.execution, 'chat:erro', 'node registrar.mjs', failed) as { nuncaVi?: boolean }).nuncaVi, true);
  assert.deepEqual(afterCommand(brain.procedures.execution, 'chat:fora', 'node registrar.mjs', failed), {}, 'fora de um procedimento, não');
  assert.deepEqual(afterCommand(brain.procedures.execution, 'chat:erro', 'node registrar.mjs', { ...failed, exitCode: 0 }), {});
});
