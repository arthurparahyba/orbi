import { describe, expect, it } from 'vitest';
import { groupConversations, stageIndex, stateLine, stateOf } from '../src/views/conversation/stage';
import type { ConversationInfo } from '../src/api';

const conv = (id: string, state?: ConversationInfo['state']): ConversationInfo => ({ id, title: id, createdAt: '', updatedAt: '', ...(state ? { state } : {}) });

describe('tela de ensinar: etapas e lista', () => {
  it('sem estado vindo do runtime, é o começo de um ensino', () => {
    expect(stateOf(conv('a'))).toEqual({ mode: 'ensinando', stage: 'explicar' });
    expect(stageIndex(stateOf(conv('a')))).toBe(0);
  });

  it('a barra de etapas vai de Explicar a Assumir; fazendo algo conhecido não tem etapa', () => {
    expect(stageIndex({ mode: 'ensinando', stage: 'combinar' })).toBe(2);
    expect(stageIndex({ mode: 'aprendido', stage: 'assumir', playbook: 'x', level: 2 })).toBe(4);
    expect(stageIndex({ mode: 'fazendo', playbook: 'x', status: 'running' })).toBeUndefined();
  });

  it('a linha da lista diz onde está, em palavras', () => {
    expect(stateLine({ mode: 'ensinando', stage: 'aprender' })).toBe('Esperando você aprovar o que aprendi');
    expect(stateLine({ mode: 'fazendo', playbook: 'atualizar-mfe', status: 'waiting' })).toBe('atualizar-mfe · esperando você');
    expect(stateLine({ mode: 'aprendido', stage: 'assumir', playbook: 'atualizar-mfe', level: 1 })).toBe('Aprendi: atualizar-mfe · N1');
  });

  it('agrupa em Ensinando, Fazendo e Já sei fazer, mantendo a ordem e sem grupo vazio', () => {
    const groups = groupConversations([
      conv('b', { mode: 'fazendo', playbook: 'x', status: 'running' }),
      conv('a'),
      conv('c', { mode: 'ensinando', stage: 'ensaiar' }),
    ]);
    expect(groups.map((g) => [g.title, g.items.map((c) => c.id)])).toEqual([['Ensinando', ['a', 'c']], ['Fazendo', ['b']]]);
  });
});
