/**
 * Server-sent events on GET /api/events. They only say *what* changed; the app
 * fetches the new state from the usual route. On every (re)connection the
 * runtime sends `hello`, so a client that missed events refetches everything.
 *
 *   inbox          pendências (id = item)
 *   conversations  lista de conversas (id = conversa)
 *   brain          ontologia, entidades, relações, propostas, playbooks
 *   runs           execuções de playbook (id = execução)
 *   autonomy       política de autonomia
 *   vault          credenciais (nomes)
 *   recording      gravação no navegador (id = gravação)
 *   dispatched     o runtime mandou uma mensagem a uma conversa (id = conversa)
 *   usage          uso do modelo e das ferramentas (id = conversa)
 *   pipelines      esteiras e as entregas rodando (id = nome da esteira ou conversa da entrega)
 *   voice          modelo de transcrição: baixando, pronto, erro, trocado
 *   agents         agentes conectados, pedidos e sugestões que chegaram pelo MCP
 *   code-agents    agentes de código desta máquina e quem faz cada tarefa (id = agente)
 */
export const TOPICS = ['inbox', 'conversations', 'brain', 'runs', 'autonomy', 'vault', 'recording', 'dispatched', 'usage', 'agents', 'voice', 'pipelines', 'code-agents'] as const;
export type Topic = (typeof TOPICS)[number];

export interface ChangeEvent {
  topic: Topic;
  /** Which item changed, when the topic has items. */
  id?: string;
}
