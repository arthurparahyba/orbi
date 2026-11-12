import { describe, expect, it } from 'vitest';
import { learningChanges } from '../src/components/ui/learningChanges';

const pb = (steps: Array<{ id: string; label: string; how: string }>, extra = {}) => JSON.stringify({ items: [{ kind: 'playbook', payload: { name: 'promo', description: 'd', steps, ...extra } }] });

describe('o que mudou no cartão durante a conversa', () => {
  it('passo mudado, passo novo e passo que saiu; campo do procedimento', () => {
    const before = pb([{ id: 'a', label: 'Extrair', how: 'curl' }, { id: 'b', label: 'Gerar', how: 'gera html' }, { id: 'c', label: 'Mover', how: 'mv' }]);
    const after = pb([{ id: 'a', label: 'Extrair', how: 'evaluate_script com saveTo' }, { id: 'b', label: 'Gerar', how: 'gera html' }, { id: 'd', label: 'Contar', how: 'conta itens do JSON' }], { trigger: 'promoções' });
    expect(learningChanges(before, after)).toEqual([
      { where: 'Passo 1: Extrair', text: 'evaluate_script com saveTo' },
      { where: 'Passo 3: Contar (novo)', text: 'conta itens do JSON' },
      { where: 'Passo saiu: Mover', text: '' },
      { where: 'Procedimento promo · quando usar', text: 'promoções' },
    ]);
  });

  it('conceito com descrição nova e item novo', () => {
    const before = JSON.stringify({ items: [{ kind: 'type', payload: { name: 'Loja', description: 'Site de compras' } }] });
    const after = JSON.stringify({ items: [{ kind: 'type', payload: { name: 'Loja', description: 'Site de compras com promoções semanais' } }, { kind: 'entity', payload: { id: 'kabum', type: 'Loja' } }] });
    expect(learningChanges(before, after)).toEqual([
      { where: 'Conceito Loja · descrição', text: 'Site de compras com promoções semanais' },
      { where: 'Fato kabum (novo)', text: '' },
    ]);
  });

  it('nada mudou: nada a mostrar; texto inválido não quebra', () => {
    expect(learningChanges(pb([]), pb([]))).toEqual([]);
    expect(learningChanges('x', 'y')).toEqual([]);
  });
});

describe('o que um fato proposto faz no cérebro', () => {
  it('novo, já sei, acrescenta e muda', async () => {
    const { factEffect } = await import('../src/components/ui/learningChanges');
    expect(factEffect(undefined, { a: 1 })).toBe('novo');
    const existing = { props: { repositorio: 'org/x', time: 'pag' } };
    expect(factEffect(existing, { repositorio: 'org/x' })).toBe('já sei');
    expect(factEffect(existing, { banco: 'pag-db', repositorio: 'org/y' })).toBe('acrescenta banco = pag-db · muda repositorio: org/x → org/y');
  });
});
