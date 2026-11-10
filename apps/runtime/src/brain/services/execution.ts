import { knownProblemsFor, type KnownProblem } from '../domain/knowledge.ts';
import { ulid } from 'ulidx';
import { transaction } from '../../db/database.ts';
import { advanceRun, newRun, recordOutputs } from '../domain/playbooks.ts';
import type { Entity, Playbook, PlaybookRun, ResolvedInput, StepStatus } from '../domain/types.ts';
import { entityProblems, edgeProblems } from '../domain/ontology.ts';
import { fillCitations, resolveInputs, unanswered, type FactLookup } from '../domain/concepts.ts';
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
    let run: PlaybookRun;
    if (pb.inputs?.length) {
      // Over concepts (passo 0): the inputs found among the facts fill their citations now.
      const { resolved } = resolveInputs(pb.inputs, params, this.lookup);
      run = { ...newRun(pb, ulid(), conversationId, params, now(), (text) => fillCitations(text, params, resolved, this.lookup)), resolved };
    } else {
      run = newRun(pb, ulid(), conversationId, params, now());
    }
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

  // ── passo 0: inputs over concepts ──────────────────────────────────────
  /** The facts as a run reads them: types, entities, other names and current relations. */
  readonly lookup: FactLookup = {
    typeOf: (name) => this.p.ontology.get(name),
    entity: (id) => this.p.graphRepo.entity(id),
    named: (type, name) => this.p.graphRepo.named(type, name),
    out: (id) => this.p.graphRepo.neighbors(id, now()).out,
  };

  /** Where a run stands on its inputs: what is still to find, and the citations the facts cannot answer yet. */
  inputState(runId: string): { toResolve: Array<{ input: string; value: string; concept: string; candidates: string[]; howToFind?: string }>; unknown: string[] } {
    const run = this.p.playbookRepo.run(runId);
    const pb = run && this.p.playbookRepo.get(run.playbook);
    if (!run || !pb?.inputs?.length) return { toResolve: [], unknown: [] };
    const { resolved, pending } = resolveInputs(pb.inputs, run.params, this.lookup, run.resolved);
    return {
      toResolve: pending.map((x) => ({
        input: x.input.name,
        value: x.value,
        concept: x.input.concept!,
        candidates: x.candidates,
        ...(this.p.ontology.get(x.input.concept!)?.knows?.achar ? { howToFind: this.p.ontology.get(x.input.concept!)!.knows!.achar } : {}),
      })),
      unknown: unanswered(pb, run.params, resolved, this.lookup).filter((c) => !pending.some((x) => c.split('.')[0] === x.input.name)),
    };
  }

  /**
   * An input of the running procedure found by investigating: it becomes a fact of the input's
   * concept (new, or the name given becomes another name of one that exists), marked as learned
   * in this run, so the developer can take it back. Only facts of a concept that exists; never a
   * type, a property of the concept or the procedure (those go through the learning card).
   */
  resolveInput(
    runId: string,
    inputName: string,
    found: { entity: string; props?: Record<string, unknown>; relations?: Array<{ rel: string; to: string }> },
  ): { run: PlaybookRun; learned: ResolvedInput } {
    const run = this.p.playbookRepo.run(runId);
    if (!run) throw new Error(`execução não encontrada: ${runId}`);
    if (run.status !== 'running' && run.status !== 'waiting') throw new Error('a execução já terminou');
    const pb = this.p.playbookRepo.get(run.playbook)!;
    const input = pb.inputs?.find((i) => i.name === inputName);
    if (!input?.concept) throw new Error(`${pb.name} não tem a entrada ${inputName} com conceito; entradas: ${(pb.inputs ?? []).map((i) => i.name).join(', ') || 'nenhuma'}`);
    const value = run.params[inputName] ?? found.entity;
    const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
    const existing = this.p.graphRepo.entity(found.entity);
    if (existing && existing.type !== input.concept) throw new Error(`${found.entity} é ${existing.type}, não ${input.concept}`);
    let learned: ResolvedInput;
    transaction(this.p.db, () => {
      if (existing) {
        const isAlias = fold(value) !== fold(existing.id) && !(existing.aliases ?? []).some((a) => fold(a) === fold(value));
        if (isAlias) this.p.graphRepo.upsertEntity({ ...existing, aliases: [...(existing.aliases ?? []), value] });
        learned = { value, entity: existing.id, learned: isAlias ? 'alias' : 'known' };
      } else {
        const entity: Omit<Entity, 'updatedAt'> = {
          id: found.entity,
          type: input.concept!,
          props: found.props ?? {},
          body: '',
          aliases: fold(value) === fold(found.entity) ? [] : [value],
          source: `execucao:${run.id}`,
        };
        const problems = entityProblems(entity, this.lookup.typeOf);
        if (problems.length) throw new Error(problems.join('; '));
        this.p.graphRepo.upsertEntity(entity);
        learned = { value, entity: entity.id, learned: 'created' };
      }
      for (const r of found.relations ?? []) {
        const from = this.p.graphRepo.entity(learned!.entity);
        const problems = edgeProblems({ from: learned!.entity, rel: r.rel, to: r.to }, from, this.p.graphRepo.entity(r.to), this.lookup.typeOf);
        if (problems.length) throw new Error(problems.join('; '));
        this.p.graphRepo.insertEdge({ from: learned!.entity, rel: r.rel, to: r.to, attrs: { origem: `execucao:${run.id}` }, validFrom: now(), validTo: null });
      }
    });
    const next = this.refill({ ...run, resolved: { ...run.resolved, [inputName]: learned! } }, pb);
    this.p.playbookRepo.updateRun(next);
    return { run: next, learned: learned! };
  }

  /** Takes back what a run learned about an input: the fact it created, or the other name it added. */
  undoResolved(runId: string, inputName: string): ResolvedInput {
    const run = this.p.playbookRepo.run(runId);
    const res = run?.resolved?.[inputName];
    if (!run || !res) throw new Error(`nada aprendido para ${inputName} nesta execução`);
    if (res.undone || res.learned === 'known') return res;
    transaction(this.p.db, () => {
      if (res.learned === 'created') this.p.graphRepo.deleteEntity(res.entity);
      else {
        const entity = this.p.graphRepo.entity(res.entity);
        if (entity) this.p.graphRepo.upsertEntity({ ...entity, aliases: (entity.aliases ?? []).filter((a) => a !== res.value) });
      }
      this.p.playbookRepo.updateRun({ ...run, resolved: { ...run.resolved, [inputName]: { ...res, undone: true } } });
    });
    return { ...res, undone: true };
  }

  /** What runs learned by themselves (passo 0), newest first: for the "Aprendi" summaries. */
  learnedIn(run: PlaybookRun): Array<{ input: string } & ResolvedInput> {
    return Object.entries(run.resolved ?? {}).filter(([, r]) => r.learned !== 'known').map(([input, r]) => ({ input, ...r }));
  }

  /** The steps' text again, with what the facts answer now; status and notes stay. */
  private refill(run: PlaybookRun, pb: Playbook): PlaybookRun {
    const fill = (text: string) => fillCitations(text, run.params, run.resolved ?? {}, this.lookup);
    const original = new Map(pb.steps.map((s) => [s.id, s]));
    return { ...run, steps: run.steps.map((s) => (original.has(s.id) ? { ...s, label: fill(original.get(s.id)!.label), how: fill(original.get(s.id)!.how) } : s)) };
  }

  runs(limit = 20): PlaybookRun[] {
    return this.p.playbookRepo.runs(limit);
  }

  lastRunIn(conversationId: string): PlaybookRun | undefined {
    return this.p.playbookRepo.lastRunIn(conversationId);
  }
}
