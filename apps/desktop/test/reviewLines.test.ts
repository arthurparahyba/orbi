import { describe, expect, it } from 'vitest';
import { changeLine, fixMessage, ideasLine } from '../src/components/review/reviewLines';

const env = { noteId: 'n1', playbook: 'validar-ambiente', problem: 'cert-rds', sintoma: 'certificate verify failed', solucao: 'usar o bundle', raiz: 'instalar o bundle no Python', runs: 3 };

describe('cartão de revisão: autonomia antes de perfeição', () => {
  it('"Corrigir agora" pede ao Orbi para conduzir a correção de vez, com aprovação', () => {
    expect(fixMessage(env)).toBe('Vamos corrigir de vez o problema "certificate verify failed" do validar-ambiente (instalar o bundle no Python). Me guie passo a passo; o que mudar algo, peça antes.');
  });

  it('ideias guardadas são uma linha discreta, sem pergunta', () => {
    expect(ideasLine(undefined)).toBeUndefined();
    expect(ideasLine([{ noteId: 'i', playbook: 'p', text: 't', why: 'w' }])).toBe('1 ideia de melhoria guardada no Cérebro (não muda nada agora).');
  });

  it('o que vale mudar diz quais passos e por quê', () => {
    expect(changeLine({ playbook: 'validar-ambiente', why: 'a execução falhou', steps: ['banco'] })).toBe('validar-ambiente: mudar só o passo banco (a execução falhou)');
    expect(changeLine({ playbook: 'p', why: 'corta 2 de 4 aprovações', steps: [] })).toBe('p: mudar o mínimo (corta 2 de 4 aprovações)');
  });
});
