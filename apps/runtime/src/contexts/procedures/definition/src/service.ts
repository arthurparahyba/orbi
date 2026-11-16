import { levelState } from '../../../trust/index.ts';
import { transaction } from '../../../../db/database.ts';
import { ftsQuery, sharedStems } from '../../../knowledge/index.ts';
import { playbookProblems } from './playbooks.ts';
import { inputProblems, leakedSpecifics } from './concepts.ts';
import { testedRunProblem } from '../../rehearsal/src/rehearsal.ts';
import type { Autonomy, Playbook, PlaybookInput } from '../../../../language/index.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { PlaybookRepo } from './repo.ts';
import type { PipelineRepo } from '../../pipelines/src/repo.ts';
import type { ProofRepo } from '../../proofs/src/repo.ts';
import type { StepLearningRepo } from '../../learnings/src/repo.ts';
import type { Facts } from '../../../knowledge/index.ts';
import type { Autonomy as Trust, LevelRepo } from '../../../trust/index.ts';

/** What this module needs from the neighbours it reads and from its own context's repositories. */
export interface ProceduresDeps {
  db: DatabaseSync;
  playbooks: PlaybookRepo;
  pipelines: PipelineRepo;
  proofs: ProofRepo;
  learnings: StepLearningRepo;
  /** `knowledge`: a procedure's inputs and `appliesTo` name types and entities that must exist. */
  facts: Facts;
  /** `trust`: forgetting what a procedure knew, and setting its level when it is edited. */
  levels: LevelRepo;
  trust: Trust;
}

/** Procedures (playbooks): save, edit, find; the scripts travel with them. */
export class Procedures {
  constructor(private readonly d: ProceduresDeps) {}

  // ── playbooks ───────────────────────────────────────────────────────────
  savePlaybook(pb: PlaybookInput): Playbook {
    // Scripts left out of a change stay as they were (and the steps are checked against them).
    // A new variation starts from its base: what it does not bring (scripts, what it is for, what it
    // receives and hands over) is copied from it, so "a version of this one" needs only its steps.
    const own = this.d.playbooks.get(pb.name);
    const before = own ?? (pb.variationOf && pb.variationOf !== pb.name ? this.d.playbooks.get(pb.variationOf) : undefined);
    const scripts = pb.scripts ?? before?.scripts ?? [];
    // The same for what it is for, what it receives and the rehearsal that proved it.
    pb = { ...pb, intent: pb.intent ?? before?.intent ?? '', inputs: pb.inputs ?? before?.inputs ?? [], outputs: pb.outputs ?? before?.outputs ?? [], testedRun: pb.testedRun ?? own?.testedRun ?? null };
    const problems = playbookProblems({ ...pb, scripts });
    // Over concepts: inputs and citations valid against the ontology, no specific fact written in.
    problems.push(...inputProblems(pb, this.d.facts.typeOf), ...leakedSpecifics(pb, (type) => this.d.facts.byType(type)));
    // What proves it works: a finished rehearsal with its agreement, or a good run of it.
    if (pb.testedRun && pb.testedRun !== own?.testedRun) {
      const problem = testedRunProblem(this.d.playbooks.run(pb.testedRun), pb.name, pb.testedRun);
      if (problem) problems.push(problem);
    }
    if (pb.variationOf && (pb.variationOf === pb.name || !this.d.playbooks.get(pb.variationOf))) {
      problems.push(`variationOf: playbook base não existe: ${pb.variationOf}`);
    }
    if (problems.length) throw new Error(problems.join('; '));
    // Editing the steps keeps the level: a changed step runs other actions, and new actions ask anyway.
    this.d.playbooks.save({ ...pb, scripts });
    return this.d.playbooks.get(pb.name)!;
  }

  /** The developer edits a playbook on the Cérebro screen. Name, autonomy, base and counters stay. */
  editPlaybook(name: string, change: Partial<Pick<Playbook, 'description' | 'trigger' | 'appliesTo' | 'steps' | 'instructions' | 'outputs' | 'scripts' | 'intent' | 'inputs'>>): Playbook {
    const current = this.d.playbooks.get(name);
    if (!current) throw new Error(`playbook não encontrado: ${name}`);
    const { uses: _u, successes: _s, updatedAt: _t, ...rest } = current;
    return this.savePlaybook({ ...rest, ...change });
  }

  /** Deletes a playbook. Variations stay (unlinked); past runs stay in Execuções. */
  deletePlaybook(name: string): { detachedVariations: string[] } {
    if (!this.d.playbooks.get(name)) throw new Error(`playbook não encontrado: ${name}`);
    const using = this.d.pipelines.using(name);
    if (using.length) throw new Error(`o procedimento ${name} está nas esteiras ${using.join(', ')}: tire-o delas antes de apagar`);
    let detachedVariations: string[] = [];
    transaction(this.d.db, () => {
      detachedVariations = this.d.playbooks.delete(name);
      this.d.levels.forget(name);
      this.d.learnings.forget(name);
      this.d.proofs.forget(name);
    });
    return { detachedVariations };
  }

  /** observe: only reports. ask and auto are shortcuts for N1 and N3, set by the developer. */
  setPlaybookAutonomy(name: string, autonomy: Autonomy): Playbook {
    const pb = this.d.playbooks.get(name);
    if (!pb) throw new Error(`playbook não encontrado: ${name}`);
    this.d.playbooks.setAutonomy(name, autonomy);
    // Leaving "só observar" keeps the level it had; otherwise ask/auto choose N1/N3.
    if (pb.autonomy === 'observe' && autonomy !== 'observe') this.d.playbooks.setLevel(name, levelState(pb));
    else if (autonomy !== 'observe') this.d.trust.setPlaybookLevel(name, { level: autonomy === 'auto' ? 3 : 1 });
    return this.d.playbooks.get(name)!;
  }

  playbook(name: string): Playbook | undefined {
    return this.d.playbooks.get(name);
  }

  /** How many procedures the Orbi knows, for the situation line of every turn. */
  count(): number {
    return this.d.playbooks.count();
  }

  playbooks(): Playbook[] {
    return this.d.playbooks.all();
  }

  /** Playbooks for a request, best first, with the stems they share with it. */
  searchPlaybooks(text: string, limit = 3): Array<{ playbook: Playbook; shared: string[] }> {
    return this.d.playbooks.search(ftsQuery(text), limit).map((playbook) => ({
      playbook,
      shared: sharedStems(text, [playbook.name, playbook.description, playbook.trigger, ...playbook.steps.map((s) => `${s.label} ${s.how}`)].join(' ')),
    }));
  }
}
