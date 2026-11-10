import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNotebook, nextLevel } from '../src/conversations/notebook.ts';
import { finishRehearsal, newRehearsal, rehearsalStep } from '../src/brain/domain/rehearsal.ts';
import type { Entity, Playbook, PlaybookRun } from '../src/brain/domain/types.ts';

/** The "O que estou aprendendo" panel (docs/funcionalidades/01): built from the brain, never by the model. */

const at = '2026-11-10T20:00:00.000Z';
const ent = (id: string, type: string, source?: string): Entity => ({ id, type, props: {}, body: '', updatedAt: at, ...(source ? { source } : {}) });
const pb = (over: Partial<Playbook> = {}): Playbook => ({
  name: 'atualizar-mfe', description: 'Sobe a versão de um MFE', appliesTo: null, trigger: '', autonomy: 'ask', instructions: '', learnedFrom: 'chat:a',
  intent: 'Publicar uma Versao de um MicroFrontend', inputs: [{ name: 'mfe', concept: 'MicroFrontend' }, { name: 'versao' }],
  steps: [{ id: 'abrir', label: 'Abrir o portal', how: '' }, { id: 'criar', label: 'Criar o release', how: '' }],
  variationOf: null, outputs: [], scripts: [], level: 1, levelMax: 3, levelBy: 'learned', cleanStreak: 0, uses: 0, successes: 0, updatedAt: at, ...over,
});
const agreement = { start: 'pedido de subir versão', receives: ['mfe', 'versao'], end: 'release verde', outside: ['GMUD'], corrections: [{ explained: 'Nova versão', actual: 'Releases › Criar release' }] };

test('caderno: sem ensaio ainda, vazio e em Explicar', () => {
  const n = buildNotebook({ conversationId: 'chat:a', state: { mode: 'ensinando', stage: 'explicar' }, entities: [], runIds: [], readiness: [] });
  assert.deepEqual(n, { state: { mode: 'ensinando', stage: 'explicar' }, steps: [], receives: [], noted: [], readiness: [] });
});

test('caderno: no ensaio, a intenção, os passos como foram e só os fatos desta conversa', () => {
  let run = rehearsalStep(newRehearsal('run:e', 'chat:a', 'subir versão do MFE', at), { label: 'Abrir o portal', status: 'done' });
  run = rehearsalStep(run, { label: 'Achar onde cria', status: 'waiting', note: 'Nova versão ou Releases?' });
  const n = buildNotebook({
    conversationId: 'chat:a', state: { mode: 'ensinando', stage: 'ensaiar' }, lastRun: run, runIds: ['run:e'], readiness: [],
    entities: [ent('checkout-mfe', 'MicroFrontend', 'cartao:chat:a'), ent('outro', 'MicroFrontend', 'cartao:chat:b'), ent('xpto', 'MicroFrontend', 'execucao:run:e'), ent('sem-origem', 'Portal')],
  });
  assert.equal(n.intent, 'subir versão do MFE');
  assert.deepEqual(n.steps, [{ label: 'Abrir o portal', status: 'done' }, { label: 'Achar onde cria', status: 'waiting', note: 'Nova versão ou Releases?' }]);
  assert.deepEqual(n.noted.map((x) => x.id), ['checkout-mfe', 'xpto']);
  assert.equal(n.agreement, undefined);
});

test('caderno: com o acordo, recebe, começa e termina, fica de fora e correções', () => {
  const run = finishRehearsal(rehearsalStep(newRehearsal('run:e', 'chat:a', 'subir versão', at), { label: 'Abrir', status: 'done' }), agreement, at);
  const n = buildNotebook({ conversationId: 'chat:a', state: { mode: 'ensinando', stage: 'aprender' }, lastRun: run, entities: [], runIds: ['run:e'], readiness: [] });
  assert.deepEqual(n.receives, ['mfe', 'versao']);
  assert.deepEqual(n.agreement, { start: agreement.start, end: agreement.end, outside: agreement.outside, corrections: agreement.corrections });
});

test('caderno: aprendido mostra o procedimento, os passos planejados, o acordo e quanto falta para subir', () => {
  const run = finishRehearsal(newRehearsal('run:e', 'chat:a', 'subir versão', at), agreement, at);
  const n = buildNotebook({ conversationId: 'chat:a', state: { mode: 'aprendido', stage: 'assumir', playbook: 'atualizar-mfe', level: 1 }, lastRun: run, procedure: pb(), entities: [], runIds: ['run:e'], readiness: [] });
  assert.equal(n.intent, 'Publicar uma Versao de um MicroFrontend');
  assert.deepEqual(n.receives, ['mfe (MicroFrontend)', 'versao']);
  assert.deepEqual(n.steps.map((s) => s.status), ['planned', 'planned']);
  assert.equal(n.agreement?.end, 'release verde');
  assert.deepEqual(n.procedure?.nextLevel, { level: 2, cleanRunsLeft: 1 });
});

test('caderno: fazendo mostra os passos da execução e o que sabe', () => {
  const run: PlaybookRun = { ...newRehearsal('run:r', 'chat:a', '', at), kind: 'run', playbook: 'atualizar-mfe', status: 'waiting', steps: [{ id: 'abrir', label: 'Abrir o portal', how: '', status: 'done' }, { id: 'criar', label: 'Criar o release 2.15.0', how: '', status: 'waiting' }] };
  const readiness = [{ label: 'mfe: checkout', known: true, detail: 'checkout-mfe (MicroFrontend)' }];
  const n = buildNotebook({ conversationId: 'chat:a', state: { mode: 'fazendo', playbook: 'atualizar-mfe', status: 'waiting' }, lastRun: run, procedure: pb(), entities: [], runIds: ['run:r'], readiness });
  assert.deepEqual(n.steps.map((s) => [s.label, s.status]), [['Abrir o portal', 'done'], ['Criar o release 2.15.0', 'waiting']]);
  assert.deepEqual(n.readiness, readiness);
  assert.equal(n.procedure?.name, 'atualizar-mfe');
});

test('caderno: o próximo nível respeita o teto e a sequência limpa', () => {
  assert.deepEqual(nextLevel({ level: 2, levelMax: 3, cleanStreak: 1 }), { level: 3, cleanRunsLeft: 2 });
  assert.equal(nextLevel({ level: 2, levelMax: 2, cleanStreak: 0 }), undefined);
  assert.equal(nextLevel({ level: 3, levelMax: 3, cleanStreak: 0 }), undefined);
});
