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
  {
    name: 'playbook pode ser variação de outro',
    sql: `ALTER TABLE playbooks ADD COLUMN variation_of TEXT;`,
  },
  {
    name: 'pendência guarda a resposta escolhida',
    sql: `ALTER TABLE inbox_items ADD COLUMN answer TEXT;`,
  },
  {
    name: 'índice de busca (FTS5, sem acento) para playbooks e entidades',
    sql: `
CREATE VIRTUAL TABLE playbooks_fts USING fts5(key UNINDEXED, name, description, trigger, applies, steps, tokenize = 'unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE entities_fts USING fts5(key UNINDEXED, id, type, props, body, tokenize = 'unicode61 remove_diacritics 2');
CREATE TRIGGER playbooks_fts_ai AFTER INSERT ON playbooks BEGIN
  INSERT INTO playbooks_fts (key, name, description, trigger, applies, steps)
  VALUES (NEW.name, NEW.name, NEW.description, NEW.trigger, COALESCE(NEW.applies_to, ''), (SELECT COALESCE(group_concat(json_extract(value, '$.label') || ' ' || json_extract(value, '$.how'), ' '), '') FROM json_each(NEW.steps)));
END;
CREATE TRIGGER playbooks_fts_au AFTER UPDATE ON playbooks BEGIN
  DELETE FROM playbooks_fts WHERE key = OLD.name;
  INSERT INTO playbooks_fts (key, name, description, trigger, applies, steps)
  VALUES (NEW.name, NEW.name, NEW.description, NEW.trigger, COALESCE(NEW.applies_to, ''), (SELECT COALESCE(group_concat(json_extract(value, '$.label') || ' ' || json_extract(value, '$.how'), ' '), '') FROM json_each(NEW.steps)));
END;
CREATE TRIGGER playbooks_fts_ad AFTER DELETE ON playbooks BEGIN
  DELETE FROM playbooks_fts WHERE key = OLD.name;
END;
CREATE TRIGGER entities_fts_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts (key, id, type, props, body) VALUES (NEW.id, NEW.id, NEW.type, NEW.props, NEW.body);
END;
CREATE TRIGGER entities_fts_au AFTER UPDATE ON entities BEGIN
  DELETE FROM entities_fts WHERE key = OLD.id;
  INSERT INTO entities_fts (key, id, type, props, body) VALUES (NEW.id, NEW.id, NEW.type, NEW.props, NEW.body);
END;
CREATE TRIGGER entities_fts_ad AFTER DELETE ON entities BEGIN
  DELETE FROM entities_fts WHERE key = OLD.id;
END;
INSERT INTO playbooks_fts (key, name, description, trigger, applies, steps)
  SELECT name, name, description, trigger, COALESCE(applies_to, ''),
    (SELECT COALESCE(group_concat(json_extract(value, '$.label') || ' ' || json_extract(value, '$.how'), ' '), '') FROM json_each(playbooks.steps))
  FROM playbooks;
INSERT INTO entities_fts (key, id, type, props, body) SELECT id, id, type, props, body FROM entities;`,
  },
  {
    name: 'agentes de código pelo MCP: conexões, pedidos e sugestões',
    sql: `
CREATE TABLE agent_clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  can_delegate INTEGER NOT NULL DEFAULT 1, can_teach INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, last_seen_at TEXT, revoked_at TEXT);
CREATE TABLE agent_requests (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, conversation_id TEXT NOT NULL UNIQUE, task TEXT NOT NULL,
  procedure TEXT, context TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'running',
  summary TEXT, links TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, finished_at TEXT);
CREATE INDEX agent_requests_created ON agent_requests(created_at);
CREATE TABLE agent_suggestions (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '', why TEXT NOT NULL DEFAULT '',
  agents TEXT NOT NULL DEFAULT '[]', count INTEGER NOT NULL DEFAULT 1, similar_to TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX agent_suggestions_status ON agent_suggestions(status, updated_at);`,
  },
  {
    name: 'conversas apagadas: some da lista na hora; o histórico do Flue sai na próxima partida',
    sql: `CREATE TABLE deleted_conversations (id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL, purged_at TEXT);`,
  },
  {
    name: 'o que cada procedimento entrega, e o que cada execução recebeu e entregou',
    sql: `
ALTER TABLE playbooks ADD COLUMN outputs TEXT NOT NULL DEFAULT '[]';
ALTER TABLE playbook_runs ADD COLUMN params TEXT NOT NULL DEFAULT '{}';
ALTER TABLE playbook_runs ADD COLUMN outputs TEXT NOT NULL DEFAULT '{}';`,
  },
  {
    name: 'esteiras: procedimentos em sequência e as entregas rodando',
    sql: `
CREATE TABLE pipelines (
  name TEXT PRIMARY KEY, description TEXT NOT NULL DEFAULT '', inputs TEXT NOT NULL DEFAULT '[]',
  stages TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE pipeline_runs (
  id TEXT PRIMARY KEY, pipeline TEXT NOT NULL, conversation_id TEXT NOT NULL, status TEXT NOT NULL,
  destination TEXT, inputs TEXT NOT NULL DEFAULT '{}', stages TEXT NOT NULL, current INTEGER NOT NULL DEFAULT 0,
  requested_by TEXT NOT NULL DEFAULT 'user', skip_questions INTEGER NOT NULL DEFAULT 0, waiting TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT);
CREATE INDEX pipeline_runs_conversation ON pipeline_runs(conversation_id);
CREATE INDEX pipeline_runs_status ON pipeline_runs(status, updated_at);`,
  },
  {
    name: 'agentes: permissões de esteira (rodar; pular perguntas de passagem), desligadas por padrão',
    sql: `
ALTER TABLE agent_clients ADD COLUMN can_run_pipelines INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_clients ADD COLUMN can_skip_passages INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_requests ADD COLUMN pipeline TEXT;`,
  },
];
