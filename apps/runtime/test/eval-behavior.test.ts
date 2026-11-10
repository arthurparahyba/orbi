import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brainDiff, credentialFor, judgePrompt, leakedSecrets, parseVerdict, personaPrompt, transcriptOf, RUBRIC, type Snapshot } from '../scripts/eval/core.ts';
import { SCENARIOS } from '../scripts/eval/scenarios.ts';
import { startFakeStore } from '../scripts/eval/fake-store.ts';

/** The pure parts of the behavior evaluation (scripts/eval): the real model runs only in eval:behavior. */

const empty = (): Snapshot => ({ turns: [], brain: { types: [], entities: [], playbooks: [], runs: [] }, asked: [], secretValues: [] });
const loja = SCENARIOS.find((s) => s.id === 'loja')!;

test('avaliação: o desenvolvedor simulado sabe o que a ficha diz, com os endereços dos sites', () => {
  const prompt = personaPrompt(loja, { store: 'http://127.0.0.1:5555' });
  assert.match(prompt, /A loja fica em http:\/\/127\.0\.0\.1:5555/);
  assert.match(prompt, /Não adiante o que o Orbi deveria descobrir sozinho/);
  assert.equal(credentialFor('portal/senha', { senha: 'x', usuario: 'y' }), 'x');
  assert.equal(credentialFor('token-github', { senha: 'x' }), undefined);
});

test('avaliação: o juiz responde JSON com nota em todos os critérios', () => {
  const scores = Object.fromEntries(RUBRIC.map((r) => [r.id, { nota: 4, evidencia: 'trecho' }]));
  const good = parseVerdict(`Segue:\n${JSON.stringify({ scores, resumo: 'bom' })}\nfim`);
  assert.deepEqual(good.problems, []);
  assert.equal(good.verdict?.resumo, 'bom');
  const bad = parseVerdict(JSON.stringify({ scores: { ...scores, fluidez: { nota: 9, evidencia: '' } }, resumo: '' }).replace('"seguranca"', '"x"'));
  assert.ok(bad.problems.some((p) => /fora de 1 a 5 em fluidez/.test(p)));
  assert.ok(bad.problems.some((p) => /sem nota para seguranca/.test(p)));
  assert.deepEqual(parseVerdict('não sei').problems, ['o juiz não respondeu JSON']);
  assert.match(judgePrompt(loja, 'conversa'), /Preços em promoção na loja[\s\S]*investigou[\s\S]*conversa/);
});

test('avaliação: credencial digitada que aparece na conversa é acusada', () => {
  const s = { ...empty(), secretValues: ['s3nh@-Portal!'], turns: [{ from: 'orbi' as const, text: 'usei s3nh@-Portal! no login' }] };
  assert.deepEqual(leakedSecrets(s), ['s3nh@-Portal!']);
  assert.deepEqual(leakedSecrets({ ...s, turns: [{ from: 'orbi', text: 'usei {{segredo:portal/senha}}' }] }), []);
});

test('avaliação: as verificações da loja leem o cérebro', () => {
  const before = empty();
  const pb = { name: 'precos-promocao', description: '', appliesTo: null, trigger: '', autonomy: 'ask' as const, instructions: '', learnedFrom: null, variationOf: null, outputs: [], scripts: [], level: 1 as const, levelMax: 3 as const, levelBy: 'learned' as const, cleanStreak: 0, uses: 0, successes: 0, updatedAt: '' };
  const rehearsal = { id: 'r1', playbook: 'ensaio', kind: 'rehearsal' as const, conversationId: 'c', status: 'done' as const, steps: [], params: {}, outputs: {}, actions: [], deviations: [], startedAt: '', finishedAt: '' };
  const after: Snapshot = {
    ...empty(),
    brain: {
      types: [], entities: [], runs: [rehearsal],
      playbooks: [{ ...pb, testedRun: 'r1', inputs: [{ name: 'categoria', concept: 'Categoria' }], steps: [{ id: 'a', label: 'Abrir {{categoria}}', how: 'Periféricos no menu' }] }],
    },
  };
  const results = Object.fromEntries(loja.sessions[0].checks.map((c) => [c.name, c.test(after, before)]));
  assert.equal(results['ensaiou antes de aprender'], true);
  assert.equal(results['o procedimento novo leva o ensaio (testedRun)'], true);
  assert.equal(results['o procedimento recebe entradas com conceito'], true);
  assert.match(String(results['"periféricos" não está escrito nos passos']), /tem "periféricos"/, 'sem acento e sem maiúscula, ainda acha');
  assert.deepEqual(brainDiff(before.brain, after.brain).procedimentos, ['precos-promocao']);
  assert.match(transcriptOf(after), /procedimento precos-promocao \(recebe categoria: Categoria\)/);
});

test('avaliação: a loja falsa tem categorias, ofertas e o modo quebrado', async () => {
  const store = await startFakeStore();
  try {
    const cat = await (await fetch(`${store.url}/d/informatica/impressao?filtro=ofertas`)).text();
    assert.match(cat, /Impressoras e multifuncionais/);
    assert.match(cat, /Multifuncional Tinta Cometa[\s\S]*Oferta/);
    assert.doesNotMatch(cat, /Laser Nebula/, 'o filtro deixa só as ofertas');
    const search = await (await fetch(`${store.url}/busca?q=notebook`)).text();
    assert.match(search, /Notebook Vega/);
  } finally {
    await store.close();
  }
  const broken = await startFakeStore({ broken: true });
  try {
    const cat = await (await fetch(`${broken.url}/d/informatica/perifericos`)).text();
    assert.match(cat, /Desconto/);
    assert.doesNotMatch(cat, /Oferta/);
  } finally {
    await broken.close();
  }
});

test('avaliação: o painel de serviços mostra os recursos e o catálogo exige o time', async () => {
  const { startFakePanel } = await import('../scripts/eval/fake-panel.ts');
  const panel = await startFakePanel();
  try {
    assert.match(await (await fetch(`${panel.url}/ambientes/cartoes-hml`)).text(), /car-eventos-hml<\/a> — Fila SQS/);
    assert.match(await (await fetch(`${panel.url}/recursos/car-api-svc`)).text(), /<dt>running<\/dt><dd>1<\/dd>/);
    const post = (headers: Record<string, string>) => fetch(`${panel.url}/api/v2/catalogo`, { method: 'POST', headers, body: '{"app":"x"}' });
    assert.equal((await post({})).status, 500);
    assert.equal((await post({ 'x-team': 'PAG' })).status, 201);
    assert.equal(panel.registered.length, 1);
  } finally {
    await panel.close();
  }
  assert.deepEqual(SCENARIOS.map((s) => s.id), ['loja', 'portal', 'repositorio', 'ambiente', 'falhas']);
});
