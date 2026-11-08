import { describe, expect, it } from 'vitest';
import { finalizeSteps, moveStep, propsFromRows, rowsFromProps, stepId, stepProblems } from '../src/views/brain/editing';
import { deleteConsequences } from '../src/views/brain/Playbooks';

describe('editar propriedades', () => {
  const original = { url: 'https://a', requires: ['registradoEm'], porta: 8080 };
  it('mostra tudo como texto e volta ao tipo original quando ainda é JSON', () => {
    const rows = rowsFromProps(original);
    expect(rows).toEqual([{ key: 'url', value: 'https://a' }, { key: 'requires', value: '["registradoEm"]' }, { key: 'porta', value: '8080' }]);
    rows[2].value = '9090';
    rows.push({ key: ' dono ', value: 'marina' }, { key: '', value: 'ignorado' });
    expect(propsFromRows(rows, original)).toEqual({ url: 'https://a', requires: ['registradoEm'], porta: 9090, dono: 'marina' });
  });
  it('vira texto quando deixa de ser JSON', () => {
    expect(propsFromRows([{ key: 'porta', value: 'oito mil' }], original)).toEqual({ porta: 'oito mil' });
  });
  it('texto que parece número continua texto se era texto', () => {
    expect(propsFromRows([{ key: 'url', value: '42' }], original)).toEqual({ url: '42' });
  });
});

describe('editar passos', () => {
  const steps = [{ id: 'a', label: 'Abrir', how: '' }, { id: 'b', label: 'Salvar', how: '' }];
  it('reordena sem sair da lista', () => {
    expect(moveStep(steps, 0, 1).map((s) => s.id)).toEqual(['b', 'a']);
    expect(moveStep(steps, 0, -1)).toBe(steps);
  });
  it('acusa lista vazia e passo sem nome', () => {
    expect(stepProblems([])).toHaveLength(1);
    expect(stepProblems([{ id: '', label: '  ', how: '' }])).toEqual(['O passo 1 está sem nome.']);
  });
  it('passo novo ganha id do nome; os existentes mantêm o seu', () => {
    const done = finalizeSteps([...steps, { id: '', label: ' Abrir ', how: ' x ' }, { id: '', label: 'Conferir versão', how: '' }]);
    expect(done.map((s) => s.id)).toEqual(['a', 'b', 'abrir', 'conferir-versao']);
    expect(done[2]).toEqual({ id: 'abrir', label: 'Abrir', how: 'x' });
    expect(stepId('Abrir', ['abrir'])).toBe('abrir-2');
  });
});

describe('apagar procedimento', () => {
  const pb = (name: string, variationOf: string | null = null, uses = 0) => ({ name, variationOf, uses }) as never;
  it('diz o que acontece com variações e histórico', () => {
    const text = deleteConsequences(pb('criar', null, 4), [pb('criar', null, 4), pb('deletar', 'criar')]);
    expect(text.join(' ')).toMatch(/A variação deletar continua, sem a ligação/);
    expect(text.join(' ')).toMatch(/4 execuções passadas continuam/);
    expect(deleteConsequences(pb('x'), [pb('x')])).toHaveLength(1);
  });
});

import { finalizeOutputs, outputProblems, playbookParams } from '../src/views/brain/editing';
describe('recebe e entrega', () => {
  it('acha os parâmetros sem contar credenciais', () => {
    expect(playbookParams([{ label: 'Abrir {{repo}}', how: 'login {{segredo:gh}} e {{ versao }}' }], 'em {{repo}}')).toEqual(['repo', 'versao']);
  });
  it('valida e limpa as entregas', () => {
    expect(outputProblems([{ name: 'PR', description: '' }])[0]).toMatch(/minúsculas/);
    expect(outputProblems([{ name: 'a', description: '' }, { name: 'a', description: '' }])[0]).toMatch(/duas vezes/);
    expect(finalizeOutputs([{ name: ' pr_url ', description: ' PR ' }, { name: '', description: 'x' }])).toEqual([{ name: 'pr_url', description: 'PR' }]);
  });
});
