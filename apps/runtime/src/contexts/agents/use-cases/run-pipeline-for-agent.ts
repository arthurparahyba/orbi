import type { OrbiServices } from '../../../services.ts';
import type { AgentClient } from '../clients/src/clients.ts';
import { whereFrom, type AgentRequest } from '../requests/src/requests.ts';

/**
 * Um agente de código manda rodar uma esteira (`orbi_run_pipeline`), com os dados de entrada e,
 * se quiser, até que etapa. Se a esteira recusar, a conversa aberta para ela é desfeita: um
 * pedido que não andou não deixa conversa vazia no app do desenvolvedor.
 */

/** A esteira não existe, ou recusou começar (falta entrada, etapa fora de ordem). */
export interface PipelineNotRun {
  refused: string;
}

export interface PipelineDelegated {
  request: AgentRequest;
  conversationId: string;
  status: 'running' | 'waiting';
  stages: string[];
  signal: { body: string; attributes: { requestId: string; agent: string } };
}

export interface PipelineDelegation {
  name: string;
  inputs: Record<string, string>;
  destination?: string;
  context?: { repo?: string; branch?: string; session?: string };
}

type Deps = Pick<OrbiServices, 'procedures' | 'pipelines' | 'conversations' | 'agents'>;

export function runPipelineForAgent(d: Deps, delegation: PipelineDelegation, client: AgentClient): PipelineDelegated | PipelineNotRun {
  const { name, inputs, destination, context } = delegation;
  const pipeline = d.procedures.pipelineDefs.pipeline(name);
  if (!pipeline) return { refused: `esteira não encontrada: ${name}. Use orbi_pipelines.` };

  const summary = Object.values(inputs).filter(Boolean).join(' · ');
  const conversation = d.conversations.create(`${pipeline.name}${summary ? `: ${summary}` : ''}`.slice(0, 80));
  const started = start(d, pipeline.name, inputs, { conversationId: conversation.id, destination, client });
  if ('refused' in started) {
    d.conversations.delete(conversation.id);
    return started;
  }

  const task = `Rodar a esteira ${pipeline.name}${destination ? ` até ${destination}` : ''}${summary ? ` (${summary})` : ''}`;
  const request = d.agents.requests.add({
    clientId: client.id, conversationId: conversation.id, task,
    procedure: null, pipeline: pipeline.name, context: context ?? {},
  });
  return {
    request, conversationId: conversation.id,
    status: started.run.status === 'waiting' ? 'waiting' : 'running',
    stages: started.run.stages.map((stage) => stage.label),
    signal: { body: signalBody(client.name, request.id, context, started.instruction), attributes: { requestId: request.id, agent: client.name } },
  };
}

/** O que o Orbi recebe: quem pediu, de onde, e o que a esteira manda fazer agora. */
function signalBody(agent: string, requestId: string, context: PipelineDelegation['context'], instruction: string): string {
  const where = whereFrom(context);
  return [
    `Pedido do agente "${agent}" pelo MCP (${requestId}).`,
    ...(where.length ? [`Contexto: ${where.join(', ')}`] : []),
    instruction,
  ].join('\n');
}

/** A esteira recusa dizendo o motivo por exceção: aqui a recusa volta como valor. */
function start(d: Deps, name: string, inputs: Record<string, string>, how: { conversationId: string; destination?: string; client: AgentClient }) {
  try {
    return d.pipelines.engine.start(name, inputs, {
      conversationId: how.conversationId,
      destination: how.destination || null,
      requestedBy: `agent:${how.client.name}`,
      skipQuestions: how.client.canSkipPassages,
    });
  } catch (error) {
    return { refused: error instanceof Error ? error.message : String(error) };
  }
}
