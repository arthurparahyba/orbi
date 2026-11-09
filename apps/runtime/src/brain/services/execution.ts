import { knownProblemsFor, type KnownProblem } from '../domain/knowledge.ts';
import { ulid } from 'ulidx';
import { transaction } from '../../db/database.ts';
import { advanceRun, newRun, recordOutputs } from '../domain/playbooks.ts';
import type { PlaybookRun, StepStatus } from '../domain/types.ts';
import { type Deviation, type RunAction } from '../domain/levels.ts';
import { now } from '../repo/rows.ts';
import type { BrainParts } from './parts.ts';
import type { BrainStore } from '../store.ts';

/** What happened in each run: steps, actions, deviations, command attempts, review marks. */
export class Execution {
  constructor(private readonly p: BrainParts, private readonly brain: BrainStore) {}

  /** An action a run carried out (the gate calls it after running). */
  recordRunAction(runId: string, action: RunAction): void {
    const run = this.p.playbookRepo.run(runId);
    if (!run || run.actions.some((a) => a.fingerprint === action.fingerprint)) return;
    this.p.playbookRepo.setRunTrail(runId, [...run.actions, action], run.deviations);
  }

  /** Something went off the path in a run: a tool failed, an action was denied. */
  addRunDeviation(runId: string, deviation: Omit<Deviation, 'at'>): void {
    const run = this.p.playbookRepo.run(runId);
    if (!run) return;
    const last = run.deviations.at(-1);
    if (last && last.detail === deviation.detail && last.step === (deviation.step ?? null)) return; // the same failure, reported twice
    this.p.playbookRepo.setRunTrail(runId, run.actions, [...run.deviations, { ...deviation, step: deviation.step ?? null, at: now() }]);
  }

  /**
   * A tool that failed in a step and then worked in the same step: the slip was fixed on the
   * spot. It stays in the trail, marked, but is not a problem of the procedure (domain/levels.ts).
   */
  recoverRunDeviation(runId: string, tool: string, step: string | null): void {
    const run = this.p.playbookRepo.run(runId);
    if (!run) return;
    let changed = false;
    const deviations = run.deviations.map((d) => {
      if (d.kind !== 'falha' || d.recovered || d.tool !== tool || (d.step ?? null) !== step) return d;
      changed = true;
      return { ...d, recovered: true };
    });
    if (changed) this.p.playbookRepo.setRunTrail(runId, run.actions, deviations);
  }

  /**
   * A command that ran inside a procedure: failed (it goes to the trail as `comando`) or worked
   * (an earlier failure of the same command in this step was got past: it becomes knowledge).
   */
  noteCommand(conversationId: string, c: { command: string; exitCode: number | null; error: string; known: boolean }): void {
    const run = this.openRunIn(conversationId);
    if (!run) return;
    const step = run.steps.find((x) => x.status === 'running' || x.status === 'waiting') ?? run.steps.find((x) => x.status === 'pending') ?? null;
    const stepId = step?.id ?? null;
    if (c.exitCode !== 0) {
      this.addRunDeviation(run.id, { kind: 'comando', command: c.command, known: c.known, detail: `saiu com ${c.exitCode ?? 'tempo esgotado'}: ${c.error.slice(-300)}`, tool: 'comando', step: stepId });
      return;
    }
    let changed = false;
    const deviations = run.deviations.map((d) => {
      if (d.kind !== 'comando' || d.recovered || d.command !== c.command || (d.step ?? null) !== stepId) return d;
      changed = true;
      return { ...d, recovered: true };
    });
    if (changed) this.p.playbookRepo.setRunTrail(run.id, run.actions, deviations);
  }

  /** Known problems of the brain that an error looks like (domain/knowledge.ts). */
  knownProblems(errorText: string, limit = 3): KnownProblem[] {
    if (!errorText.trim()) return [];
    return knownProblemsFor(errorText, this.brain.search(errorText, 20), limit);
  }

  /** The run still going on in a conversation, if any. */
  openRunIn(conversationId: string): PlaybookRun | undefined {
    const run = this.p.playbookRepo.lastRunIn(conversationId);
    return run && (run.status === 'running' || run.status === 'waiting') ? run : undefined;
  }

  /**
   * Where a tool failure belongs: the run going on, or the one that just ended and was not
   * reviewed yet (tools called in parallel report after the step that closed the run).
   */
  runForFailureIn(conversationId: string): PlaybookRun | undefined {
    return this.openRunIn(conversationId) ?? this.p.playbookRepo.unreviewedIn(conversationId).at(-1);
  }

  openUnreviewedRunsIn(conversationId: string): PlaybookRun[] {
    return this.p.playbookRepo.openUnreviewedIn(conversationId);
  }

  unreviewedRunsIn(conversationId: string): PlaybookRun[] {
    return this.p.playbookRepo.unreviewedIn(conversationId);
  }

  markReviewed(runId: string): void {
    this.p.playbookRepo.markReviewed(runId);
  }

  startRun(playbookName: string, conversationId: string, params: Record<string, string> = {}): PlaybookRun {
    const pb = this.p.playbookRepo.get(playbookName);
    if (!pb) throw new Error(`playbook não encontrado: ${playbookName}`);
    const run = newRun(pb, ulid(), conversationId, params, now());
    transaction(this.p.db, () => {
      this.p.playbookRepo.insertRun(run);
      this.p.playbookRepo.countUse(pb.name);
    });
    return run;
  }

  updateRunStep(runId: string, stepId: string, status: StepStatus, note?: string, outputs?: Record<string, string>): PlaybookRun {
    const current = this.p.playbookRepo.run(runId);
    if (!current) throw new Error(`execução não encontrada: ${runId}`);
    let run = advanceRun(current, stepId, status, note, now());
    if (outputs && Object.keys(outputs).length) run = recordOutputs(run, this.p.playbookRepo.get(run.playbook)?.outputs ?? [], outputs);
    transaction(this.p.db, () => {
      this.p.playbookRepo.updateRun(run);
      if (run.status === 'done' && current.status !== 'done') this.p.playbookRepo.countSuccess(run.playbook);
    });
    return run;
  }

  run(id: string): PlaybookRun | undefined {
    return this.p.playbookRepo.run(id);
  }

  runs(limit = 20): PlaybookRun[] {
    return this.p.playbookRepo.runs(limit);
  }

  lastRunIn(conversationId: string): PlaybookRun | undefined {
    return this.p.playbookRepo.lastRunIn(conversationId);
  }
}
