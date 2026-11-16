import type { DatabaseSync } from 'node:sqlite';
import { levelState } from './level-state.ts';
import { transaction } from '../../../../db/database.ts';
import type { Level, LevelChange, LevelState, Playbook, PlaybookRun } from '../../../../language/index.ts';
import { type AutonomyEvent, type KnownAction, type LevelRepo } from './repo.ts';
import { decideAction, runDeviations, settleLevel } from './rules.ts';

/**
 * What this context needs from whoever keeps procedures and runs. A procedure's level is a
 * column on the procedure, so `trust` decides it and `procedures` stores it: the port keeps the
 * dependency one-way (documento 26, fase 4a).
 */
export interface ProcedureStore {
  get(name: string): Playbook | undefined;
  setLevel(name: string, state: LevelState): void;
  run(runId: string): PlaybookRun | undefined;
}

/** Autonomy that grows with use: levels, known actions, the events that moved them, settling a run. */
export class Autonomy {
  constructor(
    private readonly db: DatabaseSync,
    private readonly levels: LevelRepo,
    private readonly playbooks: ProcedureStore,
  ) {}

  // ── autonomy that grows with use (domain/levels.ts) ──────────────────────
  /** The developer sets the level or its ceiling (Cérebro, or "Manter em N1"). */
  setPlaybookLevel(name: string, change: { level?: Level; levelMax?: Level }, conversationId: string | null = null): Playbook {
    const pb = this.playbooks.get(name);
    if (!pb) throw new Error(`playbook não encontrado: ${name}`);
    const levelMax = change.levelMax ?? pb.levelMax;
    const level = Math.min(change.level ?? pb.level, levelMax) as Level;
    this.playbooks.setLevel(name, { level, levelMax, levelBy: change.level !== undefined || level !== pb.level ? 'user' : pb.levelBy, cleanStreak: level === pb.level ? pb.cleanStreak : 0 });
    if (level !== pb.level) this.levels.addEvent({ subjectKind: 'playbook', subject: name, from: `N${pb.level}`, to: `N${level}`, reason: 'você mudou', conversationId });
    if (levelMax !== pb.levelMax) this.levels.addEvent({ subjectKind: 'playbook', subject: name, from: `teto N${pb.levelMax}`, to: `teto N${levelMax}`, reason: 'você mudou', conversationId });
    return this.playbooks.get(name)!;
  }

  isKnownAction(playbook: string, fingerprint: string): boolean {
    return this.levels.isKnown(playbook, fingerprint);
  }

  knownActions(playbook: string): KnownAction[] {
    return this.levels.known(playbook);
  }

  autonomyEvents(kind: AutonomyEvent['subjectKind'], subject: string): AutonomyEvent[] {
    return this.levels.events(kind, subject);
  }

  addAutonomyEvent(e: Omit<AutonomyEvent, 'id' | 'createdAt'>): AutonomyEvent {
    return this.levels.addEvent(e);
  }

  /**
   * After a run ends: a clean run teaches its actions and may raise the level; a failure or a
   * denial lowers it. Returns the change (if any), what kept it from counting, and what the
   * playbook now does alone or still asks.
   */
  settleRun(runId: string): { change: LevelChange | null; deviations: string[]; level: Level; alone: string[]; asks: string[] } {
    const run = this.playbooks.run(runId);
    const pb = run && this.playbooks.get(run.playbook);
    if (!run || !pb) throw new Error(`execução não encontrada: ${runId}`);
    const deviations = runDeviations(run);
    const clean = run.status === 'done' && deviations.length === 0;
    const { state, change } = settleLevel(levelState(pb), {
      clean,
      denied: run.deviations.some((d) => d.kind === 'negado'),
      failed: run.status === 'failed',
    });
    transaction(this.db, () => {
      if (clean) this.levels.learn(pb.name, run.actions);
      this.playbooks.setLevel(pb.name, state);
      if (change) this.levels.addEvent({ subjectKind: 'playbook', subject: pb.name, from: `N${change.from}`, to: `N${change.to}`, reason: change.reason, conversationId: run.conversationId });
    });
    const alone: string[] = [];
    const asks: string[] = [];
    for (const k of this.levels.known(pb.name)) {
      if (k.effect === 'leitura') continue;
      (decideAction(state, { known: true, effect: k.effect }) === 'auto' ? alone : asks).push(k.summary);
    }
    return { change, deviations, level: state.level, alone, asks };
  }
}
