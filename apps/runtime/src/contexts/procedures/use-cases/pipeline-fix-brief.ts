import type { OrbiServices } from '../../../services.ts';
import type { ConfigProblem } from '../pipelines/src/config.ts';
import { reviewInstruction } from '../../improvement/index.ts';

/**
 * "Corrigir a esteira": o desenvolvedor clicou no aviso de uma esteira cuja configuração impede
 * o dado de andar (um mapa para parâmetro que o procedimento não tem, uma etapa que pergunta o
 * que a esteira já dá). Devolve o briefing para o Orbi revisar — quem chama abre a conversa.
 */

export interface FixBrief {
  pipeline: string;
  /** O que a revisão vai ler, e o mesmo conteúdo em dado, para o sinal do agente. */
  instruction: string;
  review: { runs: never[]; config: ConfigProblem[]; pipeline: string };
}

export interface NothingToFix {
  refused: 'nao-existe' | 'sem-problemas';
}

type Deps = Pick<OrbiServices, 'procedures'>;

export function pipelineFixBrief(d: Deps, name: string): FixBrief | NothingToFix {
  const pipeline = d.procedures.pipelineDefs.pipeline(name);
  if (!pipeline) return { refused: 'nao-existe' };

  const config = d.procedures.pipelineDefs.pipelineWarnings(pipeline);
  if (config.length === 0) return { refused: 'sem-problemas' };

  const review = { runs: [] as never[], config, pipeline: pipeline.name };
  return { pipeline: pipeline.name, instruction: reviewInstruction(review), review };
}
