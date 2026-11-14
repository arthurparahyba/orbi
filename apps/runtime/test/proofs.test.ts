import { test } from 'node:test';
import assert from 'node:assert/strict';
import { howKey, howToProve, proofLabel, proofOf, type StepProof } from '../src/brain/domain/proofs.ts';
import { retrospective } from '../src/review/retrospective.ts';

/** The proof of a procedure (docs/funcionalidades/25). */
const steps = [
  { id: 'abrir', label: 'Abrir', how: 'abrir o site' },
  { id: 'filtrar', label: 'Filtrar', how: 'clicar no botão Ofertas' },
];
const proof = (step: string, how: string, runId: string | null = 'r1'): StepProof => ({ playbook: 'promo', step, how: howKey(how), runId, at: '2026-11-14T10:00:00Z' });

test('prova: sem nada é rascunho, com todos os passos é provado, no meio é parcial', () => {
  assert.deepEqual(proofOf(steps, []), { state: 'rascunho', missing: ['abrir', 'filtrar'], waived: [] });
  assert.equal(proofOf(steps, [proof('abrir', 'abrir o site')]).state, 'parcial');
  assert.equal(proofOf(steps, steps.map((s) => proof(s.id, s.how))).state, 'provado');
  assert.deepEqual(proofOf([], []), { state: 'rascunho', missing: [], waived: [] });
});

test('prova: o passo que muda de texto perde a prova sozinho; espaço a mais não conta', () => {
  const proofs = steps.map((s) => proof(s.id, s.how));
  const changed = [steps[0]!, { ...steps[1]!, how: 'usar o filtro "Desconto: 10% ou mais"' }];
  assert.deepEqual(proofOf(changed, proofs), { state: 'parcial', missing: ['filtrar'], waived: [] });
  assert.equal(proofOf([{ ...steps[0]!, how: '  abrir   o site ' }], [proof('abrir', 'abrir o site')]).state, 'provado');
});

test('prova: passo dispensado pelo desenvolvedor conta como provado, e aparece como dispensado', () => {
  const p = proofOf(steps, [proof('abrir', 'abrir o site'), proof('filtrar', 'clicar no botão Ofertas', null)]);
  assert.deepEqual(p, { state: 'provado', missing: [], waived: ['filtrar'] });
  assert.equal(proofLabel(p, steps), 'provado · você dispensou o passo 2 · Filtrar');
});

test('prova: o que o desenvolvedor lê e o que o Orbi é mandado fazer', () => {
  assert.equal(proofLabel(proofOf(steps, []), steps), 'rascunho: ainda não rodou como está escrito');
  assert.equal(proofLabel(proofOf(steps, [proof('abrir', 'abrir o site')]), steps), 'falta provar o passo 2 · Filtrar');
  assert.match(howToProve('promo', proofOf(steps, []), steps)!, /promo está em rascunho.*Rode agora com playbook_start/s);
  assert.match(howToProve('promo', proofOf(steps, [proof('abrir', 'abrir o site')]), steps)!, /em promo, falta provar o passo 2 · Filtrar/);
  assert.equal(howToProve('promo', proofOf(steps, steps.map((s) => proof(s.id, s.how))), steps), undefined);
});

test('retrospectiva: o que cada passo passou, do registro, com o que funcionou depois', () => {
  const run = { id: 'r1', steps: [{ id: 'abrir', label: 'Abrir' }, { id: 'extrair', label: 'Extrair' }] } as never;
  const call = (over: Record<string, unknown>) => ({ id: 'x', step: 'extrair', tool: 'browser_act', summary: '', status: 'ok', error: '', ...over }) as never;
  const lines = retrospective(run, [
    call({ status: 'erro', summary: 'evaluate_script', error: 'Error: no node found for uid 7' }),
    call({ tool: 'run_script', status: 'erro', summary: 'gerar_html.py', error: 'JSONDecodeError: line 1' }),
    call({ tool: 'playbook_step', summary: 'stepId=extrair' }),
    call({ tool: 'run_command', summary: 'python3 juntar.py' }),
  ]);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^passo 2 · Extrair: browser_act \(evaluate_script\) falhou: Error: no node found for uid 7; run_script \(gerar_html\.py\) falhou: JSONDecodeError: line 1/);
  assert.match(lines[0]!, /Depois funcionou com run_command \(python3 juntar\.py\)$/);
  assert.deepEqual(retrospective(run, [call({})]), [], 'passo que foi bem não diz nada');
  assert.match(retrospective(run, [call({ status: 'erro', error: 'x' })])[0]!, /Nada funcionou depois, no mesmo passo$/);
});
