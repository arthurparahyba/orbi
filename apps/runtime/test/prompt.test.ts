import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composePrompt, promptParts, RUN_RULES, type Situation } from '../src/agents/prompt.ts';

const plain: Situation = { activeRun: false, lastToolFailed: false, pipelines: 0, delivery: false, agentRequest: false };
const ids = (s: Partial<Situation>) => promptParts({ ...plain, ...s }).map((p) => p.id);

// A10: each part only when its situation exists.
test('conversa simples leva só a base', () => {
  assert.deepEqual(ids({}), ['base']);
  const text = composePrompt(plain);
  assert.match(text, /Você é o Orbi/);
  assert.match(text, /Já sei algo parecido\?/);
  assert.doesNotMatch(text, /pipeline_start|agent_reply|playbook_step/);
});

test('procedimento em andamento traz execução e falhas', () => {
  assert.deepEqual(ids({ activeRun: true }), ['base', 'procedimento', 'falhas']);
});

test('ferramenta que falhou traz as regras de falha', () => {
  assert.deepEqual(ids({ lastToolFailed: true }), ['base', 'falhas']);
});

test('esteiras só quando existem ou a conversa é uma entrega', () => {
  assert.deepEqual(ids({ pipelines: 2 }), ['base', 'esteiras']);
  assert.deepEqual(ids({ delivery: true }), ['base', 'esteiras']);
});

test('pedido de agente de código traz as regras dele', () => {
  assert.deepEqual(ids({ agentRequest: true }), ['base', 'agentes']);
  assert.match(composePrompt({ ...plain, agentRequest: true }), /agent_reply/);
});

test('o playbook_start leva as regras de execução', () => {
  assert.match(RUN_RULES, /playbook_step/);
  assert.match(RUN_RULES, /knownProblems/);
});

test('correção de código só entra com agente cadastrado e algo rodando ou falhando', () => {
  assert.deepEqual(ids({ codeAgents: true }), ['base'], 'conversa simples não leva');
  assert.deepEqual(ids({ codeAgents: true, lastToolFailed: true }), ['base', 'falhas', 'correcao-de-codigo']);
  assert.deepEqual(ids({ activeRun: true }), ['base', 'procedimento', 'falhas'], 'sem agente, não leva');
});
