import { describe, expect, it } from 'vitest';
import { levelLine, readable, stepMark, usesLine } from '../src/views/conversation/notebook';

const proc = (over: Record<string, unknown> = {}) => ({ name: 'atualizar-mfe', description: '', level: 1 as const, levelMax: 3 as const, uses: 0, successes: 0, nextLevel: { level: 2 as const, cleanRunsLeft: 1 }, ...over });

describe('painel "O que estou aprendendo"', () => {
  it('cada estado de passo tem marca e, quando espera, diz por quê', () => {
    expect(stepMark('done')).toEqual({ mark: 'done' });
    expect(stepMark('waiting')).toEqual({ mark: 'wait', hint: 'esperando você' });
    expect(stepMark('planned')).toEqual({ mark: 'todo' });
  });

  it('a autonomia diz onde está e o que falta para subir', () => {
    expect(levelLine(proc())).toBe('N1 agora · N2 depois de 1 execução sem correção');
    expect(levelLine(proc({ level: 2, nextLevel: { level: 3, cleanRunsLeft: 2 } }))).toBe('N2 agora · N3 depois de 2 execuções seguidas sem correção');
    expect(levelLine(proc({ level: 2, levelMax: 2, nextLevel: undefined }))).toBe('N2 · você limitou até aqui');
    expect(levelLine(proc({ level: 3, nextLevel: undefined }))).toBe('N3 · faço sozinho o que já conheço');
  });

  it('passo aprendido lê como frase: as citações viram ‹entrada›', () => {
    expect(readable('Criar o release {{versao}} em {{ ambiente }}')).toBe('Criar o release ‹versao› em ‹ambiente›');
    expect(readable('Abrir {{mfe.publicadoPor.endereco}}')).toBe('Abrir ‹mfe.publicadoPor.endereco›');
  });

  it('as execuções em palavras, com o caso de só ter ensaiado', () => {
    expect(usesLine(proc())).toBe('Ainda não rodou de verdade (só o ensaio)');
    expect(usesLine(proc({ uses: 3, successes: 2 }))).toBe('3 execuções · 2 deram certo');
  });
});
