import { knowledgeSuggestions } from '../../brain/domain/knowledge.ts';
import type { RunAnalyzer } from './types.ts';

/** What failed and was got past (or not): a known problem for the brain. */
export const knownProblems: RunAnalyzer = {
  id: 'problema-conhecido',
  kind: 'aprender',
  analyze: (run) => knowledgeSuggestions(run),
  howToFix:
    'Cada problema a aprender vai no mesmo lote como fato do cérebro: uma entity de um tipo para problemas (crie o tipo se ainda não existir, ex.: Problema) ' +
    'com props sintoma (o trecho da mensagem que identifica o erro, curto), causa, solucao (o que fazer, e quem faz) e onde (procedimento e passo), ' +
    'e edges para o que ele afeta, se já estiver no cérebro (ex.: o repositório). Antes, veja com brain_query se já existe um parecido: corrija em vez de duplicar. ' +
    'Se não souber a causa, investigue primeiro (logs, status); o que não descobrir, deixe claro como não confirmado.',
};
