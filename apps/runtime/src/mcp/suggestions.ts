import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';
import type { BrainStore, Playbook, PlaybookStep } from '../brain/store.ts';
import { transaction } from '../db/database.ts';

/**
 * Procedures coding agents suggest (orbi_teach). They never go straight into
 * the brain: they wait here until the developer accepts or rejects them on the
 * Agentes screen. The same suggestion sent again (same name, still open) is
 * counted instead of duplicated — something several agents keep suggesting is
 * a good sign that it is really repetitive.
 */
export interface AgentSuggestion {
  id: string;
  name: string;
  description: string;
  trigger: string;
  steps: PlaybookStep[];
  instructions: string;
  why: string;
  /** Names of the agents that suggested it. */
  agents: string[];
  count: number;
  /** Known procedures that look like it, found when it arrived. */
  similarTo: string[];
  status: 'open' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export type NewSuggestion = Pick<AgentSuggestion, 'name' | 'description' | 'trigger' | 'steps' | 'instructions' | 'why' | 'similarTo'>;

type Row = Record<string, unknown>;
const toSuggestion = (r: Row): AgentSuggestion => ({
  id: String(r.id),
  name: String(r.name),
  description: String(r.description),
  trigger: String(r.trigger),
  steps: JSON.parse(String(r.steps)) as PlaybookStep[],
  instructions: String(r.instructions),
  why: String(r.why),
  agents: JSON.parse(String(r.agents)) as string[],
  count: Number(r.count),
  similarTo: JSON.parse(String(r.similar_to)) as string[],
  status: String(r.status) as AgentSuggestion['status'],
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

export class AgentSuggestions {
  constructor(private readonly db: DatabaseSync) {}

  /** Adds a suggestion, or counts it again if the same one is still open. */
  add(agent: string, s: NewSuggestion): { suggestion: AgentSuggestion; repeated: boolean } {
    const now = new Date().toISOString();
    const open = this.db.prepare("SELECT * FROM agent_suggestions WHERE name = ? AND status = 'open'").get(s.name) as Row | undefined;
    if (open) {
      const current = toSuggestion(open);
      const agents = current.agents.includes(agent) ? current.agents : [...current.agents, agent];
      const similarTo = [...new Set([...current.similarTo, ...s.similarTo])];
      // The latest version wins: an agent that tried again usually knows more.
      this.db
        .prepare('UPDATE agent_suggestions SET description = ?, trigger = ?, steps = ?, instructions = ?, why = ?, agents = ?, similar_to = ?, count = count + 1, updated_at = ? WHERE id = ?')
        .run(s.description, s.trigger, JSON.stringify(s.steps), s.instructions, s.why, JSON.stringify(agents), JSON.stringify(similarTo), now, current.id);
      return { suggestion: this.get(current.id)!, repeated: true };
    }
    const id = `sug_${ulid().toLowerCase()}`;
    this.db
      .prepare('INSERT INTO agent_suggestions (id, name, description, trigger, steps, instructions, why, agents, similar_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, s.name, s.description, s.trigger, JSON.stringify(s.steps), s.instructions, s.why, JSON.stringify([agent]), JSON.stringify(s.similarTo), now, now);
    return { suggestion: this.get(id)!, repeated: false };
  }

  get(id: string): AgentSuggestion | undefined {
    const r = this.db.prepare('SELECT * FROM agent_suggestions WHERE id = ?').get(id) as Row | undefined;
    return r ? toSuggestion(r) : undefined;
  }

  list(filter: { status?: AgentSuggestion['status'] } = {}): AgentSuggestion[] {
    const rows = filter.status
      ? this.db.prepare('SELECT * FROM agent_suggestions WHERE status = ? ORDER BY count DESC, updated_at DESC').all(filter.status)
      : this.db.prepare('SELECT * FROM agent_suggestions ORDER BY status, count DESC, updated_at DESC').all();
    return (rows as Row[]).map(toSuggestion);
  }

  /**
   * The developer accepts: the suggestion becomes a procedure that asks before
   * acting, whatever the agent proposed. As a variation, it points to its base.
   */
  accept(id: string, brain: BrainStore, options: { variationOf?: string } = {}): Playbook {
    const s = this.open(id);
    if (brain.playbook(s.name)) throw new Error(`já existe um procedimento chamado ${s.name}: rejeite a sugestão ou edite o que existe`);
    let saved: Playbook | undefined;
    transaction(this.db, () => {
      saved = brain.savePlaybook({
        name: s.name,
        description: s.description,
        trigger: s.trigger,
        appliesTo: null,
        autonomy: 'ask',
        steps: s.steps,
        instructions: s.instructions,
        learnedFrom: `agente: ${s.agents.join(', ')}`,
        variationOf: options.variationOf ?? null,
      });
      this.setStatus(s.id, 'accepted');
    });
    return saved!;
  }

  reject(id: string): AgentSuggestion {
    this.setStatus(this.open(id).id, 'rejected');
    return this.get(id)!;
  }

  countOpen(): number {
    return Number((this.db.prepare("SELECT count(*) AS n FROM agent_suggestions WHERE status = 'open'").get() as Row).n);
  }

  private open(id: string): AgentSuggestion {
    const s = this.get(id);
    if (!s) throw Object.assign(new Error('sugestão não encontrada'), { code: 'not_found' });
    if (s.status !== 'open') throw Object.assign(new Error(`esta sugestão já foi decidida (${s.status})`), { code: 'conflict' });
    return s;
  }

  private setStatus(id: string, status: AgentSuggestion['status']) {
    this.db.prepare('UPDATE agent_suggestions SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
  }
}
