import { LEVEL_NAMES, type Playbook, type PlaybookRun } from '../../../language/index.ts';
import type { Execution } from '../execution/src/service.ts';
import type { OrbiServices } from '../../../services.ts';
import { proofOf, proofLabel, type ProofState } from '../proofs/src/proofs.ts';
import { learningLines } from '../learnings/src/learnings.ts';

/**
 * Começar a rodar um procedimento que o Orbi já sabe. Devolve o que a execução precisa para
 * começar, ou a recusa com o motivo — não fala com a conversa nem com a tela (documento 27):
 * quem chama marca a execução como ativa, desenha o checklist e responde ao modelo.
 */

export interface Refused {
  /** Por que não começou, na palavra do domínio. */
  refused: string;
  /** Quando o procedimento não existe: os nomes que existem, para quem pediu se corrigir. */
  known?: string[];
}

export interface Started {
  run: PlaybookRun;
  procedure: Playbook;
  /** "só observar" ou o nome do nível (N1 · Aprendendo…), como o desenvolvedor vê. */
  autonomy: string;
  /** Passo 0: as entradas que o cérebro não resolveu sozinho, e as que ninguém sabe o que são. */
  step0: ReturnType<Execution['inputState']> & { missing: string[] };
  /** O que já se tentou nos passos deste procedimento, em linhas prontas para ler. */
  alreadyTried: string[];
  /** Se ele ainda não rodou como está escrito, o que esta execução prova. */
  proof: { state: ProofState; label: string };
}

type Deps = Pick<OrbiServices, 'procedures' | 'pipelines'>;

export function startProcedure(
  d: Deps,
  request: { name: string; conversationId: string; params?: Record<string, string> },
): Started | Refused {
  const procedure = d.procedures.definition.playbook(request.name);
  if (!procedure) return { refused: `playbook não existe: ${request.name}`, known: namesOf(d) };

  // Numa esteira, as etapas vão em ordem: uma etapa depois não começa com a atual aberta.
  const outOfOrder = d.pipelines.engine.startProblem(request.conversationId, procedure.name);
  if (outOfOrder) return { refused: outOfOrder };

  const run = d.procedures.execution.startRun(procedure.name, request.conversationId, request.params);
  d.pipelines.engine.runStarted(run);

  const { toResolve, unknown } = d.procedures.execution.inputState(run.id);
  const proof = proofOf(procedure.steps, d.procedures.proofs.list(procedure.name));
  return {
    run,
    procedure,
    autonomy: procedure.autonomy === 'observe' ? 'só observar' : LEVEL_NAMES[procedure.level],
    step0: { toResolve, unknown, missing: missingInputs(procedure, request.params) },
    alreadyTried: learningLines(d.procedures.learnings.list(procedure.name)),
    proof: { state: proof.state, label: proofLabel(proof, procedure.steps) },
  };
}

const namesOf = (d: Deps): string[] => d.procedures.definition.playbooks().map((p) => p.name);

/** As entradas declaradas que não vieram como parâmetro: o passo 0 tem de descobrir. */
const missingInputs = (procedure: Playbook, params: Record<string, string> | undefined): string[] =>
  (procedure.inputs ?? []).filter((i) => !params?.[i.name]).map((i) => i.name);
