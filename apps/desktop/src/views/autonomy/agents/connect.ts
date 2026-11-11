import type { AgentRequest, AgentRequestStatus, InboxItem } from '../../../api';

/** Coding agents the Conexões tab knows how to set up. */
export type AgentKind = 'claude-code' | 'cursor' | 'outro';
export const AGENT_KINDS: Array<{ value: AgentKind; label: string }> = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'outro', label: 'Outro' },
];

/** What to run (or paste) so the agent connects to Orbi's MCP server. */
export function connectCommand(kind: AgentKind, url: string, token: string): { how: string; text: string } {
  if (kind === 'claude-code') {
    return {
      how: 'Rode no terminal, uma vez (vale para todos os seus repositórios):',
      text: `claude mcp add --scope user --transport http orbi ${url} --header "Authorization: Bearer ${token}"`,
    };
  }
  const json = JSON.stringify({ mcpServers: { orbi: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  return kind === 'cursor'
    ? { how: 'Cole em ~/.cursor/mcp.json (junte com o que já houver em mcpServers):', text: json }
    : { how: 'Servidor MCP por HTTP (streamable). Na configuração do seu agente:', text: json };
}

/** Goes in a repository's CLAUDE.md (or AGENTS.md) so the agent uses Orbi for repetitive work. */
export const CLAUDE_MD_SNIPPET = `## Orbi (trabalho repetitivo depois do código)

Este ambiente tem o Orbi, o copiloto local do desenvolvedor, conectado como MCP (\`orbi\`).

- Antes de fazer à mão algo repetitivo depois do código (CI, deploy, release, portal interno, GMUD), procure com \`orbi_search\`. Se houver procedimento, leia com \`orbi_procedure\` e delegue com \`orbi_delegate\` (com repositório e branch em \`context\`).
- Para uma entrega de várias etapas (dev, homologação, GMUD), veja as esteiras com \`orbi_pipelines\` e \`orbi_pipeline\` e rode com \`orbi_run_pipeline\` (entradas e, se quiser, a etapa de destino).
- Não espere em loop: siga com o seu trabalho e consulte \`orbi_status\` quando precisar do resultado. "waiting" é aprovação do desenvolvedor no app do Orbi; você não aprova.
- Quando fizer algo repetitivo que o Orbi não sabe, sugira com \`orbi_teach\`. O desenvolvedor revisa antes de virar procedimento.
- Nunca mande credenciais ao Orbi.
`;

/** A request's state on screen: "waiting" when something of its conversation waits for the developer. */
export function requestState(r: AgentRequest, openInbox: InboxItem[]): AgentRequestStatus {
  if (r.status !== 'running') return r.status;
  return openInbox.some((i) => i.conversationId === r.conversationId) ? 'waiting' : 'running';
}

export const STATE_LABEL: Record<AgentRequestStatus, string> = { running: 'rodando', waiting: 'esperando você', done: 'concluído', failed: 'falhou' };

/** "agora", "há 5 min", "há 2 h", or the date. */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** Counters for the top of the Agentes screen. */
export function agentStats(requests: AgentRequest[], openInbox: InboxItem[], now = new Date()) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const states = requests.map((r) => requestState(r, openInbox));
  return {
    running: states.filter((s) => s === 'running').length,
    waiting: states.filter((s) => s === 'waiting').length,
    today: requests.filter((r) => r.createdAt >= midnight).length,
  };
}
