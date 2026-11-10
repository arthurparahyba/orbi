import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationState } from '../src/conversations/state.ts';
import { finishRehearsal, newRehearsal, rehearsalStep } from '../src/brain/domain/rehearsal.ts';
import type { PlaybookRun } from '../src/brain/domain/types.ts';

/** Where a conversation is, for the teaching screen (docs/funcionalidades/01): derived, never stored. */

const at = '2026-11-10T20:00:00.000Z';
const rehearsal = () => newRehearsal('run:e', 'chat:a', 'subir versão do MFE', at);
const run = (status: PlaybookRun['status']): PlaybookRun => ({ ...rehearsal(), id: 'run:r', kind: 'run', playbook: 'atualizar-mfe', status });

test('etapa: conversa sem nada ainda está em Explicar', () => {
  assert.deepEqual(conversationState({ learningOpen: false }), { mode: 'ensinando', stage: 'explicar' });
});

test('etapa: ensaio em curso é Ensaiar; todos os passos feitos e sem acordo é Combinar', () => {
  let r = rehearsalStep(rehearsal(), { label: 'Abrir o portal', status: 'done' });
  r = rehearsalStep(r, { label: 'Criar release', status: 'waiting' });
  assert.deepEqual(conversationState({ lastRun: r, learningOpen: false }), { mode: 'ensinando', stage: 'ensaiar' });
  r = rehearsalStep(r, { label: 'Criar release', status: 'done' });
  assert.deepEqual(conversationState({ lastRun: r, learningOpen: false }), { mode: 'ensinando', stage: 'combinar' });
});

test('etapa: ensaio com acordo ou cartão de aprendizado aberto é Aprender', () => {
  const r = finishRehearsal(rehearsalStep(rehearsal(), { label: 'Abrir', status: 'done' }), { start: 'pedido de subir versão', receives: ['mfe'], end: 'release verde', outside: [], corrections: [] }, at);
  assert.deepEqual(conversationState({ lastRun: r, learningOpen: false }), { mode: 'ensinando', stage: 'aprender' });
  assert.deepEqual(conversationState({ learningOpen: true }), { mode: 'ensinando', stage: 'aprender' });
  // Learned something but a card still waits: still learning.
  assert.equal(conversationState({ learningOpen: true, learned: { name: 'x', level: 1 } }).mode, 'ensinando');
});

test('etapa: procedimento aprendido aqui e nada esperando é Já sei fazer, com o nível', () => {
  assert.deepEqual(conversationState({ lastRun: rehearsal(), learningOpen: false, learned: { name: 'atualizar-mfe', level: 1 } }), { mode: 'aprendido', stage: 'assumir', playbook: 'atualizar-mfe', level: 1 });
});

test('etapa: uma execução de verdade é a última coisa: Fazendo, com o estado', () => {
  assert.deepEqual(conversationState({ lastRun: run('waiting'), learningOpen: false, learned: { name: 'atualizar-mfe', level: 1 } }), { mode: 'fazendo', playbook: 'atualizar-mfe', status: 'waiting' });
});
