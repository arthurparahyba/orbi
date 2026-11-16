import type { PlaybookRun, PlaybookStep } from '../../../language/index.ts';
import type { OrbiServices } from '../../../services.ts';

/**
 * Passo 0 de um procedimento sobre conceitos: registrar o que uma entrada acabou sendo, depois
 * de investigar (documento 22). O valor vira um fato do conceito daquela entrada, marcado como
 * aprendido nesta execução — com Desfazer — e as citações dos passos são preenchidas de novo.
 *
 * Só fatos de um conceito que já existe: conceito novo ou mudança no procedimento vão por
 * `brain_learn`, no contexto `learning`.
 */

export interface Resolved {
  run: PlaybookRun;
  /** O que aconteceu com o fato: nasceu, virou outro nome de um que existia, ou já era sabido. */
  learned: ReturnType<OrbiServices['procedures']['execution']['resolveInput']>['learned'];
  /** Os passos que ainda não rodaram, já com as citações preenchidas. */
  pending: PlaybookStep[];
  /** O que ainda falta resolver, e o que ninguém sabe o que é. */
  toResolve: ReturnType<OrbiServices['procedures']['execution']['inputState']>['toResolve'];
  unknown: string[];
}

/** Por que não deu: entrada que o procedimento não declara, tipo que não existe, id inválido. */
export interface NotResolved {
  refused: string;
}

/** O que o investigador descobriu: a entrada, o nome exato do fato, e o que mais ele soube. */
export interface Discovery {
  runId: string;
  input: string;
  entity: string;
  props?: Record<string, unknown>;
  relations?: Array<{ rel: string; to: string }>;
}

type Deps = Pick<OrbiServices, 'procedures'>;

export function resolveStepInput(d: Deps, request: Discovery): Resolved | NotResolved {
  const { input, entity, props, relations } = request;
  let outcome: ReturnType<OrbiServices['procedures']['execution']['resolveInput']>;
  try {
    outcome = d.procedures.execution.resolveInput(request.runId, input, { entity, props, relations });
  } catch (error) {
    // A recusa faz parte da funcionalidade: o modelo lê e tenta outro valor.
    return { refused: error instanceof Error ? error.message : String(error) };
  }
  const { toResolve, unknown } = d.procedures.execution.inputState(outcome.run.id);
  return {
    run: outcome.run,
    learned: outcome.learned,
    pending: outcome.run.steps.filter((s) => s.status === 'pending'),
    toResolve,
    unknown,
  };
}
