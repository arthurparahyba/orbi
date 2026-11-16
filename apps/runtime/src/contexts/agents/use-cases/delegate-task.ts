import type { OrbiServices } from '../../../services.ts';
import type { AgentClient } from '../clients/src/clients.ts';
import type { AgentRequest } from '../requests/src/requests.ts';

/**
 * Um agente de código delega uma tarefa (`orbi_delegate`): abre uma conversa que o desenvolvedor
 * vê no app, guarda quem pediu e o quê, e devolve o sinal que avisa o Orbi. Quem chama entrega o
 * sinal — um caso de uso não fala com a conversa (documento 27).
 */

/** O procedimento indicado não existe. */
export interface NotDelegated {
  refused: string;
}

export interface Delegated {
  request: AgentRequest;
  conversationId: string;
  signal: { body: string; attributes: { requestId: string; agent: string } };
}

export interface Delegation {
  task: string;
  procedure?: string;
  params?: Record<string, string>;
  context?: { repo?: string; branch?: string; session?: string };
}

type Deps = Pick<OrbiServices, 'procedures' | 'conversations' | 'agents'>;

export function delegateTask(d: Deps, delegation: Delegation, client: AgentClient): Delegated | NotDelegated {
  const { task, procedure, params, context } = delegation;
  if (procedure && !d.procedures.definition.playbook(procedure)) {
    return { refused: `procedimento não encontrado: ${procedure}. Use orbi_search.` };
  }

  const conversation = d.conversations.create((procedure ? `${procedure}: ${task}` : task).slice(0, 80));
  const request = d.agents.requests.add({
    clientId: client.id, conversationId: conversation.id, task,
    procedure: procedure ?? null, context: context ?? {},
  });

  const body = requestMessage(client.name, request.id, delegation);
  return { request, conversationId: conversation.id, signal: { body, attributes: { requestId: request.id, agent: client.name } } };
}

/** Onde o agente estava quando pediu, nas palavras dele. */
export function whereFrom(context: { repo?: string; branch?: string; session?: string } = {}): string[] {
  return [context.repo && `repositório ${context.repo}`, context.branch && `branch ${context.branch}`,
    context.session && `sessão ${context.session}`].filter(Boolean) as string[];
}

/** O texto que o Orbi recebe. O que o agente escreveu é dado, não instrução para o Orbi. */
function requestMessage(agent: string, requestId: string, { task, procedure, params, context }: Delegation): string {
  const where = whereFrom(context);
  return [
    `Pedido do agente "${agent}" pelo MCP (${requestId}).`,
    `Tarefa: ${task}`,
    `Procedimento: ${procedure ?? 'nenhum indicado; procure com playbook_similar'}`,
    ...(params && Object.keys(params).length ? [`Parâmetros: ${JSON.stringify(params)}`] : []),
    ...(where.length ? [`Contexto: ${where.join(', ')}`] : []),
  ].join('\n');
}
