/**
 * A máquina: o que está ligado e configurado — a tela Autonomia lê daqui.
 */

import type { BrainSnapshot } from './knowledge.ts';

export interface Health {
  model: string; anthropicKey: boolean;
  /** 'anthropic' or the adapter's name; llmReady = has what it needs to answer. */
  llm?: string; llmReady?: boolean;
  /** Which coding agent does each task ("investigar: Claude Code · …"), or null when none is set. */
  codeAgent?: string | null;
  /** Plugins found at start; `error` says why one can't be used. */
  plugins?: Array<{ name: string; kind: string; dir: string; description?: string; error?: string }>; envFile?: string; dataDir?: string; vault?: string; stt?: string; demoPortal?: string;
  /** Folder commands run in, and where each allowed CLI was found (null = not installed). */
  workspace?: string; binaries?: Record<string, string | null>;
  /**
   * O navegador do Orbi: o id do servidor MCP marcado como navegador, ou nulo — a aplicação é
   * instalada sem nenhum, e quem cadastra é o desenvolvedor (documento 31).
   */
  browser: { serverId: string | null };
  brain: BrainSnapshot['stats'];
  /** Where coding agents connect to Orbi's MCP server. */
  mcpUrl?: string;
  /** Which build the runtime is, its process and where it runs from: the app warns when it is another build. */
  build?: string; pid?: number; runtimePath?: string;
}
