import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, knowledge, procedures, vault } from './support/flow.ts';

/**
 * Importar um procedimento que chegou de outra pessoa (documento 30). O pacote é a única entrada
 * do Orbi que não foi escrita aqui nem pelo modelo: vem de um arquivo. Estes testes guardam as
 * três recusas que fazem isso ser seguro — não vai em cima do que já existe, não toca no que esta
 * máquina já sabe, e entra em N1 por mais que o arquivo diga o contrário.
 */

const pack = (over: Record<string, unknown> = {}, procedure: Record<string, unknown> = {}) => ({
  orbi: 1,
  exportedAt: '2026-11-18T12:00:00.000Z',
  procedure: {
    name: 'publicar-no-portal-vindo-de-fora',
    description: 'publica uma versão do portal',
    trigger: 'quando pedirem para publicar',
    appliesTo: null,
    instructions: 'Entre com {{segredo:portal/senha}} e confirme.',
    steps: [{ id: 'subir', label: 'Subir o build em {{ambiente}}', how: 'run_script subir.py' }],
    outputs: [{ name: 'url', description: 'o endereço publicado' }],
    scripts: [{ name: 'subir.py', description: 'sobe o build', code: 'print("oi")', effect: 'publica' }],
    inputs: [{ name: 'ambiente', concept: 'AmbienteDeFora' }],
    domain: 'aws',
    ...procedure,
  },
  types: [{ name: 'AmbienteDeFora', description: 'um ambiente do portal', props: { conta: 'o número da conta' } }],
  secrets: ['portal/senha'],
  facts: [],
  links: [],
  learnings: [],
  ...over,
});

const post = (path: string, data: unknown) =>
  app.request(`/api/brain/procedures/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

test('a caixinha diz o que é, os números, e o que vai entrar — sem aplicar nada', async () => {
  const seen = (await (await post('package', pack())).json()) as any;

  assert.equal(seen.name, 'publicar-no-portal-vindo-de-fora');
  assert.equal(seen.domain, 'aws');
  assert.deepEqual(seen.counts, { steps: 1, inputs: 1, outputs: 1, scripts: 1 });
  assert.deepEqual(seen.newTypes, ['AmbienteDeFora'], 'o conceito ainda não existe aqui');
  assert.deepEqual(seen.secretsToAsk, ['portal/senha'], 'o segredo que o Orbi vai pedir quando rodar');
  assert.equal(procedures.definition.playbook(seen.name), undefined, 'ler não aplica');
  assert.equal(knowledge.type('AmbienteDeFora'), undefined, 'ler não cria conceito');
});

test('aplicar cria o procedimento e o conceito, e ele entra em N1', async () => {
  const seen = (await (await post('import', pack())).json()) as any;

  const saved = procedures.definition.playbook(seen.name)!;
  assert.equal(saved.steps.length, 1);
  assert.equal(saved.scripts[0]!.code, 'print("oi")');
  assert.equal(saved.level, 1, 'autonomia é uma pessoa dando permissão ao Orbi dela: entra em N1');
  assert.equal(saved.autonomy, 'ask');
  assert.equal(saved.uses, 0, 'sem histórico: as execuções eram de outra máquina');
  assert.equal(saved.learnedFrom, 'pacote:2026-11-18T12:00:00.000Z', 'fica registrado que ele veio de fora');
  assert.equal(knowledge.type('AmbienteDeFora')?.description, 'um ambiente do portal');
});

test('um pacote mexido à mão para chegar com autonomia é recusado, não limpado em silêncio', async () => {
  const answer = await post('import', pack({}, { name: 'quer-autonomia-de-graca', autonomy: 'auto' }));

  assert.equal(answer.status, 400);
  assert.match(((await answer.json()) as any).error.message, /autonomy/, 'o campo a mais aparece na recusa: a pessoa precisa saber que o arquivo foi mexido');
  assert.equal(procedures.definition.playbook('quer-autonomia-de-graca'), undefined);
});

test('não vai em cima de um procedimento que já existe aqui', async () => {
  await post('import', pack({}, { name: 'ja-existe-aqui' }));
  const again = await post('import', pack({}, { name: 'ja-existe-aqui', description: 'outra coisa' }));

  assert.equal(again.status, 409);
  assert.equal(procedures.definition.playbook('ja-existe-aqui')!.description, 'publica uma versão do portal', 'o daqui ficou como estava');
});

test('conceito que esta máquina já tem não é tocado, e o segredo que você já tem não é pedido de novo', async () => {
  knowledge.upsertType({ name: 'AmbienteMeu', description: 'o meu ambiente, do jeito que eu descrevi' });
  await vault.set('portal/senha-minha', 'nao-vaza');

  const seen = (await (await post('import', pack({
    types: [{ name: 'AmbienteMeu', description: 'a descrição de quem mandou' }],
    secrets: ['portal/senha-minha', 'portal/outra'],
  }, { name: 'respeita-o-que-e-meu', inputs: [{ name: 'ambiente', concept: 'AmbienteMeu' }] }))).json()) as any;

  assert.deepEqual(seen.keptTypes, ['AmbienteMeu']);
  assert.deepEqual(seen.newTypes, []);
  assert.equal(knowledge.type('AmbienteMeu')!.description, 'o meu ambiente, do jeito que eu descrevi', 'a descrição de quem mandou não manda na minha');
  assert.deepEqual(seen.secretsHeld, ['portal/senha-minha']);
  assert.deepEqual(seen.secretsToAsk, ['portal/outra']);
});

test('um fato só entra se vier no pacote, e não pisa no fato que já existe aqui', async () => {
  knowledge.upsertType({ name: 'AmbienteFato', description: 'ambiente' });
  knowledge.upsertEntity({ id: 'conta-prod-local', type: 'AmbienteFato', props: { conta: 'o-meu-valor' }, body: '' });

  const seen = (await (await post('import', pack({
    types: [{ name: 'AmbienteFato', description: 'ambiente' }],
    facts: [
      { id: 'conta-prod-local', type: 'AmbienteFato', props: { conta: 'o-valor-de-quem-mandou' } },
      { id: 'conta-hom-de-fora', type: 'AmbienteFato', props: { conta: '9988' } },
    ],
  }, { name: 'traz-fatos', inputs: [{ name: 'ambiente', concept: 'AmbienteFato' }] }))).json()) as any;

  assert.deepEqual(seen.newFacts, ['conta-hom-de-fora']);
  assert.deepEqual(seen.keptFacts, ['conta-prod-local']);
  assert.equal(knowledge.get('conta-prod-local')!.props.conta, 'o-meu-valor', 'o fato daqui é o que vale aqui');
  assert.equal(knowledge.get('conta-hom-de-fora')!.props.conta, '9988');
});

test('o que sai de uma máquina entra na outra: ida e volta pelo arquivo', async () => {
  await post('import', pack({}, { name: 'ida-e-volta-origem' }));
  const exported = await app.request('/api/brain/playbooks/ida-e-volta-origem/share', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  const { package: out } = (await exported.json()) as any;

  // Mesmo banco, então o nome muda: é o que faria a outra máquina, onde o nome está livre.
  const answer = await post('import', { ...out, procedure: { ...out.procedure, name: 'ida-e-volta-chegada' } });

  assert.equal(answer.status, 200, `o pacote gerado aqui tem de entrar sem remendo: ${await answer.text()}`);
  const there = procedures.definition.playbook('ida-e-volta-chegada')!;
  const here = procedures.definition.playbook('ida-e-volta-origem')!;
  assert.deepEqual(there.steps, here.steps, 'os passos chegaram iguais');
  assert.deepEqual(there.scripts, here.scripts, 'e os scripts também');
  assert.equal(there.level, 1, 'mas a autonomia não viajou');
});
