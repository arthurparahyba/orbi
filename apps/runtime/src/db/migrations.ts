/**
 * Schema changes, in order. The database records how many ran
 * (`PRAGMA user_version`); on open, the missing ones run in one transaction each.
 * Never edit a migration that shipped: add a new one.
 */
export const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: 'cérebro: ontologia, grafo temporal, playbooks, execuções, aprendizados, retornos',
    // IF NOT EXISTS: brain.db files from before migrations already have these tables.
    sql: `
CREATE TABLE IF NOT EXISTS types (
  name TEXT PRIMARY KEY, description TEXT NOT NULL DEFAULT '',
  relations TEXT NOT NULL DEFAULT '{}', requires TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, type TEXT NOT NULL REFERENCES types(name),
  props TEXT NOT NULL DEFAULT '{}', body TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS edges (
  from_id TEXT NOT NULL, rel TEXT NOT NULL, to_id TEXT NOT NULL,
  attrs TEXT NOT NULL DEFAULT '{}', valid_from TEXT NOT NULL, valid_to TEXT,
  PRIMARY KEY (from_id, rel, to_id, valid_from));
CREATE INDEX IF NOT EXISTS edges_to ON edges(to_id);
CREATE TABLE IF NOT EXISTS playbooks (
  name TEXT PRIMARY KEY, description TEXT NOT NULL, applies_to TEXT, trigger TEXT NOT NULL DEFAULT '',
  autonomy TEXT NOT NULL DEFAULT 'ask', steps TEXT NOT NULL DEFAULT '[]', instructions TEXT NOT NULL DEFAULT '',
  learned_from TEXT, uses INTEGER NOT NULL DEFAULT 0, successes INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS playbook_runs (
  id TEXT PRIMARY KEY, playbook TEXT NOT NULL, conversation_id TEXT NOT NULL, status TEXT NOT NULL,
  steps TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS followups (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, due_at TEXT NOT NULL, note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled');`,
  },
  {
    name: 'estado do app: pendências, conversas e preferências (antes em arquivos JSON)',
    sql: `
CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, conversation_id TEXT NOT NULL, title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '', approval_id TEXT, routine TEXT, status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL);
CREATE INDEX inbox_items_status ON inbox_items(status, created_at);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  },
  {
    name: 'uso do modelo e das ferramentas por conversa e por dia',
    sql: `
CREATE TABLE usage (
  conversation_id TEXT NOT NULL, day TEXT NOT NULL, model TEXT NOT NULL DEFAULT '',
  turns INTEGER NOT NULL DEFAULT 0, failed_turns INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
  cache_read INTEGER NOT NULL DEFAULT 0, cache_write INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0, model_ms INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0, failed_tools INTEGER NOT NULL DEFAULT 0, tool_ms INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, day));
CREATE INDEX usage_day ON usage(day);`,
  },
  {
    name: 'cérebro começa vazio: remove os tipos de fábrica que nunca foram usados',
    sql: `
DELETE FROM types WHERE ((name = 'Classe' AND description = 'Categoria de coisas (ex.: FrontEnd, ServicoJava). Playbooks se prendem a classes.') OR (name = 'Repositorio' AND description = 'Repositório de código.') OR (name = 'Workflow' AND description = 'Pipeline de CI/CD (ex.: GitHub Actions).') OR (name = 'Ambiente' AND description = 'Onde o software roda (dev, homologação…).') OR (name = 'Ferramenta' AND description = 'CLI, MCP ou sistema que o Orbi sabe usar.') OR (name = 'Portal' AND description = 'Sistema web operado pelo navegador.') OR (name = 'Playbook' AND description = 'Procedimento aprendido que o Orbi executa.') OR (name = 'Incidente' AND description = 'Algo que deu errado e como foi resolvido.') OR (name = 'Mudanca' AND description = 'Mudança registrada (ex.: GMUD no ServiceNow).') OR (name = 'Historia' AND description = 'Item do board entregue por uma release.') OR (name = 'Pessoa' AND description = 'Quem decide ou aprova algo.'))
  AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.type = types.name);`,
  },
];
