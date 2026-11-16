import type { PlaybookScript } from '../../../language/index.ts';
import type { OrbiServices } from '../../../services.ts';

/**
 * O script do procedimento que está rodando nesta conversa, pelo nome. Atravessa dois módulos
 * deste contexto (`execution` para saber o que está aberto, `definition` para o procedimento),
 * e é pedido de fora, então mora aqui e não no handler (documento 27).
 */

export interface FoundScript {
  playbook: string;
  script: PlaybookScript;
}

/** Por que não achou, na frase que o modelo lê para se corrigir. */
export interface NoScript {
  problem: string;
}

type Deps = Pick<OrbiServices, 'procedures'>;

export function findScriptOfRun(d: Deps, conversationId: string, name: string): FoundScript | NoScript {
  const run = d.procedures.execution.openRunIn(conversationId);
  if (!run) return { problem: 'run_script só roda dentro de um procedimento em andamento (playbook_start antes).' };

  const playbook = d.procedures.definition.playbook(run.playbook);
  const script = playbook?.scripts.find((s) => s.name === name);
  if (!script) {
    const names = playbook?.scripts.map((s) => s.name).join(', ') || 'nenhum';
    return {
      problem: `O procedimento ${run.playbook} não tem o script ${name} (tem: ${names}). Para criar ou mudar um script, proponha pelo brain_learn.`,
    };
  }
  return { playbook: run.playbook, script };
}
