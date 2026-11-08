/**
 * Esteiras: validation, branches, data between stages, passages (ask, auto,
 * destination, agents), failures and missing data. The engine decides; these
 * tests play the agent's part by starting and finishing procedure runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db/database.ts';
import { BrainStore } from '../src/brain/store.ts';
import { Inbox } from '../src/conversations/inbox.ts';
import { PipelineRuns } from '../src/pipelines/runs.ts';
import { PipelineEngine } from '../src/pipelines/engine.ts';
import { inputProblems, resolveParams } from '../src/brain/domain/pipelines.ts';

function setup() {
  const db: DatabaseSync = openDatabase(':memory:');
  const brain = new BrainStore(db);
  const inbox = new Inbox(db);
  const runs = new PipelineRuns(db);
  const engine = new PipelineEngine({ brain, runs, inbox });
  const pb = (name: string, steps: string[], outputs: string[] = []) =>
    brain.savePlaybook({
      name, description: name, trigger: '', appliesTo: null, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null,
      steps: steps.map((label, i) => ({ id: `p${i}`, label, how: '' })),
      outputs: outputs.map((o) => ({ name: o, description: o })),
    });
  pb('workflow-dev', ['Acompanhar o workflow de {{repo}}'], ['versao', 'pr_url']);
  pb('hml-front', ['Promover {{versao}} do front'], ['url_hml']);
  pb('hml-api', ['Promover a imagem {{imagem}} da API'], ['url_hml']);
  pb('abrir-gmud', ['Abrir GMUD da {{versao}} com {{evidencia}}'], ['numero_gmud']);
  pb('preencher-gmud', ['Preencher a GMUD {{numero}}']);
  brain.savePipeline({
    name: 'entrega-do-portal',
    description: 'do dev até a GMUD',
    inputs: [{ name: 'repo', description: 'repositório' }, { name: 'tipo', description: 'front ou backend', options: ['front', 'backend'] }],
    stages: [
      { id: 'dev', label: 'Workflow dev', passage: 'auto', options: [{ playbook: 'workflow-dev' }] },
      { id: 'hml', label: 'Homologação', passage: 'auto', options: [{ playbook: 'hml-front', when: { field: 'tipo', equals: 'front' } }, { playbook: 'hml-api', when: { field: 'tipo', equals: 'backend' } }] },
      { id: 'gmud', label: 'Abrir GMUD', passage: 'ask', options: [{ playbook: 'abrir-gmud', map: { evidencia: 'hml.url_hml' } }] },
      { id: 'preencher', label: 'Preencher GMUD', passage: 'auto', options: [{ playbook: 'preencher-gmud', map: { numero: 'gmud.numero_gmud' } }] },
    ],
  });
  /** Plays the agent: runs what the engine said, hands over outputs, and returns the engine's next line. */
  const play = (conversationId: string, outputs: Record<string, string> = {}, fail = false) => {
    const run = runs.inConversation(conversationId)!;
    const stage = run.stages[run.current];
    const pbRun = brain.startRun(stage.playbook!, conversationId, stage.params);
    engine.runStarted(pbRun);
    const done = brain.updateRunStep(pbRun.id, 'p0', fail ? 'failed' : 'done', undefined, fail ? undefined : outputs);
    return { next: engine.runFinished(done), params: stage.params, playbook: stage.playbook };
  };
  return { brain, inbox, runs, engine, play };
}

test('esteira: validação diz o que está errado', () => {
  const { brain } = setup();
  const bad = (stages: unknown[], inputs: unknown[] = []) => () => brain.savePipeline({ name: 'x-y', description: '', inputs: inputs as never, stages: stages as never });
  assert.throws(bad([]), /pelo menos uma etapa/);
  assert.throws(bad([{ id: 'a', label: 'A', passage: 'auto', options: [{ playbook: 'nao-existe' }] }]), /procedimento não existe: nao-existe/);
  assert.throws(bad([{ id: 'a', label: 'A', passage: 'auto', options: [{ playbook: 'hml-front' }, { playbook: 'hml-api' }] }]), /cada um precisa de uma condição/);
  assert.throws(bad([{ id: 'a', label: 'A', passage: 'auto', options: [{ playbook: 'hml-front', when: { field: 'tipo', equals: 'x' } }] }]), /a condição usa "tipo"/);
  assert.throws(bad([{ id: 'a', label: 'A', passage: 'auto', options: [{ playbook: 'abrir-gmud', map: { evidencia: 'dev.url' } }] }]), /"dev" não é uma etapa anterior/);
  assert.throws(
    bad([{ id: 'dev', label: 'D', passage: 'auto', options: [{ playbook: 'workflow-dev' }] }, { id: 'g', label: 'G', passage: 'ask', options: [{ playbook: 'abrir-gmud', map: { evidencia: 'dev.url_hml' } }] }]),
    /a etapa dev não entrega url_hml/,
  );
  // The backend branch needs imagem, which nothing hands over: a gap, not an error.
  assert.deepEqual(brain.pipelineGaps(brain.pipeline('entrega-do-portal')!), [{ stage: 'hml', playbook: 'hml-api', param: 'imagem' }]);
});

test('esteira: dados por nome e por mapa, ramo pela entrada, para na passagem que pergunta', () => {
  const { engine, runs, inbox, play } = setup();
  assert.throws(() => engine.start('entrega-do-portal', { repo: 'acme/portal' }, { conversationId: 'chat:1' }), /falta tipo \(front ou backend\): front ou backend/);
  assert.throws(() => engine.start('entrega-do-portal', { repo: 'acme/portal', tipo: 'mobile' }, { conversationId: 'chat:1' }), /tipo deve ser front ou backend/);

  const { instruction } = engine.start('entrega-do-portal', { repo: 'acme/portal', tipo: 'front' }, { conversationId: 'chat:1' });
  assert.match(instruction, /etapa 1 de 4 \(Workflow dev\): rode agora o procedimento workflow-dev com playbook_start \{"name":"workflow-dev","params":\{"repo":"acme\/portal"\}\}/);
  assert.match(instruction, /registre versao, pr_url/);

  const dev = play('chat:1', { versao: '2.5.0', pr_url: 'https://pr/412' });
  assert.match(dev.next!, /etapa 2 de 4 \(Homologação\): rode agora o procedimento hml-front/, 'passagem auto e ramo front');
  assert.match(dev.next!, /versao ← dev\.versao/);

  const hml = play('chat:1', { url_hml: 'https://hml/portal' });
  assert.equal(hml.params.versao, '2.5.0');
  assert.match(hml.next!, /Passar para Abrir GMUD precisa da autorização do desenvolvedor/);
  const run = runs.inConversation('chat:1')!;
  assert.equal(run.status, 'waiting');
  assert.equal(run.waiting?.kind, 'passage');
  assert.equal(inbox.get(run.waiting!.inboxId!)?.kind, 'pipeline');

  const next = engine.decide(run.id, 'continue');
  assert.match(next!, /abrir-gmud com playbook_start \{"name":"abrir-gmud","params":\{"versao":"2.5.0","evidencia":"https:\/\/hml\/portal"\}\}/);
  assert.equal(inbox.get(run.waiting!.inboxId!)?.status, 'approved');
  assert.throws(() => engine.decide(run.id, 'continue'), /não está esperando/);

  const gmud = play('chat:1', { numero_gmud: 'CHG0041877' });
  assert.match(gmud.next!, /preencher-gmud com playbook_start \{"name":"preencher-gmud","params":\{"numero":"CHG0041877"\}\}/);
  const end = play('chat:1');
  assert.match(end.next!, /chegou ao fim.*versao=2\.5\.0.*numero_gmud=CHG0041877/);
  assert.equal(runs.inConversation('chat:1')?.status, 'done');
});

test('esteira: destino do desenvolvedor autoriza as passagens e para lá; agente não pula pergunta', () => {
  const { engine, runs, play } = setup();
  engine.start('entrega-do-portal', { repo: 'r', tipo: 'front' }, { conversationId: 'chat:2', destination: 'gmud' });
  play('chat:2', { versao: '1', pr_url: 'p' });
  const hml = play('chat:2', { url_hml: 'u' });
  assert.match(hml.next!, /abrir-gmud/, 'a passagem que pergunta seguiu: o desenvolvedor pediu até a GMUD');
  const gmud = play('chat:2', { numero_gmud: 'CHG1' });
  assert.match(gmud.next!, /chegou ao destino \(Abrir GMUD\)/);
  assert.equal(runs.inConversation('chat:2')?.stages[3].status, 'pending', 'não foi além do destino');

  engine.start('entrega-do-portal', { repo: 'r', tipo: 'front' }, { conversationId: 'chat:3', destination: 'gmud', requestedBy: 'agent:Claude Code' });
  play('chat:3', { versao: '1', pr_url: 'p' });
  assert.match(play('chat:3', { url_hml: 'u' }).next!, /precisa da autorização do desenvolvedor/, 'destino de agente não autoriza a passagem');

  engine.start('entrega-do-portal', { repo: 'r', tipo: 'front' }, { conversationId: 'chat:4', destination: 'gmud', requestedBy: 'agent:Claude Code', skipQuestions: true });
  play('chat:4', { versao: '1', pr_url: 'p' });
  assert.match(play('chat:4', { url_hml: 'u' }).next!, /abrir-gmud/, 'agente com permissão de pular perguntas');
  assert.match(play('chat:4', { numero_gmud: 'X' }).next!, /agent_reply \(done\)/);
});

test('esteira: falha para e espera; tentar de novo, pular ou encerrar', () => {
  const { engine, runs, play } = setup();
  engine.start('entrega-do-portal', { repo: 'r', tipo: 'front' }, { conversationId: 'chat:5' });
  const failed = play('chat:5', {}, true);
  assert.match(failed.next!, /falhou\. A esteira parou/);
  const run = runs.inConversation('chat:5')!;
  assert.deepEqual([run.status, run.waiting?.kind, run.stages[0].status], ['waiting', 'failure', 'failed']);
  assert.match(engine.decide(run.id, 'retry')!, /etapa 1 de 4 .*workflow-dev/);
  play('chat:5', {}, true);
  // Skipping: the next stage needs versao, which nobody handed over → asks.
  const skipped = engine.decide(run.id, 'skip');
  assert.match(skipped!, /faltam: versao/);
  const waiting = runs.get(run.id)!;
  assert.deepEqual([waiting.waiting?.kind, waiting.waiting?.missing], ['params', ['versao']]);
  assert.match(engine.decide(run.id, 'continue', { versao: '9.9.9' })!, /hml-front com playbook_start \{"name":"hml-front","params":\{"versao":"9.9.9"\}\}/);
  assert.equal(runs.get(run.id)!.stages[1].from.versao, 'desenvolvedor');
  play('chat:5', {}, true);
  assert.match(engine.decide(run.id, 'stop')!, /encerrou a entrega/);
  assert.equal(runs.get(run.id)!.status, 'cancelled');
});

test('esteira: ramo backend pede o dado que ninguém entrega; não apaga procedimento em uso', () => {
  const { engine, runs, brain, play } = setup();
  engine.start('entrega-do-portal', { repo: 'r', tipo: 'backend' }, { conversationId: 'chat:6' });
  const dev = play('chat:6', { versao: '1', pr_url: 'p' });
  assert.match(dev.next!, /Homologação \(hml-api\) faltam: imagem/);
  assert.equal(runs.inConversation('chat:6')?.stages[1].playbook, 'hml-api');
  assert.throws(() => brain.deletePlaybook('hml-api'), /está nas esteiras entrega-do-portal/);
  assert.throws(() => engine.start('entrega-do-portal', { repo: 'r', tipo: 'front' }, { conversationId: 'chat:6' }), /já tem uma esteira em andamento/);
  assert.deepEqual(inputProblems({ inputs: [{ name: 'a', description: '' }] }, { a: 'x' }), []);
  assert.deepEqual(resolveParams({ playbook: 'x', map: { b: 'perguntar' } }, ['a', 'b'], { inputs: { a: '1', b: '2' }, stages: {} }).missing, ['b']);
});
