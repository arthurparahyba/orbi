import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';

export type PipelineRunStatus = 'running' | 'waiting' | 'done' | 'cancelled';

export interface PipelineRunStage {
  id: string;
  label: string;
  /** Which procedure ran (the branch taken); null until the stage starts. */
  playbook: string | null;
  runId: string | null;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  params: Record<string, string>;
  /** Where each parameter came from ("entrada.repo", "dev.versao"), shown on the passage card. */
  from: Record<string, string>;
  outputs: Record<string, string>;
  startedAt: string | null;
  finishedAt: string | null;
}

/** What the run waits for from the developer. */
export interface PipelineWaiting {
  kind: 'passage' | 'failure' | 'params';
  /** The stage it is about (the next one for a passage; the failed or starting one otherwise). */
  stage: string;
  missing?: string[];
  message?: string;
  inboxId?: string;
}

/** One esteira running: a delivery, in one conversation. */
export interface PipelineRun {
  id: string;
  pipeline: string;
  conversationId: string;
  status: PipelineRunStatus;
  /** Stage id where to stop; null runs to the end. */
  destination: string | null;
  inputs: Record<string, string>;
  stages: PipelineRunStage[];
  current: number;
  /** "user" or "agent:<name>". */
  requestedBy: string;
  skipQuestions: boolean;
  waiting: PipelineWaiting | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

type Row = Record<string, unknown>;
const parse = <T>(v: unknown, fallback: T): T => {
  try {
    return v == null ? fallback : (JSON.parse(String(v)) as T);
  } catch {
    return fallback;
  }
};
const toRun = (r: Row): PipelineRun => ({
  id: String(r.id),
  pipeline: String(r.pipeline),
  conversationId: String(r.conversation_id),
  status: String(r.status) as PipelineRunStatus,
  destination: r.destination ? String(r.destination) : null,
  inputs: parse(r.inputs, {}),
  stages: parse(r.stages, []),
  current: Number(r.current),
  requestedBy: String(r.requested_by),
  skipQuestions: Number(r.skip_questions) === 1,
  waiting: parse(r.waiting, null),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  finishedAt: r.finished_at ? String(r.finished_at) : null,
});

/** Esteiras running and finished (app state; the definitions are in the brain). */
export class PipelineRuns {
  constructor(private readonly db: DatabaseSync) {}

  create(run: Omit<PipelineRun, 'id' | 'createdAt' | 'updatedAt' | 'finishedAt'>): PipelineRun {
    const id = `est_${ulid().toLowerCase()}`;
    const at = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO pipeline_runs (id, pipeline, conversation_id, status, destination, inputs, stages, current, requested_by, skip_questions, waiting, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, run.pipeline, run.conversationId, run.status, run.destination, JSON.stringify(run.inputs), JSON.stringify(run.stages), run.current, run.requestedBy, run.skipQuestions ? 1 : 0, run.waiting ? JSON.stringify(run.waiting) : null, at, at);
    return this.get(id)!;
  }

  save(run: PipelineRun): PipelineRun {
    const at = new Date().toISOString();
    const final = run.status === 'done' || run.status === 'cancelled';
    this.db
      .prepare('UPDATE pipeline_runs SET status = ?, stages = ?, current = ?, waiting = ?, updated_at = ?, finished_at = ? WHERE id = ?')
      .run(run.status, JSON.stringify(run.stages), run.current, run.waiting ? JSON.stringify(run.waiting) : null, at, final ? (run.finishedAt ?? at) : null, run.id);
    return this.get(run.id)!;
  }

  get(id: string): PipelineRun | undefined {
    const r = this.db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(id) as Row | undefined;
    return r ? toRun(r) : undefined;
  }

  /** The esteira a conversation is delivering (the latest one). */
  inConversation(conversationId: string): PipelineRun | undefined {
    const r = this.db.prepare('SELECT * FROM pipeline_runs WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(conversationId) as Row | undefined;
    return r ? toRun(r) : undefined;
  }

  byPlaybookRun(runId: string): PipelineRun | undefined {
    const r = this.db.prepare('SELECT * FROM pipeline_runs WHERE stages LIKE ? ORDER BY created_at DESC LIMIT 1').get(`%"runId":"${runId}"%`) as Row | undefined;
    return r ? toRun(r) : undefined;
  }

  list(filter: { active?: boolean; limit?: number } = {}): PipelineRun[] {
    const rows = filter.active
      ? this.db.prepare("SELECT * FROM pipeline_runs WHERE status IN ('running', 'waiting') ORDER BY updated_at DESC").all()
      : this.db.prepare('SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT ?').all(filter.limit ?? 100);
    return (rows as Row[]).map(toRun);
  }
}
