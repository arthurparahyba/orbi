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
];
