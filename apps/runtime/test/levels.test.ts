import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrainStore } from '../src/brain/store.ts';
import { decideAction, fingerprintWith, settleLevel, type LevelState } from '../src/brain/domain/levels.ts';
import { commandCategory, commandEffect, decide, parsePolicy } from '../src/autonomy/policy.ts';
import { withDefaults, inputProblems } from '../src/brain/domain/pipelines.ts';
import { shortCommand } from '../src/agents/tools/terminal.ts';

const pb = (name: string, steps: string[], autonomy: 'ask' | 'auto' = 'ask') => ({
  name, description: name, trigger: '', appliesTo: null, autonomy, instructions: '', learnedFrom: null, variationOf: null,
  steps: steps.map((label, i) => ({ id: `p${i}`, label, how: '' })),
});

test('git -C e cp: classificação de leitura, escrita e efeito', () => {
  assert.equal(commandCategory('git', ['-C', '/x/gitstars', 'status']), 'comandos-leitura');
  assert.equal(commandCategory('git', ['-C', '/x', 'pull', '--ff-only']), 'comandos-escrita');
  assert.equal(commandEffect('git', ['-C', '/x', 'pull']), 'local');
  assert.equal(commandEffect('git', ['-C', '/x', 'push', 'origin', 'main']), 'publica');
  assert.equal(commandEffect('git', ['push', '--force', 'origin', 'main']), 'apaga');
  assert.equal(commandEffect('git', ['push', 'origin', ':old']), 'apaga');
  assert.equal(commandEffect('gh', ['repo', 'delete', 'a/b', '--yes']), 'apaga');
  assert.equal(commandEffect('gh', ['api', 'repos/a/b/pages']), 'leitura');
  assert.equal(commandEffect('gh', ['pr', 'create']), 'publica');
  assert.equal(commandEffect('cp', ['a', 'b']), 'local');
  assert.equal(commandEffect('python3', ['-c', 'print(1)']), 'local');
});

test('dentro de um procedimento, leitura não pede mesmo no N1', () => {
  const p = parsePolicy({});
  const n1 = { autonomy: 'ask' as const, level: 1 as const, levelBy: 'learned' as const };
  assert.equal(decide(p, 'comandos-leitura', n1, { known: false, effect: 'leitura' }), 'auto');
  assert.equal(decide(p, 'comandos-leitura', { autonomy: 'ask' }), 'auto', 'mesmo sem nível');
  assert.equal(decide(p, 'comandos-escrita', n1, { known: true, effect: 'local' }), 'ask');
  assert.equal(decide(parsePolicy({ categories: { 'comandos-escrita': 'observe' } }), 'comandos-escrita', { ...n1, level: 3 }, { known: true, effect: 'local' }), 'observe', 'observar global vale');
  assert.equal(decide(p, 'comandos-escrita', { ...n1, autonomy: 'observe' }, { known: true, effect: 'local' }), 'observe');
});

test('níveis: o que roda sozinho em cada um', () => {
  const at = (level: 1 | 2 | 3, levelBy: 'promoted' | 'user' = 'promoted') => ({ level, levelBy });
  assert.equal(decideAction(at(1), { known: true, effect: 'local' }), 'ask');
  assert.equal(decideAction(at(2), { known: true, effect: 'local' }), 'auto');
  assert.equal(decideAction(at(2), { known: true, effect: 'publica' }), 'ask');
  assert.equal(decideAction(at(2), { known: false, effect: 'local' }), 'ask', 'ação nova pergunta');
  assert.equal(decideAction(at(3), { known: true, effect: 'publica' }), 'auto');
  assert.equal(decideAction(at(3), { known: false, effect: 'publica' }), 'ask', 'nova pergunta até no N3');
  assert.equal(decideAction(at(3), { known: true, effect: 'apaga' }), 'ask', 'apagar não sobe sozinho');
  assert.equal(decideAction(at(3, 'user'), { known: false, effect: 'publica' }), 'auto', 'N3 dado por você confia');
  assert.equal(decideAction(at(3, 'user'), { known: false, effect: 'apaga' }), 'ask');
  assert.equal(decideAction(at(3, 'user'), { known: true, effect: 'apaga' }), 'auto');
});

test('níveis: sobe com execução limpa, desce com falha ou negação, respeita o teto', () => {
  const s: LevelState = { level: 1, levelMax: 3, levelBy: 'learned', cleanStreak: 0 };
  const clean = { clean: true, denied: false, failed: false };
  const n2 = settleLevel(s, clean);
  assert.deepEqual([n2.state.level, n2.change?.to], [2, 2]);
  let st = n2.state;
  for (let i = 0; i < 2; i++) {
    const r = settleLevel(st, clean);
    assert.equal(r.change, null);
    st = r.state;
  }
  const n3 = settleLevel(st, clean);
  assert.equal(n3.state.level, 3);
  assert.equal(settleLevel(n3.state, { clean: false, denied: true, failed: false }).state.level, 2, 'negou: desce');
  assert.equal(settleLevel(n3.state, { clean: false, denied: false, failed: false }).state.level, 3, 'desvio sem falha: não conta, não desce');
  assert.equal(settleLevel({ ...s, levelMax: 1 }, clean).state.level, 1, 'teto N1');
});

test('impressão digital: o mesmo comando com outra versão é a mesma ação', () => {
  const a = fingerprintWith('run_command git -C /x tag v2.5.0', { versao: 'v2.5.0' });
  const b = fingerprintWith('run_command git -C /x tag v2.6.0', { versao: 'v2.6.0' });
  assert.equal(a, b);
  assert.equal(shortCommand('cp', ['/home/a/x/index.html', '/home/a/y'], '/home/a'), 'cp ~/x/index.html ~/y');
  assert.match(shortCommand("python3", ["-c", "x".repeat(200)], "/h"), /…$/);
});

test('cérebro: ações conhecidas, execução limpa sobe, falha registrada não conta', () => {
  const b = new BrainStore(':memory:');
  b.savePlaybook(pb('publicar', ['Copiar', 'Push']));
  assert.equal(b.playbook('publicar')!.level, 1);
  const run = b.startRun('publicar', 'c1', { destino: '/x/site' });
  const copy = { fingerprint: 'run_command cp a {{destino}}', tool: 'run_command', effect: 'local' as const, summary: 'Copiar', step: 'p0' };
  const push = { fingerprint: 'run_command git push origin main', tool: 'run_command', effect: 'publica' as const, summary: 'Publicar', step: 'p1' };
  b.recordRunAction(run.id, copy);
  b.recordRunAction(run.id, push);
  b.updateRunStep(run.id, 'p0', 'done');
  b.updateRunStep(run.id, 'p1', 'done');
  const settled = b.settleRun(run.id);
  assert.deepEqual(settled.change, { from: 1, to: 2, reason: 'rodou de ponta a ponta sem correção' });
  assert.deepEqual([settled.alone, settled.asks], [['Copiar'], ['Publicar']]);
  assert.equal(b.isKnownAction('publicar', copy.fingerprint), true);
  assert.equal(b.playbook('publicar')!.autonomy, 'ask', 'autonomia acompanha: N2 ainda pede');

  const second = b.startRun('publicar', 'c2');
  b.addRunDeviation(second.id, { kind: 'falha', detail: 'show_ui falhou', tool: 'show_ui', step: 'p0' });
  b.updateRunStep(second.id, 'p0', 'done');
  b.updateRunStep(second.id, 'p1', 'done');
  const r2 = b.settleRun(second.id);
  assert.equal(r2.change, null);
  assert.deepEqual(r2.deviations, ['show_ui falhou']);
  assert.equal(b.playbook('publicar')!.cleanStreak, 0);

  // Steps edited by learning: one level down. Level set by the developer: stays.
  b.editPlaybook('publicar', { steps: [{ id: 'p0', label: 'Copiar com python3', how: '' }, { id: 'p1', label: 'Push', how: '' }] });
  assert.equal(b.playbook('publicar')!.level, 1);
  b.setPlaybookLevel('publicar', { level: 3 });
  assert.deepEqual([b.playbook('publicar')!.levelBy, b.playbook('publicar')!.autonomy], ['user', 'auto']);
  b.editPlaybook('publicar', { steps: [{ id: 'p0', label: 'Copiar', how: '' }] });
  assert.equal(b.playbook('publicar')!.level, 3);
  b.setPlaybookLevel('publicar', { levelMax: 2 });
  assert.equal(b.playbook('publicar')!.level, 2, 'o teto puxa o nível');
  assert.deepEqual(b.autonomyEvents('playbook', 'publicar').map((e) => `${e.from}>${e.to}`), ['teto N3>teto N2', 'N3>N2', 'N1>N3', 'N2>N1', 'N1>N2']);
});

test('cérebro: autonomia auto continua valendo como N3 seu', () => {
  const b = new BrainStore(':memory:');
  b.savePlaybook(pb('confiavel', ['Fazer'], 'auto'));
  assert.deepEqual([b.playbook('confiavel')!.level, b.playbook('confiavel')!.levelBy], [3, 'user']);
  b.setPlaybookAutonomy('confiavel', 'ask');
  assert.equal(b.playbook('confiavel')!.level, 1);
});

test('esteira: padrão nas entradas e passagem que vira automática', () => {
  const b = new BrainStore(':memory:');
  b.savePlaybook(pb('gerar', ['Gerar']));
  b.savePlaybook(pb('publicar', ['Publicar']));
  assert.throws(() => b.savePipeline({ name: 'x', description: '', inputs: [{ name: 'tipo', description: '', options: ['a', 'b'], default: 'c' }], stages: [{ id: 'g', label: 'G', passage: 'auto', options: [{ playbook: 'gerar' }] }] }), /padrão de tipo/);
  const p = b.savePipeline({
    name: 'site', description: '',
    inputs: [{ name: 'destino', description: 'pasta', default: '~/site' }],
    stages: [
      { id: 'gerar', label: 'Gerar', passage: 'auto', options: [{ playbook: 'gerar' }] },
      { id: 'publicar', label: 'Publicar', passage: 'ask', options: [{ playbook: 'publicar' }] },
    ],
  });
  assert.deepEqual(withDefaults(p, {}), { destino: '~/site' });
  assert.deepEqual(inputProblems(p, withDefaults(p, {})), []);
  assert.equal(b.notePassage('site', 'publicar', true, null), null);
  assert.equal(b.notePassage('site', 'publicar', false, null), null, 'parar zera');
  b.notePassage('site', 'publicar', true, null);
  b.notePassage('site', 'publicar', true, null);
  assert.deepEqual(b.notePassage('site', 'publicar', true, 'c1'), { from: 'pergunta', to: 'segue', reason: 'você seguiu 3 vezes seguidas' });
  assert.equal(b.pipeline('site')!.stages[1].passage, 'auto');
  b.keepPassageAsking('site', 'publicar', null);
  assert.equal(b.pipeline('site')!.stages[1].passage, 'ask');
});
