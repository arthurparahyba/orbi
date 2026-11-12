import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEntity, mergeEntity, verdictLine } from '../src/brain/domain/fact-match.ts';
import type { Entity } from '../src/brain/domain/types.ts';

/** A proposed fact against the brain (docs/funcionalidades/22). */
const pagamentos: Entity = { id: 'pagamentos-api', type: 'Aplicacao', props: { repositorio: 'org/pagamentos-api', time: 'pag' }, body: '', aliases: ['pagamentos'], updatedAt: '' };
const brain = (type: string) => (type === 'Aplicacao' ? [pagamentos] : []);

test('fatos: acrescenta, muda, já sei e novo', () => {
  const add = classifyEntity({ id: 'pagamentos-api', type: 'Aplicacao', props: { banco: 'pag-db' } }, brain);
  assert.deepEqual(add, { kind: 'update', id: 'pagamentos-api', adds: { banco: 'pag-db' }, changes: [], aliases: [] });
  const change = classifyEntity({ id: 'pagamentos-api', type: 'Aplicacao', props: { repositorio: 'org/pagamentos-v2' } }, brain);
  assert.equal(change.kind, 'update');
  assert.match(verdictLine({ id: 'pagamentos-api', type: 'Aplicacao', props: {} }, change), /muda repositorio: org\/pagamentos-api → org\/pagamentos-v2/);
  assert.deepEqual(classifyEntity({ id: 'pagamentos-api', type: 'Aplicacao', props: { repositorio: 'org/pagamentos-api' } }, brain), { kind: 'known', id: 'pagamentos-api' });
  assert.deepEqual(classifyEntity({ id: 'checkout', type: 'Aplicacao', props: { repositorio: 'org/checkout' } }, brain), { kind: 'new' });
  assert.deepEqual(classifyEntity({ id: 'pagamentos-api', type: 'Banco', props: {} }, brain), { kind: 'new' }, 'outro conceito não é o mesmo');
});

test('fatos: o mesmo por outro nome, por apelido ou pelo mesmo valor', () => {
  const byAlias = classifyEntity({ id: 'Pagamentos', type: 'Aplicacao', props: { banco: 'pag-db' } }, brain);
  assert.deepEqual(byAlias.kind === 'same' && { id: byAlias.id, aliases: byAlias.aliases, adds: byAlias.adds }, { id: 'pagamentos-api', aliases: [], adds: { banco: 'pag-db' } }, 'o apelido já é dele: acrescenta, sem outro nome novo');
  const bySpelling = classifyEntity({ id: 'pagamentos_api', type: 'Aplicacao', props: { banco: 'pag-db' } }, brain);
  assert.equal(bySpelling.kind, 'same');
  const byValue = classifyEntity({ id: 'pay', type: 'Aplicacao', props: { repositorio: 'org/pagamentos-api', banco: 'pag-db' } }, brain);
  assert.deepEqual(byValue.kind === 'same' && { id: byValue.id, aliases: byValue.aliases, adds: byValue.adds }, { id: 'pagamentos-api', aliases: ['pay'], adds: { banco: 'pag-db' } });
  assert.match(verdictLine({ id: 'pay', type: 'Aplicacao', props: {} }, byValue), /pay é o mesmo que pagamentos-api \(repositorio = org\/pagamentos-api já é de pagamentos-api\)/);
});

test('fatos: outro nome sem nada novo é "já sei" do fato que existe (o brain_learn recusa o id novo)', async () => {
  const { sameFactProblems } = await import('../src/agents/tools/brain.ts');
  const v = classifyEntity({ id: 'pagamentos_api', type: 'Aplicacao', props: { time: 'pag' } }, brain);
  assert.deepEqual(v, { kind: 'known', id: 'pagamentos-api' });
  assert.match(sameFactProblems([{ kind: 'entity', payload: { id: 'pagamentos_api', type: 'Aplicacao', props: { time: 'pag' } } }] as never, brain)[0]!, /já está no cérebro como pagamentos-api/);
  assert.deepEqual(sameFactProblems([{ kind: 'entity', payload: { id: 'pagamentos-api', type: 'Aplicacao', props: { banco: 'x' } } }] as never, brain), [], 'o mesmo id acrescenta normalmente');
});

test('fatos: aprender acrescenta, não apaga o que o fato tinha', () => {
  const merged = mergeEntity(pagamentos, { id: 'pagamentos-api', type: 'Aplicacao', props: { banco: 'pag-db' }, body: '', aliases: ['pay'] });
  assert.deepEqual(merged.props, { repositorio: 'org/pagamentos-api', time: 'pag', banco: 'pag-db' });
  assert.deepEqual(merged.aliases, ['pagamentos', 'pay']);
  assert.deepEqual(mergeEntity(undefined, { id: 'x', type: 'T', props: { a: 1 }, body: '' }).props, { a: 1 });
});
