'use agent';
import { useModel } from './runtime-port.ts';
import { services } from '../services.ts';
import { useCapabilities } from './capabilities.ts';
import { CONFIG_CAPABILITIES } from './configurador-capabilities.ts';
import instructions from '../prompts/configurador/agentes-de-codigo.md?raw';

/**
 * The configuration chat beside Configurações › Agentes de código (conversation `config:agentes-de-codigo`).
 * Its own agent, not the Orbi of the conversations: its own short list of capabilities (look at
 * this machine, propose a registration) and its own instructions, sharing the gate and the UI
 * channel. A new configuration chat is a new agent like this one, with its own list.
 */
export function Configurador({ id }: { id: string }) {
  const all = services();
  useModel(all.config.model, { thinkingLevel: 'low' });
  useCapabilities(id, all, CONFIG_CAPABILITIES);
  const state = all.codeAgents.describe();
  return [
    instructions,
    state ? `Hoje: ${state}.` : 'Hoje nenhuma tarefa tem agente.',
    `Shell do desenvolvedor: ${all.config.shell ?? 'não encontrado (peça o caminho do Git Bash)'}.`,
  ].join('\n');
}

Configurador.agentName = 'configurador';

/** The conversation of this chat, and the prefix the runtime routes to this agent. */
export const CONFIG_PREFIX = 'config:';
export const CODE_AGENTS_CONVERSATION = 'config:agentes-de-codigo';
