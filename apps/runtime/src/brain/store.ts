import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dump } from 'js-yaml';
import { ulid } from 'ulidx';

/**
 * The brain: one embedded SQLite file, no server. It holds
 *  - the ontology (types, the relations each type allows, gap rules),
 *  - the knowledge graph (entities + temporal edges),
 *  - learned playbooks (procedures Orbi can run again) and their runs,
 *  - proposals waiting for the developer's approval,
 *  - follow-ups Orbi scheduled for itself.
 * `exportMarkdown()` writes a read-only Obsidian view of the graph.
 */

export type Autonomy = 'observe' | 'ask' | 'auto';

export interface OntologyType {
  name: string;
  description: string;
  /** relation name → target type ("*" = any type) */
  relations: Record<string, string>;
  /** relations every entity of this type should have */
  requires: string[];
}

export interface Entity {
  id: string;
  type: string;
  props: Record<string, unknown>;
  body: string;
  updatedAt: string;
}

export interface Edge {
  from: string;
  rel: string;
  to: string;
  attrs: Record<string, unknown>;
  validFrom: string;
  validTo: string | null;
}

export interface PlaybookStep {
  id: string;
  label: string;
  /** How the step is done: which capability and what to check. Free text for the model. */
  how: string;
}

export interface Playbook {
  name: string;
  description: string;
  /** Ontology type or entity the playbook applies to, e.g. "Repositorio" or "classe:FrontEnd". */
  appliesTo: string | null;
  trigger: string;
  autonomy: Autonomy;
  steps: PlaybookStep[];
  instructions: string;
  learnedFrom: string | null;
  uses: number;
  successes: number;
  updatedAt: string;
}

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'waiting' | 'skipped';

export interface PlaybookRun {
  id: string;
  playbook: string;
  conversationId: string;
  status: 'running' | 'done' | 'failed' | 'waiting';
  steps: Array<PlaybookStep & { status: StepStatus; note?: string }>;
  startedAt: string;
  finishedAt: string | null;
}

export type ProposalKind = 'entity' | 'edge' | 'playbook' | 'type';

export interface Proposal {
  id: string;
  kind: ProposalKind;
  payload: Record<string, unknown>;
  reason: string;
  conversationId: string;
  status: 'open' | 'applied' | 'rejected';
  createdAt: string;
}

export interface Gap {
  entity: string;
  type: string;
  missing: string;
}

const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value ?? null);
const parse = <T>(text: unknown, fallback: T): T => (typeof text === 'string' ? (JSON.parse(text) as T) : fallback);

const SCHEMA = `
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
  status TEXT NOT NULL DEFAULT 'scheduled');
`;

/** Base ontology the brain starts with. Everything else is learned. */
export const SEED_TYPES: OntologyType[] = [
  { name: 'Classe', description: 'Categoria de coisas (ex.: FrontEnd, ServicoJava). Playbooks se prendem a classes.', relations: {}, requires: [] },
  { name: 'Repositorio', description: 'Repositório de código.', relations: { eUm: 'Classe', publicaEm: 'Ambiente', registradoEm: 'Portal', temWorkflow: 'Workflow', teve: 'Incidente', dono: 'Pessoa' }, requires: [] },
  { name: 'Workflow', description: 'Pipeline de CI/CD (ex.: GitHub Actions).', relations: { publicaEm: 'Ambiente', gera: '*' }, requires: [] },
  { name: 'Ambiente', description: 'Onde o software roda (dev, homologação…).', relations: { dispara: 'Playbook', logsEm: 'Ferramenta' }, requires: [] },
  { name: 'Ferramenta', description: 'CLI, MCP ou sistema que o Orbi sabe usar.', relations: { exige: 'Ferramenta' }, requires: [] },
  { name: 'Portal', description: 'Sistema web operado pelo navegador.', relations: {}, requires: [] },
  { name: 'Playbook', description: 'Procedimento aprendido que o Orbi executa.', relations: { aplicaA: '*', usa: '*', resolve: 'Incidente' }, requires: [] },
  { name: 'Incidente', description: 'Algo que deu errado e como foi resolvido.', relations: { resolvidoPor: 'Playbook', semelhanteA: 'Incidente', ocorreuEm: '*' }, requires: [] },
  { name: 'Mudanca', description: 'Mudança registrada (ex.: GMUD no ServiceNow).', relations: { entrega: 'Historia', aprovadaPor: 'Pessoa', referente: 'Repositorio' }, requires: [] },
  { name: 'Historia', description: 'Item do board entregue por uma release.', relations: {}, requires: [] },
  { name: 'Pessoa', description: 'Quem decide ou aprova algo.', relations: { substitutaDe: 'Pessoa' }, requires: [] },
];

export class BrainStore {
  readonly db: DatabaseSync;

  constructor(readonly file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM types').get() as { n: number };
    if (count.n === 0) for (const type of SEED_TYPES) this.upsertType(type);
  }

  // ── ontology ────────────────────────────────────────────────────────────
  upsertType(type: OntologyType): void {
    this.db
      .prepare(
        `INSERT INTO types (name, description, relations, requires) VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET description = excluded.description,
           relations = excluded.relations, requires = excluded.requires`,
      )
      .run(type.name, type.description, json(type.relations), json(type.requires));
  }

  types(): OntologyType[] {
    return (this.db.prepare('SELECT * FROM types ORDER BY name').all() as Record<string, unknown>[]).map((r) => ({
      name: String(r.name),
      description: String(r.description),
      relations: parse(r.relations, {}),
      requires: parse(r.requires, []),
    }));
  }

  type(name: string): OntologyType | undefined {
    return this.types().find((t) => t.name === name);
  }

  // ── graph ───────────────────────────────────────────────────────────────
  /** Ontology check for an entity or edge. Returns problems; empty = valid. */
  validateEntity(entity: Pick<Entity, 'id' | 'type'>): string[] {
    const problems: string[] = [];
    if (!/^[\p{L}\p{N}][\p{L}\p{N}._:/-]*$/u.test(entity.id)) problems.push(`id inválido: "${entity.id}"`);
    if (!this.type(entity.type)) problems.push(`tipo desconhecido: ${entity.type}`);
    return problems;
  }

  validateEdge(edge: Pick<Edge, 'from' | 'rel' | 'to'>): string[] {
    const from = this.get(edge.from);
    const to = this.get(edge.to);
    if (!from) return [`origem não existe: ${edge.from}`];
    if (!to) return [`destino não existe: ${edge.to}`];
    const allowed = this.type(from.type)?.relations[edge.rel];
    if (!allowed) return [`ligação "${edge.rel}" não existe para ${from.type}`];
    if (allowed !== '*' && allowed !== to.type) return [`"${edge.rel}" de ${from.type} aponta para ${allowed}, não ${to.type}`];
    return [];
  }

  upsertEntity(entity: Omit<Entity, 'updatedAt'>): Entity {
    const problems = this.validateEntity(entity);
    if (problems.length) throw new Error(problems.join('; '));
    const updatedAt = now();
    this.db
      .prepare(
        `INSERT INTO entities (id, type, props, body, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET type = excluded.type, props = excluded.props,
           body = excluded.body, updated_at = excluded.updated_at`,
      )
      .run(entity.id, entity.type, json(entity.props), entity.body, updatedAt);
    return { ...entity, updatedAt };
  }

  /** Add a fact. Edges are temporal: `validTo` lets "Marina approves until 31/12" expire by itself. */
  addEdge(edge: { from: string; rel: string; to: string; attrs?: Record<string, unknown>; validFrom?: string; validTo?: string | null }): Edge {
    const problems = this.validateEdge(edge);
    if (problems.length) throw new Error(problems.join('; '));
    const row: Edge = {
      from: edge.from,
      rel: edge.rel,
      to: edge.to,
      attrs: edge.attrs ?? {},
      validFrom: edge.validFrom ?? now(),
      validTo: edge.validTo ?? null,
    };
    this.db
      .prepare('INSERT OR REPLACE INTO edges (from_id, rel, to_id, attrs, valid_from, valid_to) VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.from, row.rel, row.to, json(row.attrs), row.validFrom, row.validTo);
    return row;
  }

  get(id: string): Entity | undefined {
    const r = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.toEntity(r) : undefined;
  }

  byType(type: string): Entity[] {
    return (this.db.prepare('SELECT * FROM entities WHERE type = ? ORDER BY id').all(type) as Record<string, unknown>[]).map(
      (r) => this.toEntity(r),
    );
  }

  private toEntity(r: Record<string, unknown>): Entity {
    return {
      id: String(r.id),
      type: String(r.type),
      props: parse(r.props, {}),
      body: String(r.body),
      updatedAt: String(r.updated_at),
    };
  }

  private toEdge(r: Record<string, unknown>): Edge {
    return {
      from: String(r.from_id),
      rel: String(r.rel),
      to: String(r.to_id),
      attrs: parse(r.attrs, {}),
      validFrom: String(r.valid_from),
      validTo: (r.valid_to as string | null) ?? null,
    };
  }

  /** Edges valid at `at` (default: now) touching an entity. */
  neighbors(id: string, options: { rel?: string; at?: string } = {}): { out: Edge[]; in: Edge[] } {
    const at = options.at ?? now();
    const where = `valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)${options.rel ? ' AND rel = ?' : ''}`;
    const args = options.rel ? [at, at, options.rel] : [at, at];
    const out = this.db.prepare(`SELECT * FROM edges WHERE from_id = ? AND ${where}`).all(id, ...args) as Record<string, unknown>[];
    const inn = this.db.prepare(`SELECT * FROM edges WHERE to_id = ? AND ${where}`).all(id, ...args) as Record<string, unknown>[];
    return { out: out.map((r) => this.toEdge(r)), in: inn.map((r) => this.toEdge(r)) };
  }

  /** Every entity reachable from `id` within `depth` hops (recursive CTE, current edges only). */
  reachable(id: string, depth = 2): Array<{ id: string; depth: number }> {
    const at = now();
    return this.db
      .prepare(
        `WITH RECURSIVE walk(id, depth) AS (
           SELECT ?, 0
           UNION
           SELECT CASE WHEN e.from_id = walk.id THEN e.to_id ELSE e.from_id END, walk.depth + 1
           FROM edges e JOIN walk ON (e.from_id = walk.id OR e.to_id = walk.id)
           WHERE walk.depth < ? AND e.valid_from <= ? AND (e.valid_to IS NULL OR e.valid_to >= ?))
         SELECT id, MIN(depth) AS depth FROM walk WHERE id != ? GROUP BY id ORDER BY depth, id`,
      )
      .all(id, depth, at, at, id) as Array<{ id: string; depth: number }>;
  }

  search(text: string, limit = 10): Entity[] {
    const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const clause = terms.map(() => `LOWER(id || ' ' || type || ' ' || props || ' ' || body) LIKE ?`).join(' OR ');
    const rows = this.db.prepare(`SELECT * FROM entities WHERE ${clause}`).all(...terms.map((t) => `%${t}%`)) as Record<string, unknown>[];
    return rows
      .map((r) => this.toEntity(r))
      .map((e) => ({ e, score: terms.filter((t) => JSON.stringify(e).toLowerCase().includes(t)).length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.e);
  }

  /** Gap rules: required relations an entity (or its `eUm` classes) lacks. */
  gaps(): Gap[] {
    const gaps: Gap[] = [];
    const classRequires = new Map<string, string[]>();
    for (const cls of this.byType('Classe')) {
      const req = cls.props.requires;
      if (Array.isArray(req)) classRequires.set(cls.id, req.map(String));
    }
    const rows = this.db.prepare('SELECT * FROM entities').all() as Record<string, unknown>[];
    for (const entity of rows.map((r) => this.toEntity(r))) {
      const { out } = this.neighbors(entity.id);
      const required = new Set(this.type(entity.type)?.requires ?? []);
      for (const edge of out.filter((e) => e.rel === 'eUm')) {
        for (const r of classRequires.get(edge.to) ?? []) required.add(r);
      }
      for (const rel of required) {
        if (!out.some((e) => e.rel === rel)) gaps.push({ entity: entity.id, type: entity.type, missing: rel });
      }
    }
    return gaps;
  }

  graph(): { types: OntologyType[]; entities: Entity[]; edges: Edge[] } {
    return {
      types: this.types(),
      entities: (this.db.prepare('SELECT * FROM entities ORDER BY type, id').all() as Record<string, unknown>[]).map((r) => this.toEntity(r)),
      edges: (this.db.prepare('SELECT * FROM edges ORDER BY valid_from').all() as Record<string, unknown>[]).map((r) => this.toEdge(r)),
    };
  }

  // ── playbooks ───────────────────────────────────────────────────────────
  savePlaybook(pb: Omit<Playbook, 'uses' | 'successes' | 'updatedAt'>): Playbook {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(pb.name)) throw new Error(`nome de playbook inválido: ${pb.name}`);
    if (!pb.steps.length) throw new Error('playbook sem passos');
    const existing = this.playbook(pb.name);
    const updatedAt = now();
    this.db
      .prepare(
        `INSERT INTO playbooks (name, description, applies_to, trigger, autonomy, steps, instructions, learned_from, uses, successes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET description = excluded.description, applies_to = excluded.applies_to,
           trigger = excluded.trigger, autonomy = excluded.autonomy, steps = excluded.steps,
           instructions = excluded.instructions, learned_from = excluded.learned_from, updated_at = excluded.updated_at`,
      )
      .run(pb.name, pb.description, pb.appliesTo, pb.trigger, pb.autonomy, json(pb.steps), pb.instructions, pb.learnedFrom,
        existing?.uses ?? 0, existing?.successes ?? 0, updatedAt);
    return this.playbook(pb.name)!;
  }

  setPlaybookAutonomy(name: string, autonomy: Autonomy): Playbook {
    if (!this.playbook(name)) throw new Error(`playbook não encontrado: ${name}`);
    this.db.prepare('UPDATE playbooks SET autonomy = ?, updated_at = ? WHERE name = ?').run(autonomy, now(), name);
    return this.playbook(name)!;
  }

  playbook(name: string): Playbook | undefined {
    const r = this.db.prepare('SELECT * FROM playbooks WHERE name = ?').get(name) as Record<string, unknown> | undefined;
    return r ? this.toPlaybook(r) : undefined;
  }

  playbooks(): Playbook[] {
    return (this.db.prepare('SELECT * FROM playbooks ORDER BY name').all() as Record<string, unknown>[]).map((r) => this.toPlaybook(r));
  }

  private toPlaybook(r: Record<string, unknown>): Playbook {
    return {
      name: String(r.name),
      description: String(r.description),
      appliesTo: (r.applies_to as string | null) ?? null,
      trigger: String(r.trigger),
      autonomy: String(r.autonomy) as Autonomy,
      steps: parse(r.steps, []),
      instructions: String(r.instructions),
      learnedFrom: (r.learned_from as string | null) ?? null,
      uses: Number(r.uses),
      successes: Number(r.successes),
      updatedAt: String(r.updated_at),
    };
  }

  startRun(playbookName: string, conversationId: string, params: Record<string, string> = {}): PlaybookRun {
    const pb = this.playbook(playbookName);
    if (!pb) throw new Error(`playbook não encontrado: ${playbookName}`);
    // Parameters learned as {{name}} are filled in the run's labels (never secrets: those stay references).
    const fill = (text: string) => text.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (all, key: string) => params[key] ?? all);
    const run: PlaybookRun = {
      id: ulid(),
      playbook: pb.name,
      conversationId,
      status: 'running',
      steps: pb.steps.map((s) => ({ ...s, label: fill(s.label), how: fill(s.how), status: 'pending' as StepStatus })),
      startedAt: now(),
      finishedAt: null,
    };
    this.db
      .prepare('INSERT INTO playbook_runs (id, playbook, conversation_id, status, steps, started_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(run.id, run.playbook, conversationId, run.status, json(run.steps), run.startedAt);
    this.db.prepare('UPDATE playbooks SET uses = uses + 1 WHERE name = ?').run(pb.name);
    return run;
  }

  updateRunStep(runId: string, stepId: string, status: StepStatus, note?: string): PlaybookRun {
    const run = this.run(runId);
    if (!run) throw new Error(`execução não encontrada: ${runId}`);
    const step = run.steps.find((s) => s.id === stepId);
    if (!step) throw new Error(`passo não encontrado: ${stepId}`);
    step.status = status;
    if (note !== undefined) step.note = note;
    const allDone = run.steps.every((s) => s.status === 'done' || s.status === 'skipped');
    const anyFailed = run.steps.some((s) => s.status === 'failed');
    const anyWaiting = run.steps.some((s) => s.status === 'waiting');
    run.status = anyFailed ? 'failed' : allDone ? 'done' : anyWaiting ? 'waiting' : 'running';
    run.finishedAt = run.status === 'done' || run.status === 'failed' ? now() : null;
    this.db
      .prepare('UPDATE playbook_runs SET steps = ?, status = ?, finished_at = ? WHERE id = ?')
      .run(json(run.steps), run.status, run.finishedAt, run.id);
    if (run.status === 'done') this.db.prepare('UPDATE playbooks SET successes = successes + 1 WHERE name = ?').run(run.playbook);
    return run;
  }

  run(id: string): PlaybookRun | undefined {
    const r = this.db.prepare('SELECT * FROM playbook_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r) return undefined;
    return {
      id: String(r.id),
      playbook: String(r.playbook),
      conversationId: String(r.conversation_id),
      status: String(r.status) as PlaybookRun['status'],
      steps: parse(r.steps, []),
      startedAt: String(r.started_at),
      finishedAt: (r.finished_at as string | null) ?? null,
    };
  }

  runs(limit = 20): PlaybookRun[] {
    const ids = this.db.prepare('SELECT id FROM playbook_runs ORDER BY started_at DESC LIMIT ?').all(limit) as Array<{ id: string }>;
    return ids.map(({ id }) => this.run(id)!);
  }

  // ── proposals (learning waits for the developer) ────────────────────────
  propose(kind: ProposalKind, payload: Record<string, unknown>, reason: string, conversationId: string): Proposal {
    const problems = this.check(kind, payload);
    if (problems.length) throw new Error(`proposta inválida: ${problems.join('; ')}`);
    const proposal: Proposal = { id: ulid(), kind, payload, reason, conversationId, status: 'open', createdAt: now() };
    this.db
      .prepare('INSERT INTO proposals (id, kind, payload, reason, conversation_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(proposal.id, kind, json(payload), reason, conversationId, 'open', proposal.createdAt);
    return proposal;
  }

  /** Dry-run validation of a proposal against the current ontology. */
  check(kind: ProposalKind, payload: Record<string, unknown>): string[] {
    switch (kind) {
      case 'type':
        return typeof payload.name === 'string' && /^[A-Z][A-Za-z]+$/.test(payload.name) ? [] : ['nome de tipo inválido'];
      case 'entity':
        return this.validateEntity({ id: String(payload.id ?? ''), type: String(payload.type ?? '') });
      case 'edge': {
        // The endpoints may be created by an earlier proposal in the same batch; only check the relation name then.
        const from = this.get(String(payload.from));
        if (!from) return [];
        return this.type(from.type)?.relations[String(payload.rel)] ? [] : [`ligação "${payload.rel}" não existe para ${from.type}`];
      }
      case 'playbook':
        return Array.isArray(payload.steps) && payload.steps.length > 0 ? [] : ['playbook sem passos'];
    }
  }

  proposals(status: Proposal['status'] = 'open'): Proposal[] {
    return (this.db.prepare('SELECT * FROM proposals WHERE status = ? ORDER BY created_at').all(status) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      kind: String(r.kind) as ProposalKind,
      payload: parse(r.payload, {}),
      reason: String(r.reason),
      conversationId: String(r.conversation_id),
      status: String(r.status) as Proposal['status'],
      createdAt: String(r.created_at),
    }));
  }

  /** Apply an approved proposal to the brain. */
  apply(proposalId: string): string {
    const proposal = this.proposals('open').find((p) => p.id === proposalId);
    if (!proposal) throw new Error(`proposta não encontrada ou já decidida: ${proposalId}`);
    const p = proposal.payload;
    let result: string;
    switch (proposal.kind) {
      case 'type':
        this.upsertType({
          name: String(p.name),
          description: String(p.description ?? ''),
          relations: (p.relations as Record<string, string>) ?? {},
          requires: (p.requires as string[]) ?? [],
        });
        result = `tipo ${p.name}`;
        break;
      case 'entity':
        this.upsertEntity({ id: String(p.id), type: String(p.type), props: (p.props as Record<string, unknown>) ?? {}, body: String(p.body ?? '') });
        result = `${p.type} ${p.id}`;
        break;
      case 'edge':
        this.addEdge({
          from: String(p.from),
          rel: String(p.rel),
          to: String(p.to),
          attrs: (p.attrs as Record<string, unknown>) ?? {},
          validFrom: p.validFrom ? String(p.validFrom) : undefined,
          validTo: p.validTo ? String(p.validTo) : null,
        });
        result = `${p.from} —${p.rel}→ ${p.to}`;
        break;
      case 'playbook':
        this.savePlaybook({
          name: String(p.name),
          description: String(p.description ?? ''),
          appliesTo: p.appliesTo ? String(p.appliesTo) : null,
          trigger: String(p.trigger ?? ''),
          autonomy: (p.autonomy as Autonomy) ?? 'ask',
          steps: p.steps as PlaybookStep[],
          instructions: String(p.instructions ?? ''),
          learnedFrom: proposal.conversationId || null,
        });
        result = `playbook ${p.name}`;
        break;
    }
    this.db.prepare("UPDATE proposals SET status = 'applied' WHERE id = ?").run(proposalId);
    return result;
  }

  reject(proposalId: string): void {
    this.db.prepare("UPDATE proposals SET status = 'rejected' WHERE id = ? AND status = 'open'").run(proposalId);
  }

  // ── follow-ups (Orbi wakes itself up later) ────────────────────────────
  scheduleFollowup(conversationId: string, dueAt: string, note: string): string {
    const id = ulid();
    this.db.prepare('INSERT INTO followups (id, conversation_id, due_at, note) VALUES (?, ?, ?, ?)').run(id, conversationId, dueAt, note);
    return id;
  }

  /** Claim follow-ups due at `at`; each is returned once. */
  claimDueFollowups(at = now()): Array<{ id: string; conversationId: string; note: string; dueAt: string }> {
    const rows = this.db
      .prepare("SELECT * FROM followups WHERE status = 'scheduled' AND due_at <= ? ORDER BY due_at")
      .all(at) as Record<string, unknown>[];
    const claim = this.db.prepare("UPDATE followups SET status = 'fired' WHERE id = ? AND status = 'scheduled'");
    return rows
      .filter((r) => Number(claim.run(String(r.id)).changes) === 1)
      .map((r) => ({ id: String(r.id), conversationId: String(r.conversation_id), note: String(r.note), dueAt: String(r.due_at) }));
  }

  stats(): { entities: number; edges: number; playbooks: number; openProposals: number; types: number } {
    const n = (sql: string) => Number((this.db.prepare(sql).get() as { n: number }).n);
    return {
      entities: n('SELECT COUNT(*) AS n FROM entities'),
      edges: n("SELECT COUNT(*) AS n FROM edges WHERE valid_to IS NULL OR valid_to >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"),
      playbooks: n('SELECT COUNT(*) AS n FROM playbooks'),
      openProposals: n("SELECT COUNT(*) AS n FROM proposals WHERE status = 'open'"),
      types: n('SELECT COUNT(*) AS n FROM types'),
    };
  }

  // ── export ──────────────────────────────────────────────────────────────
  /** Write a read-only Markdown view (one note per entity and playbook) for Obsidian. */
  exportMarkdown(dir: string): number {
    let count = 0;
    for (const entity of this.graph().entities) {
      const { out } = this.neighbors(entity.id);
      const links: Record<string, string[]> = {};
      for (const e of out) (links[e.rel] ??= []).push(`[[${e.to}]]`);
      const front = { tipo: entity.type, id: entity.id, ...entity.props, ...links };
      const path = join(dir, entity.type.toLowerCase(), `${entity.id.replace(/[/:]/g, '_')}.md`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `---\n${dump(front).trimEnd()}\n---\n${entity.body}\n`);
      count++;
    }
    for (const pb of this.playbooks()) {
      const path = join(dir, 'playbooks', pb.name, 'SKILL.md');
      mkdirSync(dirname(path), { recursive: true });
      const front = { name: pb.name, description: pb.description, aplicaA: pb.appliesTo, autonomia: pb.autonomy, gatilho: pb.trigger };
      const steps = pb.steps.map((s, i) => `${i + 1}. **${s.label}** — ${s.how}`).join('\n');
      writeFileSync(path, `---\n${dump(front).trimEnd()}\n---\n${pb.instructions}\n\n## Passos\n\n${steps}\n`);
      count++;
    }
    return count;
  }
}
