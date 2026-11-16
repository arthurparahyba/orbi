/**
 * A autonomia: o nível de cada procedimento, as categorias de ação, e o que ele já fez e foi
 * aprovado.
 */

export type Autonomy = 'observe' | 'ask' | 'auto';

export type ActionEffect = 'leitura' | 'local' | 'publica' | 'apaga';

/** An action a playbook already did in a run without deviation: repeats it on its own by level. */
export interface KnownAction { playbook: string; fingerprint: string; tool: string; effect: ActionEffect; summary: string; step: string | null; count: number; firstAt: string; lastAt: string }

export interface AutonomyEvent { id: string; subjectKind: 'playbook' | 'passage'; subject: string; from: string; to: string; reason: string; conversationId: string | null; createdAt: string }

export interface PlaybookAutonomy { knownActions: KnownAction[]; events: AutonomyEvent[]; runsForN3: number }

export type FixedCategory = 'comandos-leitura' | 'comandos-escrita' | 'navegador-leitura' | 'navegador-escrita' | 'codigo-teste' | 'codigo-producao' | 'aprender';

/** Each MCP server the developer adds has its own two rules (docs/funcionalidades/20). */
export type McpCategory = `mcp:${string}:leitura` | `mcp:${string}:escrita`;

export type Category = FixedCategory | McpCategory;
