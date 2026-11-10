import type { DatabaseSync } from 'node:sqlite';
import { binaryOf, commandProblems } from './command.ts';
import { CODE_AGENT_TASKS, type CodeAgent, type CodeAgentRunIn, type CodeAgentSource, type CodeAgentTask, type TaskAssignment } from './types.ts';

type Row = Record<string, unknown>;
const toAgent = (r: Row): CodeAgent => ({
  id: String(r.id),
  name: String(r.name),
  binary: String(r.binary),
  command: String(r.command),
  models: JSON.parse(String(r.models ?? '[]')) as string[],
  source: String(r.source) as CodeAgentSource,
  runIn: (String(r.run_in ?? 'window') === 'background' ? 'background' : 'window'),
  lastTest: r.test_at ? { at: String(r.test_at), ok: Number(r.test_ok) === 1, detail: String(r.test_detail ?? '') } : null,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

export interface SaveAgent {
  id: string;
  name: string;
  command: string;
  models?: string[];
  source?: CodeAgentSource;
  runIn?: CodeAgentRunIn;
}

/** Thrown for invalid input: the route answers 400 with the message. */
export class CodeAgentError extends Error {}

/**
 * The coding agents registered on this machine and which one does each task, with which model.
 * ORBI_CODE_AGENT (the old single setting) still works: with nothing registered it is the agent
 * of every task, shown as coming from the .env.
 */
export class CodeAgents {
  constructor(private readonly db: DatabaseSync, private readonly fromEnv: string | null = null) {}

  list(): CodeAgent[] {
    const saved = (this.db.prepare('SELECT * FROM code_agents ORDER BY name').all() as Row[]).map(toAgent);
    const env = this.envAgent();
    return env && !saved.some((a) => a.id === env.id) ? [...saved, env] : saved;
  }

  get(id: string): CodeAgent | undefined {
    const r = this.db.prepare('SELECT * FROM code_agents WHERE id = ?').get(id) as Row | undefined;
    return r ? toAgent(r) : id === 'env' ? this.envAgent() : undefined;
  }

  save(input: SaveAgent): CodeAgent {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(input.id)) throw new CodeAgentError('id em kebab-case, ex.: claude-code');
    if (input.id === 'env') throw new CodeAgentError('o id "env" é do agente do .env');
    const problems = commandProblems(input.command);
    if (problems.length) throw new CodeAgentError(problems.join('; '));
    const models = [...new Set((input.models ?? []).map((m) => m.trim()).filter(Boolean))];
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO code_agents (id, name, binary, command, models, source, run_in, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, binary = excluded.binary, command = excluded.command,
           models = excluded.models, source = excluded.source, run_in = excluded.run_in, updated_at = excluded.updated_at`,
      )
      .run(input.id, input.name.trim() || input.id, binaryOf(input.command), input.command.trim(), JSON.stringify(models), input.source ?? 'manual', input.runIn ?? this.get(input.id)?.runIn ?? 'window', now, now);
    return this.get(input.id)!;
  }

  remove(id: string): boolean {
    this.db.prepare('DELETE FROM code_agent_tasks WHERE agent = ?').run(id);
    return Number(this.db.prepare('DELETE FROM code_agents WHERE id = ?').run(id).changes) > 0;
  }

  recordTest(id: string, result: { ok: boolean; detail: string }): void {
    this.db.prepare('UPDATE code_agents SET test_at = ?, test_ok = ?, test_detail = ? WHERE id = ?').run(new Date().toISOString(), result.ok ? 1 : 0, result.detail.slice(0, 500), id);
  }

  /** Which agent (and model) does a task; null agent clears it. */
  assign(task: CodeAgentTask, agent: string | null, model: string | null = null): void {
    if (!CODE_AGENT_TASKS.includes(task)) throw new CodeAgentError(`tarefa desconhecida: ${task}`);
    if (!agent) {
      this.db.prepare('DELETE FROM code_agent_tasks WHERE task = ?').run(task);
      return;
    }
    if (!this.get(agent)) throw new CodeAgentError(`agente não cadastrado: ${agent}`);
    this.db
      .prepare('INSERT INTO code_agent_tasks (task, agent, model) VALUES (?, ?, ?) ON CONFLICT(task) DO UPDATE SET agent = excluded.agent, model = excluded.model')
      .run(task, agent, model?.trim() || null);
  }

  assignments(): TaskAssignment[] {
    return CODE_AGENT_TASKS.flatMap((task) => {
      const r = this.db.prepare('SELECT * FROM code_agent_tasks WHERE task = ?').get(task) as Row | undefined;
      if (r) return [{ task, agent: String(r.agent), model: r.model ? String(r.model) : null }];
      return this.fromEnv ? [{ task, agent: 'env', model: null }] : [];
    });
  }

  /** The agent and model that do this task now, or null when none is set. */
  forTask(task: CodeAgentTask): { agent: CodeAgent; model: string | null } | null {
    const a = this.assignments().find((x) => x.task === task);
    const agent = a ? this.get(a.agent) : undefined;
    return agent ? { agent, model: a!.model } : null;
  }

  /** Whether any task has an agent: without one, the Orbi hands the diagnosis to whoever asked. */
  available(): boolean {
    return CODE_AGENT_TASKS.some((t) => this.forTask(t));
  }

  /** One line for health and logs: "investigar: Claude Code · haiku; corrigir: Cursor". */
  describe(): string | null {
    const parts = CODE_AGENT_TASKS.flatMap((t) => {
      const f = this.forTask(t);
      return f ? [`${t}: ${f.agent.name}${f.model ? ` · ${f.model}` : ''}`] : [];
    });
    return parts.length ? parts.join('; ') : null;
  }

  private envAgent(): CodeAgent | undefined {
    if (!this.fromEnv) return undefined;
    return { id: 'env', name: `${binaryOf(this.fromEnv)} (do .env)`, binary: binaryOf(this.fromEnv), command: this.fromEnv, models: [], source: 'env', runIn: 'background', lastTest: null, createdAt: '', updatedAt: '' };
  }
}
