import { defineSkill } from '../agents/runtime-port.ts';
import instructions from '../prompts/corrigir-procedimento.md?raw';

/**
 * How to correct a procedure after a run (docs/funcionalidades/19): what to touch, what counts for
 * autonomy, which tools exist. Activated by the review's instruction, on the "aprender e corrigir"
 * model (llm/roles.ts).
 */
export const corrigirProcedimento = defineSkill({
  name: 'corrigir-procedimento',
  description:
    'Corrigir um procedimento depois de uma execução, quando a revisão pede uma mudança: só os passos indicados, sem perder a autonomia, só com as ferramentas que existem. Use no turno da "Revisão da execução" que pede brain_learn.',
  instructions,
});
