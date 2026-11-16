import type { OrbiServices } from '../../../services.ts';

/**
 * Começar uma esteira: procedimentos em sequência, com o motor decidindo a próxima etapa. Quando
 * não dá para começar, devolve o motivo **com as entradas que a esteira declara** — é assim que
 * o modelo descobre o que pedir ao desenvolvedor em vez de adivinhar.
 */

export interface PipelineStarted {
  runId: string;
  /** O que o motor manda fazer agora: qual procedimento, com quais dados. */
  next: string;
}

export interface PipelineNotStarted {
  refused: string;
  /** As entradas declaradas pela esteira, quando ela existe: nome, descrição, opções, padrão. */
  inputs?: Array<{ name: string; description?: string; options: string[]; default?: string }>;
}

type Deps = Pick<OrbiServices, 'procedures' | 'pipelines'>;

export function startPipeline(
  d: Deps,
  request: { name: string; inputs: Record<string, string>; conversationId: string; destination?: string },
): PipelineStarted | PipelineNotStarted {
  try {
    const { run, instruction } = d.pipelines.engine.start(request.name, request.inputs, {
      conversationId: request.conversationId,
      destination: request.destination,
    });
    return { runId: run.id, next: instruction };
  } catch (error) {
    // A recusa faz parte da funcionalidade: vem com o que a esteira pede, para o modelo perguntar.
    const pipeline = d.procedures.pipelineDefs.pipeline(request.name);
    return {
      refused: error instanceof Error ? error.message : String(error),
      ...(pipeline ? { inputs: declaredInputs(pipeline) } : {}),
    };
  }
}

type Pipeline = NonNullable<ReturnType<OrbiServices['procedures']['pipelineDefs']['pipeline']>>;

const declaredInputs = (pipeline: Pipeline): PipelineNotStarted['inputs'] =>
  pipeline.inputs.map((i) => ({
    name: i.name,
    description: i.description,
    options: i.options ?? [],
    ...(i.default ? { default: i.default } : {}),
  }));
