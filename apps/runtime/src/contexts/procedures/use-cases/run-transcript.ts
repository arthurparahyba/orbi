import type { OrbiServices } from '../../../services.ts';
import { transcript } from '../execution/src/run-calls.ts';

/**
 * O que uma execução fez, chamada por chamada, como texto corrido (documento 24): a tela mostra
 * para o desenvolvedor ler de ponta a ponta. Atravessa dois módulos deste contexto (`execution`
 * para a execução, `calls` para o registro) e é pedido de fora.
 */

export interface Transcript {
  text: string;
}

/** A execução não existe. */
export interface NoRun {
  refused: string;
}

type Deps = Pick<OrbiServices, 'procedures'>;

export function runTranscript(d: Deps, runId: string): Transcript | NoRun {
  const run = d.procedures.execution.run(runId);
  if (!run) return { refused: 'execução' };
  return { text: transcript(run, d.procedures.calls.list(run.id), run.deviations) };
}
