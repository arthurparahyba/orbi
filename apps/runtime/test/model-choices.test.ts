import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownTier, modelChoices, modelSpecFor } from '../src/llm/choices.ts';

/** Choosing the model per conversation (docs/funcionalidades/12): what is offered, its cost, what the agent runs with. */

const plugin = {
  model: 'orbi-llm/yara-medio', anthropic: false,
  adapter: { name: 'yara', chat: async () => ({ text: '' }), models: [{ id: 'yara-mini', tier: 'cheap' as const }, { id: 'yara-medio' }, { id: 'yara-max', tier: 'premium' as const }] },
};

test('modelos: do plugin, o padrão primeiro, custo do plugin ou o que você classificou', () => {
  const c = modelChoices(plugin as never, { 'yara-medio': 'standard', 'yara-max': 'standard' });
  assert.equal(c.default, 'yara-medio');
  assert.deepEqual(c.models, [
    { id: 'yara-medio', tier: 'standard', tierBy: 'voce' },
    { id: 'yara-mini', tier: 'cheap', tierBy: 'plugin' },
    { id: 'yara-max', tier: 'standard', tierBy: 'voce' },
  ]);
  // Without a tier from anyone, it says so (no guess for a company model).
  assert.deepEqual(modelChoices({ ...plugin, adapter: { ...plugin.adapter, models: [{ id: 'yara-medio' }, { id: 'haiku-da-empresa' }] } } as never, {}).models, [{ id: 'yara-medio' }, { id: 'haiku-da-empresa' }]);
});

test('modelos: Claude pela família; o agente roda com a escolha só se o provedor a oferece', () => {
  assert.equal(knownTier('claude-haiku-5-5'), 'cheap');
  assert.equal(knownTier('claude-sonnet-5-5'), 'standard');
  assert.equal(knownTier('claude-opus-5-5'), 'premium');
  const claude = { model: 'anthropic/claude-haiku-5-5', anthropic: true };
  assert.equal(modelSpecFor(claude as never, 'claude-opus-5-5'), 'anthropic/claude-opus-5-5');
  assert.equal(modelSpecFor(claude as never, undefined), 'anthropic/claude-haiku-5-5');
  assert.equal(modelSpecFor(claude as never, 'yara-max'), 'anthropic/claude-haiku-5-5', 'escolha de outro provedor volta ao padrão');
  assert.equal(modelSpecFor(plugin as never, 'yara-max'), 'orbi-llm/yara-max');
});
