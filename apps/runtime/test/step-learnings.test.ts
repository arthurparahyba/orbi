import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrainStore } from '../src/brain/store.ts';
import { deniedAttempts, failedAttempts, learningLines, sameAttempt } from '../src/brain/domain/step-learnings.ts';

/** What was already tried stays with the procedure (docs/funcionalidades/25). */
const steps = (extrair: string) => [{ id: 'abrir', label: 'Abrir', how: 'abrir o site' }, { id: 'extrair', label: 'Extrair', how: extrair }];

test('a mesma tentativa, dita com outras palavras, é reconhecida; outra coisa não', () => {
  assert.equal(sameAttempt('Extrair em lotes de 20 itens e juntar com juntar_lotes.py', 'extrair em lotes de 20 itens, juntar com juntar_lotes.py'), true);
  assert.equal(sameAttempt('Extrair em lotes de 20 itens e juntar com juntar_lotes.py', 'Rodar evaluate_script e gravar com saveTo em promo.json'), false);
});

test('proposta negada vira aprendizado; guardar a mesma de novo conta as repetições', () => {
  const b = new BrainStore(':memory:');
  b.savePlaybook({ name: 'promo', description: 'd', appliesTo: null, trigger: 't', autonomy: 'ask', steps: steps('ler a página'), instructions: '', learnedFrom: null, variationOf: null, outputs: [] });
  const before = b.playbook('promo')!.steps;
  const lotes = steps('Extrair em lotes de 20 itens e juntar com juntar_lotes.py');
  const denied = deniedAttempts('promo', before, lotes, 'c1');
  assert.deepEqual(denied.map((d) => [d.step, d.outcome]), [['extrair', 'negado']], 'só o passo que mudaria');
  for (const d of denied) b.learnings.add(d);
  for (const d of denied) b.learnings.add(d);
  assert.deepEqual(b.learnings.list('promo').map((l) => l.times), [2]);

  assert.match(learningLines(b.learnings.list('promo'))[0], /passo extrair · negado pelo desenvolvedor: Extrair em lotes/);

  b.deletePlaybook('promo');
  assert.deepEqual(b.learnings.list('promo'), [], 'apagar o procedimento leva os aprendizados');
});

test('execução: o que falhou num passo que terminou feito vira aprendizado; deslize corrigido e chamada errada não', () => {
  const run = {
    id: 'r1', playbook: 'promo', conversationId: 'c1',
    steps: [{ id: 'extrair', label: 'Extrair', how: '', status: 'done' as const }, { id: 'html', label: 'HTML', how: '', status: 'failed' as const }],
    deviations: [
      { kind: 'comando' as const, detail: 'saiu com 1: JSONDecodeError', command: 'python3 gerar.py', tool: 'comando', step: 'extrair', at: '' },
      { kind: 'comando' as const, detail: 'saiu com 1', command: 'git status', tool: 'comando', step: 'extrair', at: '', recovered: true },
      { kind: 'chamada' as const, detail: 'show_ui falhou', tool: 'show_ui', step: 'extrair', at: '' },
      { kind: 'falha' as const, detail: 'x falhou', tool: 'x', step: 'html', at: '' },
    ],
  };
  assert.deepEqual(failedAttempts(run as never).map((l) => [l.step, l.tried, l.outcome]), [['extrair', 'python3 gerar.py', 'falhou']]);
});
