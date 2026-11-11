import { describe, expect, it } from 'vitest';
import { groupConversations, showsPanel, stageIndex, stateLine, stateOf } from '../src/views/conversation/stage';
import type { ConversationInfo } from '../src/api';

const conv = (id: string, state?: ConversationInfo['state']): ConversationInfo => ({ id, title: id, createdAt: '', updatedAt: '', ...(state ? { state } : {}) });

describe('Conversas: uma caixa só, a cara de ensino só quando é ensino', () => {
  it('conversa nova é só uma conversa: sem barra de etapas e sem painel', () => {
    expect(stateOf(conv('a'))).toEqual({ mode: 'conversa' });
    expect(stageIndex({ mode: 'conversa' })).toBeUndefined();
    expect(showsPanel({ mode: 'conversa' })).toBe(false);
    expect(stateLine({ mode: 'conversa' })).toBe('Conversa');
  });

  it('a barra de etapas vai de Explicar a Assumir; fazendo algo conhecido mostra o painel, sem etapas', () => {
    expect(stageIndex({ mode: 'ensinando', stage: 'combinar' })).toBe(2);
    expect(stageIndex({ mode: 'aprendido', stage: 'assumir', playbook: 'x', level: 2 })).toBe(4);
    expect(stageIndex({ mode: 'fazendo', playbook: 'x', status: 'running' })).toBeUndefined();
    expect(showsPanel({ mode: 'fazendo', playbook: 'x', status: 'running' })).toBe(true);
  });

  it('a linha da lista diz onde está, em palavras', () => {
    expect(stateLine({ mode: 'ensinando', stage: 'ensaiar' })).toBe('Aprendendo com você · ensaiando');
    expect(stateLine({ mode: 'fazendo', playbook: 'atualizar-mfe', status: 'waiting' })).toBe('atualizar-mfe · esperando você');
    expect(stateLine({ mode: 'aprendido', stage: 'assumir', playbook: 'atualizar-mfe', level: 1 })).toBe('Assumi: atualizar-mfe · N1');
  });

  it('agrupa em Em andamento, Já assumi e Recentes, mantendo a ordem e sem grupo vazio', () => {
    const groups = groupConversations([
      conv('b', { mode: 'fazendo', playbook: 'x', status: 'running' }),
      conv('a'),
      conv('c', { mode: 'ensinando', stage: 'ensaiar' }),
      conv('d', { mode: 'fazendo', playbook: 'x', status: 'done' }),
      conv('e', { mode: 'aprendido', stage: 'assumir', playbook: 'x', level: 1 }),
    ]);
    expect(groups.map((g) => [g.title, g.items.map((c) => c.id)])).toEqual([['Em andamento', ['b', 'c']], ['Já assumi', ['e']], ['Recentes', ['a', 'd']]]);
  });
});
