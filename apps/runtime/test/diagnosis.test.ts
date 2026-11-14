import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsLine, detect, type Seen } from '../src/diagnosis/index.ts';

/** O que não é do procedimento (docs/funcionalidades/24): defeito do Orbi ou chamada errada do modelo. */
const run = {
  id: 'r1', playbook: 'promo', deviations: [],
  steps: [{ id: 'abrir', label: 'Abrir', how: 'abrir o site com browser_act', status: 'done' }, { id: 'extrair', label: 'Extrair', how: 'rodar run_script extrai.py', status: 'done' }],
} as Seen['run'];
const playbook = { steps: [{ id: 'abrir', label: 'Abrir', how: 'abrir o site com browser_act' }, { id: 'extrair', label: 'Extrair', how: 'rodar run_script extrai.py' }] } as Seen['playbook'];
const call = (over: Record<string, unknown>) => ({ id: 'c', runId: 'r1', conversationId: 'x', step: 'extrair', tool: 'browser_act', summary: '', status: 'ok', approval: null, error: '', durationMs: 1, chars: 0, marks: [], at: '2026-11-14T21:00:00Z', ...over }) as never;

test('do Orbi: arquivo gravado cortado e aprovação recusada depois', () => {
  const found = detect({
    run,
    playbook,
    calls: [
      call({ step: 'abrir' }),
      call({ marks: ['cortado', 'caro'], summary: 'evaluate_script · saveTo=promo.json', chars: 30_000 }),
      call({ tool: 'run_command', marks: ['recusado-depois'], summary: 'head', error: 'head não está entre os comandos permitidos' }),
      call({ marks: ['cortado'], summary: 'take_snapshot' }),
    ],
  });
  assert.deepEqual(found.map((f) => [f.detector, f.category]), [['arquivo-cortado', 'orbi'], ['recusado-depois', 'orbi']], 'resposta cortada que não vai para arquivo não é defeito');
  assert.match(found[0]!.detail, /gravou um arquivo .*saveTo=promo\.json.* 30000 caracteres/);
  assert.match(found[0]!.hint!, /chrome-devtools\.ts/);
  assert.match(found[1]!.title, /você aprovou e o Orbi recusou depois/);
  assert.equal(countsLine(found), '2 problemas do Orbi');
});

test('do modelo: chamada errada (agrupada por ferramenta) e passo fechado fora de ordem', () => {
  const found = detect({
    run,
    playbook,
    calls: [
      call({ step: 'abrir' }),
      call({ marks: ['chamada'], status: 'erro', error: 'Validation failed for tool "show_ui": component required', tool: 'show_ui' }),
      call({ marks: ['chamada'], status: 'erro', error: 'Validation failed for tool "show_ui": component required', tool: 'show_ui' }),
      call({ tool: 'playbook_step', status: 'erro', error: 'feche extrair antes de html' }),
      call({ tool: 'run_script', summary: 'extrai.py' }),
    ],
  });
  assert.deepEqual(found.map((f) => [f.detector, f.category]), [['chamada-errada', 'modelo'], ['passo-fora-de-ordem', 'modelo']]);
  assert.match(found[0]!.detail, /^2 vezes: Validation failed/);
  assert.equal(countsLine(found), '2 problemas do modelo');
});

test('do modelo: passo que manda usar uma ferramenta e foi dado como feito sem nenhuma chamada', () => {
  const calls = [call({ step: 'extrair', tool: 'run_script', summary: 'extrai.py' })];
  const found = detect({ run, playbook, calls });
  assert.deepEqual(found.map((f) => [f.detector, f.step]), [['passo-sem-ferramenta', 'abrir']]);
  assert.match(found[0]!.title, /o passo 1 · Abrir foi dado como feito sem nenhuma chamada/);
  // Um passo cujo texto não nomeia ferramenta (esperar, confirmar) não é acusado.
  const waiting = { steps: [{ id: 'abrir', label: 'Abrir', how: 'esperar a aprovação do desenvolvedor' }, playbook!.steps[1]!] } as Seen['playbook'];
  assert.deepEqual(detect({ run, playbook: waiting, calls }), []);
  // Execução sem registro nenhum (anterior ao registro): nada é acusado.
  assert.deepEqual(detect({ run, playbook, calls: [] }), []);
});

test('a mesma impressão digital é contada entre execuções, e dispensar tira da lista', async () => {
  const { Diagnoses } = await import('../src/diagnosis/index.ts');
  const { openDatabase, migrate } = await import('../src/db/database.ts');
  const db = openDatabase(':memory:');
  migrate(db);
  const d = new Diagnoses(db);
  const calls = [call({ step: 'abrir' }), call({ tool: 'run_command', marks: ['recusado-depois'], summary: 'head', error: 'não é permitido' })];
  assert.equal(d.record({ run, playbook, calls })[0]!.times, 1);
  const again = d.record({ run: { ...run, id: 'r2' }, playbook, calls })[0]!;
  assert.equal(again.times, 2, 'o mesmo defeito em outra execução conta de novo');
  assert.deepEqual(d.list().map((f) => f.runId), ['r2', 'r1']);
  assert.deepEqual(d.forRun('r1').map((f) => f.detector), ['recusado-depois']);
  assert.equal(d.dismiss(again.id), true);
  assert.deepEqual(d.list().map((f) => f.runId), ['r1']);
  assert.equal(d.dismiss('nao-existe'), false);
});

test('deslize que o modelo corrigiu na hora fica guardado, mas não interrompe', async () => {
  const { worthTelling, Diagnoses } = await import('../src/diagnosis/index.ts');
  const { openDatabase, migrate } = await import('../src/db/database.ts');
  const db = openDatabase(':memory:');
  migrate(db);
  const calls = [call({ step: 'abrir' }), call({ step: 'abrir', tool: 'show_ui', marks: ['chamada'], status: 'erro', error: 'Validation failed for tool "show_ui"' }), call({ tool: 'run_script', summary: 'extrai.py' })];
  // Recuperado na hora (a mesma ferramenta deu certo em seguida): fica como menor.
  const fixed = new Diagnoses(db).record({ run: { ...run, deviations: [{ kind: 'chamada', detail: 'show_ui falhou', tool: 'show_ui', step: 'abrir', at: '', recovered: true }] } as never, playbook, calls });
  assert.deepEqual(fixed.map((f) => [f.detector, f.minor]), [['chamada-errada', true]]);
  assert.match(fixed[0]!.detail, /Corrigiu na hora/);
  assert.deepEqual(worthTelling(fixed), [], 'não interrompe o desenvolvedor');
  assert.equal(new Diagnoses(db).list().length, 1, 'mas fica guardado e aparece na execução');
  // Sem recuperação: interrompe.
  const stuck = new Diagnoses(db).record({ run: { ...run, id: 'r2', deviations: [{ kind: 'chamada', detail: 'show_ui falhou', tool: 'show_ui', step: 'abrir', at: '' }] } as never, playbook, calls });
  assert.equal(stuck[0]!.minor, undefined);
  assert.equal(worthTelling(stuck).length, 1);
});
