import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { app, knowledge, procedures, trust } from './support/flow.ts';
import { LEFT_BEHIND, SHARED_FIELDS } from '../src/contexts/procedures/index.ts';
import type { Playbook } from '../src/language/index.ts';

/**
 * Exportar um procedimento (documento 30). O corte é um só — vocabulário viaja, dados não — e é
 * ele que estes testes guardam, pelos dois lados: o que tem de ir, e o que não pode ir de jeito
 * nenhum. O terceiro teste é a trava: um campo novo no `Playbook` não escolhe sozinho de que lado
 * fica.
 */

const NAME = 'publicar-no-portal-exportavel';

function given(): void {
  knowledge.upsertType({ name: 'AmbienteExp', description: 'um ambiente do portal', relations: {}, requires: [], props: { conta: 'o número da conta' } });
  knowledge.upsertEntity({ id: 'ambiente-producao-exp', type: 'AmbienteExp', props: { conta: '4455-1122-8890' }, body: '' });
  procedures.definition.savePlaybook({
    name: NAME, description: 'publica uma versão do portal', appliesTo: null,
    trigger: 'quando pedirem para publicar', autonomy: 'ask', learnedFrom: 'chat:ensinei-aqui',
    instructions: 'Entre com {{segredo:portal/senha}} e confirme.',
    inputs: [{ name: 'ambiente', concept: 'AmbienteExp' }],
    outputs: [{ name: 'url', description: 'o endereço publicado' }],
    scripts: [{ name: 'subir_build.py', description: 'sobe o build', code: 'print("oi")', effect: 'publica' }],
    steps: [{ id: 'subir', label: 'Subir o build em {{ambiente}}', how: 'run_script subir_build.py' }],
  } as never);
  trust.setPlaybookLevel(NAME, { level: 3 });
}

const share = (body: unknown) =>
  app.request(`/api/brain/playbooks/${NAME}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('o pacote leva o procedimento, os conceitos que ele cita e só o nome do segredo', async () => {
  given();
  const { package: pack } = (await (await share({})).json()) as any;

  assert.equal(pack.procedure.name, NAME);
  assert.equal(pack.procedure.steps.length, 1, 'os passos viajam');
  assert.equal(pack.procedure.scripts[0].code, 'print("oi")', 'o código do script viaja: é o que vai rodar lá');
  assert.deepEqual(pack.types.map((t: { name: string }) => t.name), ['AmbienteExp'], 'o conceito citado pela entrada viaja: sem a palavra, {{ambiente}} não quer dizer nada');
  assert.deepEqual(pack.secrets, ['portal/senha'], 'o nome do segredo viaja');
  assert.deepEqual(pack.facts, [], 'nenhum fato vai sem alguém escolher: esse é o padrão, não um conselho');
});

test('o pacote vira arquivo, com o nome que a pessoa vai mandar', async () => {
  given();
  const written = (await (await share({})).json()) as any;

  assert.match(written.file, new RegExp(`${NAME}\\.orbi\\.json$`), 'o arquivo tem o nome do procedimento');
  assert.ok(written.bytes > 0, 'e tem conteúdo');
  const saved = JSON.parse(readFileSync(written.file, 'utf8'));
  assert.equal(saved.procedure.name, NAME, 'o que está em disco é o pacote, legível, para a pessoa abrir e ler antes de mandar');
  assert.equal(saved.orbi, 1, 'com a versão do formato: quem importa recusa o que não souber ler');
});

test('o que é desta máquina não vai, nem o valor de um segredo', async () => {
  given();
  const text = await (await share({})).text();

  for (const { field } of LEFT_BEHIND) {
    assert.ok(!Object.hasOwn(JSON.parse(text).package.procedure, field), `${field} não devia viajar: ${LEFT_BEHIND.find((l) => l.field === field)!.why}`);
  }
  assert.doesNotMatch(text, /chat:ensinei-aqui/, 'a conversa em que ele foi ensinado fica aqui');
  assert.doesNotMatch(text, /"level"/, 'o nível não viaja: entra em N1 na máquina de quem recebe');
});

test('um fato só vai se alguém marcar, e vai com a procedência, sem o "conferido em" desta máquina', async () => {
  given();
  const { package: pack } = (await (await share({ facts: ['ambiente-producao-exp'] })).json()) as any;

  assert.deepEqual(pack.facts.map((f: { id: string }) => f.id), ['ambiente-producao-exp']);
  assert.equal(pack.facts[0].props.conta, '4455-1122-8890', 'o valor vai, porque foi escolhido com ele à vista');
  assert.ok(!Object.hasOwn(pack.facts[0], 'checkedAt'), 'conferido aqui não diz nada lá');
});

test('a tela de exportar diz o que fica, com o porquê, e oferece os fatos com o que cada um revela', async () => {
  given();
  const seen = (await (await app.request(`/api/brain/playbooks/${NAME}/share`)).json()) as any;

  assert.deepEqual(seen.counts, { steps: 1, scripts: 1, inputs: 1, outputs: 1 });
  assert.ok(seen.leftBehind.some((l: { field: string }) => l.field === 'level'), 'o nível aparece na lista do que fica');
  assert.ok(seen.leftBehind.every((l: { why: string }) => l.why.length > 10), 'cada um com o porquê escrito');
  const offered = seen.facts.find((f: { id: string }) => f.id === 'ambiente-producao-exp');
  assert.match(offered.reveals, /4455-1122-8890/, 'o que o fato revela aparece antes da escolha, não depois');
});

test('todo campo do procedimento está de um lado ou do outro: um campo novo não escolhe sozinho', () => {
  given();
  const saved = procedures.definition.playbook(NAME)!;
  // Os campos opcionais que este procedimento não usa entram na conta pelo tipo, não pelo objeto.
  const optional: Array<keyof Playbook> = ['domain', 'intent', 'inputs', 'testedRun'];
  const decided = new Set<string>([...SHARED_FIELDS, ...LEFT_BEHIND.map((l) => l.field), ...optional]);
  const undecided = [...new Set([...Object.keys(saved), ...optional])].filter((field) => !decided.has(field));

  assert.deepEqual(undecided, [], 'campo do Playbook que ninguém decidiu se viaja: ponha em SHARED_FIELDS ou em LEFT_BEHIND, com o porquê');
});
