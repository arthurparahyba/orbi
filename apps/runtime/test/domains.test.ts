/**
 * Domínios: o assunto em que cada coisa foi aprendida (documento 28). Aqui estão as duas coisas
 * que não dá para conferir lendo o código: a cadeia que decide o domínio de um aprendizado, e o
 * que conta como ponte entre domínios.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/database.ts';
import { DomainRepo, Domains, Facts, factsForRun, howToRefresh, suggestDomain } from '../src/contexts/knowledge/index.ts';
import { PlaybookRepo } from '../src/contexts/procedures/index.ts';
import { GraphRepo, OntologyRepo } from '../src/contexts/knowledge/index.ts';
import type { Entity } from '../src/language/index.ts';
import { foundInOf } from '../src/contexts/telemetry/index.ts';
import { ToolOutcomes } from '../src/contexts/telemetry/index.ts';

const fresh = () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'orbi-dom-')), 'orbi.db'));
  const graph = new GraphRepo(db);
  const ontology = new OntologyRepo(db);
  const domains = new Domains(db, { countByDomain: () => new Map(), inDomain: () => [], rename: () => {} });
  const type = (name: string, domain: string | null = null) =>
    ontology.upsert({ name, description: name, relations: {}, requires: [], domain });
  const fact = (id: string, typeName: string, domain: string | null) =>
    graph.upsertEntity({ id, type: typeName, props: {}, body: '', domain });
  return { db, graph, ontology, domains, type, fact };
};

const entity = (id: string, domain: string | null): Entity => ({ id, type: 'X', props: {}, body: '', domain, updatedAt: '' });

test('o tipo ganha da execução: um fato de tipo de outro domínio não é do domínio de quem o achou', () => {
  const { domains, type } = fresh();
  domains.create({ name: 'aws' });
  domains.create({ name: 'comum-ish' });
  type('Maquina', 'comum-ish');

  const s = suggestDomain({ domains }, { type: 'Maquina', runDomain: 'aws' });
  assert.equal(s.domain, 'comum-ish');
  assert.match(s.because, /tipo Maquina/);
});

test('tipo espalhado por dois domínios é comum, mesmo rodando dentro de um deles', () => {
  const { domains, type, fact } = fresh();
  domains.create({ name: 'aws' });
  domains.create({ name: 'front-end' });
  type('Ambiente');
  fact('ambiente-prod', 'Ambiente', 'aws');
  fact('ambiente-dev', 'Ambiente', 'front-end');

  const s = suggestDomain({ domains }, { type: 'Ambiente', runDomain: 'aws' });
  assert.equal(s.domain, null, 'espalhado por dois domínios: é de todos, ou seja, comum');
  assert.match(s.because, /2 domínios/);
});

test('sem tipo decidindo, o domínio é o da execução', () => {
  const { domains, type } = fresh();
  domains.create({ name: 'aws' });
  type('Stack');

  const s = suggestDomain({ domains }, { type: 'Stack', runDomain: 'aws' });
  assert.equal(s.domain, 'aws');
  assert.match(s.because, /execução/);
});

test('sem execução, o domínio é o que a conversa mais olhou — e empate não decide', () => {
  const { domains } = fresh();
  const dois = suggestDomain({ domains }, { nearby: [entity('a', 'aws'), entity('b', 'aws'), entity('c', 'front-end')] });
  assert.equal(dois.domain, 'aws');

  const empate = suggestDomain({ domains }, { nearby: [entity('a', 'aws'), entity('b', 'front-end')] });
  assert.equal(empate.domain, null, 'empate cai na regra seguinte, não escolhe por ordem alfabética');
});

test('nada aponta para domínio existente: propõe criar, e o nome proposto não pode já existir', () => {
  const { domains } = fresh();
  const novo = suggestDomain({ domains }, { proposed: 'servicenow' });
  assert.equal(novo.domain, 'servicenow');
  assert.equal(novo.isNew, true);

  domains.create({ name: 'servicenow' });
  const jaExiste = suggestDomain({ domains }, { proposed: 'servicenow' });
  assert.equal(jaExiste.isNew, undefined);
  assert.equal(jaExiste.domain, null);
});

test('ponte é entre dois domínios: relação com comum não é ponte', () => {
  const { domains, graph, type, fact } = fresh();
  domains.create({ name: 'aws' });
  domains.create({ name: 'servicenow' });
  type('Conta');
  fact('conta-aws-prod', 'Conta', 'aws');
  fact('gmud-123', 'Conta', 'servicenow');
  fact('arthur', 'Conta', null);
  graph.insertEdge({ from: 'gmud-123', rel: 'usa', to: 'conta-aws-prod', attrs: {}, validFrom: '2026-01-01', validTo: null });
  graph.insertEdge({ from: 'gmud-123', rel: 'pedidoPor', to: 'arthur', attrs: {}, validFrom: '2026-01-01', validTo: null });

  const bridges = domains.bridges();
  assert.equal(bridges.length, 1, 'só a que atravessa dois domínios de verdade');
  assert.deepEqual(
    { from: bridges[0]!.from, to: bridges[0]!.to },
    { from: 'gmud-123', to: 'conta-aws-prod' },
  );
  assert.equal(domains.bridgesOf('aws').length, 1);
  assert.equal(domains.bridgesOf(null).length, 0, 'comum não tem ponte: já está no alcance de todos');
});

test('apagar um domínio devolve o que era dele para comum, sem apagar conhecimento', () => {
  const { domains, graph, type, fact } = fresh();
  domains.create({ name: 'cozinha' });
  type('Receita', 'cozinha');
  fact('bolo-de-cenoura', 'Receita', 'cozinha');

  domains.remove('cozinha');
  assert.equal(domains.get('cozinha'), undefined);
  assert.ok(graph.entity('bolo-de-cenoura'), 'o fato continua lá');
  assert.equal(graph.entity('bolo-de-cenoura')?.domain, null, 'e virou comum');
  assert.deepEqual(domains.typesIn(null), ['Receita']);
});

test('procedência: a chamada que produziu o dado diz de onde ele é (documento 28, fase C)', () => {
  const at = '2026-11-16T18:00:00.000Z';

  const comando = foundInOf('run_command', { binary: 'aws', args: ['sts', 'get-caller-identity', '--profile', 'dev'] }, at);
  assert.deepEqual(comando, { kind: 'cli', ref: 'aws sts get-caller-identity --profile dev', at });

  const pagina = foundInOf('browser_read', { tool: 'navigate_page', args: { url: 'https://wiki.empresa.com/gmud' } }, at);
  assert.deepEqual(pagina, { kind: 'page', ref: 'https://wiki.empresa.com/gmud', at });

  assert.equal(foundInOf('browser_read', { tool: 'take_snapshot' }, at), undefined, 'foto da página aberta não traz endereço: vale a procedência anterior');
  assert.equal(foundInOf('playbooks', {}, at), undefined, 'pedir a lista de playbooks não traz informação do mundo');
  assert.equal(foundInOf('ask_secret', { name: 'senha-portal' }, at), undefined, 'nem o nome de um segredo vira rastro');
});

test('o último de onde vale até outra chamada trazer informação nova', () => {
  const outcomes = new ToolOutcomes();
  outcomes.foundIn('c1', foundInOf('browser_read', { tool: 'navigate_page', args: { url: 'https://wiki.empresa.com/gmud' } }, '2026-11-16T18:00:00.000Z'));
  outcomes.foundIn('c1', foundInOf('browser_read', { tool: 'take_snapshot' }, '2026-11-16T18:00:05.000Z'));

  assert.equal(outcomes.lastFoundIn('c1')?.ref, 'https://wiki.empresa.com/gmud', 'a foto é daquela página mesmo');
  assert.equal(outcomes.lastFoundIn('c2'), undefined, 'cada conversa tem a sua');

  outcomes.foundIn('c1', foundInOf('run_command', { binary: 'aws', args: ['ecs', 'list-clusters'] }, '2026-11-16T18:01:00.000Z'));
  assert.equal(outcomes.lastFoundIn('c1')?.kind, 'cli');
});

test('receita de atualização: como conferir um fato na fonte (documento 28, fase D)', () => {
  const { db, domains, ontology, graph, type, fact } = fresh();
  const playbooks = new PlaybookRepo(db);
  const d = {
    knowledge: new Facts(db, ontology, graph),
    procedures: { definition: { playbook: (n: string) => playbooks.get(n) } },
  } as never;

  type('Conta');
  fact('conta-dev', 'Conta', null);

  const semReceita = howToRefresh(d, 'conta-dev');
  assert.deepEqual('refused' in semReceita && semReceita.refused, 'tipo-sem-receita');
  const semFato = howToRefresh(d, 'nao-existe');
  assert.equal('refused' in semFato && semFato.refused, 'fato-nao-existe');

  // A receita aponta para um procedimento que ainda não existe: isto tem de ser dito, não calado.
  ontology.upsert({ name: 'Conta', description: 'conta', relations: {}, requires: [], refresh: 'atualizar-conta' });
  const quebrada = howToRefresh(d, 'conta-dev');
  assert.equal('refused' in quebrada && quebrada.refused, 'receita-nao-existe');
  assert.match('refused' in quebrada ? quebrada.detail : '', /não existe mais/);

  playbooks.save({
    name: 'atualizar-conta', description: 'confere o número da conta', appliesTo: null, trigger: '',
    autonomy: 'ask', steps: [{ id: 'ver', label: 'Ver', how: 'aws sts get-caller-identity' }], instructions: '', learnedFrom: null,
  } as never);

  const pronta = howToRefresh(d, 'conta-dev');
  assert.deepEqual(pronta, { playbook: 'atualizar-conta', fact: 'conta-dev', type: 'Conta', checkedAt: null, foundIn: null });
  assert.equal(domains.list().length, 0, 'receita não cria domínio nenhum');
});

test('alcance: o domínio, comum, e só o que ele mesmo pegou emprestado (documento 28, fase B)', () => {
  const { db, domains, type, fact, graph } = fresh();
  const repo = new DomainRepo(db);
  for (const name of ['aws', 'servicenow', 'cozinha']) domains.create({ name });
  type('Conta');
  fact('conta-aws', 'Conta', 'aws');
  fact('gmud-1', 'Conta', 'servicenow');
  fact('receita-bolo', 'Conta', 'cozinha');
  // O fato do servicenow aponta para o da aws: foi o servicenow que pegou emprestado.
  graph.insertEdge({ from: 'gmud-1', rel: 'usa', to: 'conta-aws', attrs: {}, validFrom: '2026-01-01', validTo: null });

  assert.deepEqual(repo.reach('servicenow').sort(), ['aws', 'servicenow', null].sort(), 'quem pegou emprestado alcança');
  assert.deepEqual(repo.reach('aws').sort(), ['aws', null].sort(), 'quem emprestou não ganha acesso ao vizinho');
  assert.deepEqual(repo.reach('cozinha').sort(), ['cozinha', null].sort(), 'sem ponte, só ele e comum');
  assert.deepEqual(repo.reach(null), [null], 'quem não é de assunto nenhum não enxerga assunto nenhum');
});

test('o passo 0 deixa de resolver em silêncio para o fato de outro assunto', () => {
  const { db, domains, ontology, graph, type, fact } = fresh();
  for (const name of ['aws', 'cozinha']) domains.create({ name });
  type('Ambiente');
  // O mesmo nome em dois assuntos: antes dos domínios, um deles casava sozinho.
  fact('producao', 'Ambiente', 'cozinha');
  const port = factsForRun(ontology, graph, new DomainRepo(db));

  assert.deepEqual(port.named('Ambiente', 'producao').map((e) => e.id), ['producao'], 'sem alcance, acha — era o comportamento antigo');
  assert.deepEqual(port.named('Ambiente', 'producao', 'aws'), [], 'no alcance da aws, o fato da cozinha não existe');

  fact('producao-aws', 'Ambiente', 'aws');
  graph.upsertEntity({ id: 'producao-aws', type: 'Ambiente', props: {}, body: '', domain: 'aws', aliases: ['producao'] });
  assert.deepEqual(port.named('Ambiente', 'producao', 'aws').map((e) => e.id), ['producao-aws'], 'e o da aws, sim, inclusive por outro nome');
  assert.deepEqual(port.named('Ambiente', 'producao', null).map((e) => e.id), [], 'comum não enxerga nenhum dos dois');
});
