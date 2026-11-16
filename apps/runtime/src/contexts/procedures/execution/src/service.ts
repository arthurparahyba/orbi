import { knownProblemsFor, type KnownProblem } from '../../../knowledge/index.ts';
import { ulid } from 'ulidx';
import { transaction } from '../../../../db/database.ts';
import { advanceRun, newRun, recordOutputs } from '../../definition/src/playbooks.ts';
import type { Entity, Playbook, PlaybookRun, ResolvedInput, StepStatus } from '../../../../language/index.ts';
import { entityProblems, edgeProblems } from '../../../knowledge/index.ts';
import { fillCitations, readiness, resolveInputs, type FactLookup, type ReadinessItem } from '../../definition/src/concepts.ts';
import { agreementProblems, finishRehearsal, newRehearsal, rehearsalStep, type Agreement } from '../../rehearsal/src/rehearsal.ts';
import { type Deviation, type RunAction } from '../../../../language/index.ts';
import { now } from '../../../../db/rows.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { PlaybookRepo } from '../../definition/src/repo.ts';
import type { ProofRepo } from '../../proofs/src/repo.ts';
import type { FactsForRun } from '../../../knowledge/index.ts';

/** What a run needs: its own storage, and the narrow door into `knowledge` (documento 22). */
export interface ExecutionDeps {
  db: DatabaseSync;
  playbooks: PlaybookRepo;
  proofs: ProofRepo;
  facts: FactsForRun;
}

/** What happened in each run: steps, actions, deviations, command attempts, review marks. */
export class Execution {
  constructor(private readonly d: ExecutionDeps) {}

  /** An action a run carried out (the gate calls it after running). */
  recordRunAction(runId: string, action: RunAction): void {
    const run = this.d.playbooks.run(runId);
    if (!run || run.actions.some((a) => a.fingerprint === action.fingerprint)) return;
    this.d.playbooks.setRunTrail(runId, [...run.actions, action], run.deviations);
  }

  /** Something went off the path in a run: a tool failed, an action was denied. */
  addRunDeviation(runId: string, deviation: Omit<Deviation, 'at'>): void {
    const run = this.d.playbooks.run(runId);
    if (!run) return;
    const last = run.deviations.at(-1);
    if (last && last.detail === deviation.detail && last.step === (deviation.step ?? null)) return; // the same failure, reported twice
    this.d.playbooks.setRunTrail(runId, run.actions, [...run.deviations, { ...deviation, step: deviation.step ?? null, at: now() }]);
  }

  /**
   * A tool that failed in a step and then worked in the same step: the slip was fixed on the
   * spot. It stays in the trail, marked, but is not a problem of the procedure (domain/levels.ts).
   */
  recoverRunDeviation(runId: string, tool: string, step: string | null): void {
    const run = this.d.playbooks.run(runId);
    if (!run) return;
    let changed = false;
    const deviations = run.deviations.map((d) => {
      if (d.kind !== 'falha' || d.recovered || d.tool !== tool || (d.step ?? null) !== step) return d;
      changed = true;
      return { ...d, recovered: true };
    });
    if (changed) this.d.playbooks.setRunTrail(runId, run.actions, deviations);
  }

  /**
   * A command that ran inside a procedure: failed (it goes to the trail as `comando`) or worked
   * (an earlier failure of the same command in this step was got past: it becomes knowledge).
   */
  noteCommand(conversationId: string, c: { command: string; exitCode: number | null; error: string; known: boolean; problem?: string }): void {
    const run = this.openRunIn(conversationId);
    if (!run) return;
    const step = run.steps.find((x) => x.status === 'running' || x.status === 'waiting') ?? run.steps.find((x) => x.status === 'pending') ?? null;
    const stepId = step?.id ?? null;
    if (c.exitCode !== 0) {
      this.addRunDeviation(run.id, { kind: 'comando', command: c.command, known: c.known, ...(c.problem ? { problem: c.problem } : {}), detail: `saiu com ${c.exitCode ?? 'tempo esgotado'}: ${c.error.slice(-300)}`, tool: 'comando', step: stepId });
      return;
    }
    let changed = false;
    const deviations = run.deviations.map((d) => {
      if (d.kind !== 'comando' || d.recovered || d.command !== c.command || (d.step ?? null) !== stepId) return d;
      changed = true;
      return { ...d, recovered: true };
    });
    if (changed) this.d.playbooks.setRunTrail(run.id, run.actions, deviations);
  }

  /** Known problems of the brain that an error looks like (domain/knowledge.ts). */
  knownProblems(errorText: string, limit = 3): KnownProblem[] {
    if (!errorText.trim()) return [];
    return knownProblemsFor(errorText, this.d.facts.search(errorText, 20), limit);
  }

  /** The run still going on in a conversation, if any. */
  openRunIn(conversationId: string): PlaybookRun | undefined {
    const run = this.d.playbooks.lastRunIn(conversationId);
    return run && (run.status === 'running' || run.status === 'waiting') ? run : undefined;
  }

  /**
   * Where a tool failure belongs: the run going on, or the one that just ended and was not
   * reviewed yet (tools called in parallel report after the step that closed the run).
   */
  runForFailureIn(conversationId: string): PlaybookRun | undefined {
    return this.openRunIn(conversationId) ?? this.d.playbooks.unreviewedIn(conversationId).at(-1);
  }

  openUnreviewedRunsIn(conversationId: string): PlaybookRun[] {
    return this.d.playbooks.openUnreviewedIn(conversationId);
  }

  unreviewedRunsIn(conversationId: string): PlaybookRun[] {
    return this.d.playbooks.unreviewedIn(conversationId);
  }

  markReviewed(runId: string): void {
    this.d.playbooks.markReviewed(runId);
  }

  startRun(playbookName: string, conversationId: string, params: Record<string, string> = {}): PlaybookRun {
    const pb = this.d.playbooks.get(playbookName);
    if (!pb) throw new Error(`playbook não encontrado: ${playbookName}`);
    let run: PlaybookRun;
    if (pb.inputs?.length) {
      // Over concepts (passo 0): the inputs found among the facts fill their citations now.
      const { resolved } = resolveInputs(pb.inputs, params, this.lookupIn(pb.domain));
      run = { ...newRun(pb, ulid(), conversationId, params, now(), (text) => fillCitations(text, params, resolved, this.lookup)), resolved };
    } else {
      run = newRun(pb, ulid(), conversationId, params, now());
    }
    transaction(this.d.db, () => {
      this.d.playbooks.insertRun(run);
      this.d.playbooks.countUse(pb.name);
    });
    return run;
  }

  updateRunStep(runId: string, stepId: string, status: StepStatus, note?: string, outputs?: Record<string, string>): PlaybookRun {
    const current = this.d.playbooks.run(runId);
    if (!current) throw new Error(`execução não encontrada: ${runId}`);
    let run = advanceRun(current, stepId, status, note, now());
    if (outputs && Object.keys(outputs).length) run = recordOutputs(run, this.d.playbooks.get(run.playbook)?.outputs ?? [], outputs);
    // A step that ran as it is written is proven (docs/funcionalidades/25): the instruction the
    // card stored, not the rehearsal's. A step that only got done after a failure nobody fixed on
    // the spot (another way was found) is not proven: its words still do not work.
    const pb = current.kind === 'rehearsal' ? undefined : this.d.playbooks.get(run.playbook);
    const written = status === 'done' ? pb?.steps.find((x) => x.id === stepId) : undefined;
    const broke = run.deviations.some((d) => d.step === stepId && !d.recovered && (d.kind === 'falha' || d.kind === 'comando'));
    transaction(this.d.db, () => {
      this.d.playbooks.updateRun(run);
      if (written && !broke) this.d.proofs.record(run.playbook, stepId, written.how, run.id);
      if (run.status === 'done' && current.status !== 'done') this.d.playbooks.countSuccess(run.playbook);
    });
    return run;
  }

  run(id: string): PlaybookRun | undefined {
    return this.d.playbooks.run(id);
  }

  // ── rehearsal: trying out an explanation before there is a procedure ──
  startRehearsal(conversationId: string, goal: string): PlaybookRun {
    const run = newRehearsal(ulid(), conversationId, goal, now());
    this.d.playbooks.insertRun(run);
    return run;
  }

  rehearsalStep(runId: string, step: { id?: string; label: string; status: StepStatus; note?: string }): PlaybookRun {
    const current = this.d.playbooks.run(runId);
    if (!current) throw new Error(`ensaio não encontrado: ${runId}`);
    const run = rehearsalStep(current, step);
    this.d.playbooks.updateRun(run);
    return run;
  }

  /** Ends a rehearsal with what was agreed: where it starts and ends, what it receives, what stays out. */
  finishRehearsal(runId: string, agreement: Agreement): PlaybookRun {
    const current = this.d.playbooks.run(runId);
    if (!current) throw new Error(`ensaio não encontrado: ${runId}`);
    const problems = agreementProblems(agreement);
    if (problems.length) throw new Error(problems.join('; '));
    const run = finishRehearsal(current, agreement, now());
    this.d.playbooks.updateRun(run);
    return run;
  }

  // ── passo 0: inputs over concepts ──────────────────────────────────────
  /** The facts as a run reads them: types, entities, other names and current relations. */
  readonly lookup: FactLookup = this.lookupIn(undefined);

  /**
   * Os fatos como uma execução os lê, **dentro do alcance do domínio do procedimento** (documento
   * 28, fase B). Sem domínio, lê tudo, que é como era antes: um procedimento que ninguém situou
   * continua enxergando o cérebro inteiro, e isso é melhor do que ele não enxergar nada.
   */
  lookupIn(domain: string | null | undefined): FactLookup {
    return {
      typeOf: (name) => this.d.facts.typeOf(name),
      entity: (id) => this.d.facts.entity(id),
      named: (type, name) => (domain === undefined ? this.d.facts.named(type, name) : this.d.facts.named(type, name, domain)),
      out: (id) => this.d.facts.out(id, now()),
    };
  }

  /** Where a run stands on its inputs: what is still to find, and the citations the facts cannot answer yet. */
  inputState(runId: string): { toResolve: Array<{ input: string; value: string; concept: string; candidates: string[]; howToFind?: string }>; unknown: string[] } {
    const run = this.d.playbooks.run(runId);
    const pb = run && this.d.playbooks.get(run.playbook);
    if (!run || !pb?.inputs?.length) return { toResolve: [], unknown: [] };
    const { resolved, pending } = resolveInputs(pb.inputs, run.params, this.lookupIn(pb.domain), run.resolved);
    return {
      toResolve: pending.map((x) => ({
        input: x.input.name,
        value: x.value,
        concept: x.input.concept!,
        candidates: x.candidates,
        ...(this.d.facts.typeOf(x.input.concept!)?.knows?.achar ? { howToFind: this.d.facts.typeOf(x.input.concept!)!.knows!.achar } : {}),
      })),
      // What else the facts do not answer (a property missing, a resource whose concept does not know "de_pe").
      unknown: readiness(pb, run.params, resolved, this.lookupIn(pb.domain))
        .filter((i) => !i.known && !pending.some((x) => i.label.startsWith(x.input.name)) && !(pb.inputs ?? []).some((inp) => i.label === inp.name))
        .map((i) => `${i.label}: ${i.detail}`),
    };
  }

  /** The "sei / não sei" list of a run over concepts (empty for the older procedures). */
  readiness(runId: string): ReadinessItem[] {
    const run = this.d.playbooks.run(runId);
    const pb = run && this.d.playbooks.get(run.playbook);
    if (!run || !pb?.inputs?.length) return [];
    return readiness(pb, run.params, run.resolved ?? {}, this.lookupIn(pb.domain));
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
    const run = this.d.playbooks.run(runId);
    if (!run) throw new Error(`execução não encontrada: ${runId}`);
    if (run.status !== 'running' && run.status !== 'waiting') throw new Error('a execução já terminou');
    const pb = this.d.playbooks.get(run.playbook)!;
    const input = pb.inputs?.find((i) => i.name === inputName);
    if (!input?.concept) throw new Error(`${pb.name} não tem a entrada ${inputName} com conceito; entradas: ${(pb.inputs ?? []).map((i) => i.name).join(', ') || 'nenhuma'}`);
    const value = run.params[inputName] ?? found.entity;
    const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
    const existing = this.d.facts.entity(found.entity);
    if (existing && existing.type !== input.concept) throw new Error(`${found.entity} é ${existing.type}, não ${input.concept}`);
    let learned: ResolvedInput;
    transaction(this.d.db, () => {
      if (existing) {
        const isAlias = fold(value) !== fold(existing.id) && !(existing.aliases ?? []).some((a) => fold(a) === fold(value));
        if (isAlias) this.d.facts.save({ ...existing, aliases: [...(existing.aliases ?? []), value] });
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
        this.d.facts.save(entity);
        learned = { value, entity: entity.id, learned: 'created' };
      }
      for (const r of found.relations ?? []) {
        const from = this.d.facts.entity(learned!.entity);
        const problems = edgeProblems({ from: learned!.entity, rel: r.rel, to: r.to }, from, this.d.facts.entity(r.to), this.lookup.typeOf);
        if (problems.length) throw new Error(problems.join('; '));
        this.d.facts.link({ from: learned!.entity, rel: r.rel, to: r.to, attrs: { origem: `execucao:${run.id}` }, validFrom: now(), validTo: null });
      }
    });
    const next = this.refill({ ...run, resolved: { ...run.resolved, [inputName]: learned! } }, pb);
    this.d.playbooks.updateRun(next);
    return { run: next, learned: learned! };
  }

  /** Takes back what a run learned about an input: the fact it created, or the other name it added. */
  undoResolved(runId: string, inputName: string): ResolvedInput {
    const run = this.d.playbooks.run(runId);
    const res = run?.resolved?.[inputName];
    if (!run || !res) throw new Error(`nada aprendido para ${inputName} nesta execução`);
    if (res.undone || res.learned === 'known') return res;
    transaction(this.d.db, () => {
      if (res.learned === 'created') this.d.facts.remove(res.entity);
      else {
        const entity = this.d.facts.entity(res.entity);
        if (entity) this.d.facts.save({ ...entity, aliases: (entity.aliases ?? []).filter((a) => a !== res.value) });
      }
      this.d.playbooks.updateRun({ ...run, resolved: { ...run.resolved, [inputName]: { ...res, undone: true } } });
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
    return this.d.playbooks.runs(limit);
  }

  /** The developer typed something while a procedure ran: noted on the step it was in (docs/funcionalidades/19). */
  noteIntervention(conversationId: string, text: string): void {
    const run = this.openRunIn(conversationId);
    if (!run || run.kind === 'rehearsal') return;
    const step = run.steps.find((x) => x.status === 'running' || x.status === 'waiting') ?? run.steps.find((x) => x.status === 'pending') ?? null;
    const said = text.replace(/\s+/g, ' ').trim();
    this.addRunDeviation(run.id, { kind: 'intervencao', detail: `você escreveu${step ? ` no passo ${step.id}` : ''}: "${said.length > 160 ? `${said.slice(0, 157)}…` : said}"`, step: step?.id ?? null });
  }

  /** The gate asked the developer for an action: counts in the open run of the conversation. */
  countAsk(conversationId: string): void {
    const run = this.openRunIn(conversationId);
    if (run && run.kind !== 'rehearsal') this.d.playbooks.countAsk(run.id);
  }

  /** A model turn: its tokens count in the open run of the conversation. */
  addUsage(conversationId: string, u: { tokensIn: number; tokensOut: number; costUsd: number }): void {
    const run = this.openRunIn(conversationId);
    if (run && run.kind !== 'rehearsal') this.d.playbooks.addUsage(run.id, u);
  }

  runsIn(conversationId: string): PlaybookRun[] {
    return this.d.playbooks.runsIn(conversationId);
  }

  lastRunIn(conversationId: string): PlaybookRun | undefined {
    return this.d.playbooks.lastRunIn(conversationId);
  }
}
