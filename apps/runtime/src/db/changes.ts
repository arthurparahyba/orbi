import type { DatabaseSync } from 'node:sqlite';
import type { Events, Topic } from '../events.ts';

/** Which event each table produces, and the column that names the item (if any). */
const WATCHED: Record<string, { topic: Topic; id?: string }> = {
  types: { topic: 'brain' },
  entities: { topic: 'brain' },
  edges: { topic: 'brain' },
  playbooks: { topic: 'brain' },
  playbook_known_actions: { topic: 'brain' },
  autonomy_events: { topic: 'brain' },
  proposals: { topic: 'brain' },
  review_notes: { topic: 'brain' },
  playbook_learnings: { topic: 'brain' },
  playbook_proofs: { topic: 'brain' },
  run_calls: { topic: 'runs' },
  mcp_servers: { topic: 'mcp-servers', id: 'id' },
  mcp_tools: { topic: 'mcp-servers', id: 'server_id' },
  playbook_runs: { topic: 'runs', id: 'id' },
  inbox_items: { topic: 'inbox', id: 'id' },
  conversations: { topic: 'conversations', id: 'id' },
  settings: { topic: 'autonomy' },
  usage: { topic: 'usage', id: 'conversation_id' },
  pipelines: { topic: 'pipelines', id: 'name' },
  pipeline_runs: { topic: 'pipelines', id: 'conversation_id' },
  agent_clients: { topic: 'agents', id: 'id' },
  agent_requests: { topic: 'agents', id: 'id' },
  agent_suggestions: { topic: 'agents', id: 'id' },
  code_agents: { topic: 'code-agents', id: 'id' },
  code_agent_tasks: { topic: 'code-agents' },
  followups: { topic: 'followups', id: 'conversation_id' },
};

/**
 * Every write to a watched table becomes an event, whichever code made it: one
 * temporary trigger per table and operation calls back into `events.emit`.
 * Stores need not know anyone is listening. (A rolled-back write still emits;
 * the app only refetches, so that is harmless.)
 */
export function watchTables(db: DatabaseSync, events: Events): void {
  db.function('orbi_changed', { deterministic: false, directOnly: false }, (topic, id) => {
    events.emit(topic as Topic, id === null || id === undefined ? undefined : String(id));
    return null;
  });
  for (const [table, { topic, id }] of Object.entries(WATCHED)) {
    for (const op of ['INSERT', 'UPDATE', 'DELETE'] as const) {
      const row = op === 'DELETE' ? 'OLD' : 'NEW';
      const idExpr = id ? `${row}.${id}` : 'NULL';
      db.exec(
        `CREATE TEMP TRIGGER IF NOT EXISTS orbi_${table}_${op.toLowerCase()} AFTER ${op} ON main.${table} ` +
          `BEGIN SELECT orbi_changed('${topic}', ${idExpr}); END`,
      );
    }
  }
}
