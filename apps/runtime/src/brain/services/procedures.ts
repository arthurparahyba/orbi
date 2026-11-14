import { levelState } from '../domain/level-state.ts';
import { transaction } from '../../db/database.ts';
import { ftsQuery, sharedStems } from '../domain/similarity.ts';
import { playbookProblems } from '../domain/playbooks.ts';
import { inputProblems, leakedSpecifics } from '../domain/concepts.ts';
import { testedRunProblem } from '../domain/rehearsal.ts';
import type { Autonomy, Playbook, PlaybookInput } from '../domain/types.ts';
import type { BrainParts } from './parts.ts';
import type { BrainStore } from '../store.ts';

/** Procedures (playbooks): save, edit, find; the scripts travel with them. */
export class Procedures {
  constructor(private readonly p: BrainParts, private readonly brain: BrainStore) {}

  // ── playbooks ───────────────────────────────────────────────────────────
  savePlaybook(pb: PlaybookInput): Playbook {
    // Scripts left out of a change stay as they were (and the steps are checked against them).
    // A new variation starts from its base: what it does not bring (scripts, what it is for, what it
    // receives and hands over) is copied from it, so "a version of this one" needs only its steps.
    const own = this.p.playbookRepo.get(pb.name);
    const before = own ?? (pb.variationOf && pb.variationOf !== pb.name ? this.p.playbookRepo.get(pb.variationOf) : undefined);
    const scripts = pb.scripts ?? before?.scripts ?? [];
    // The same for what it is for, what it receives and the rehearsal that proved it.
    pb = { ...pb, intent: pb.intent ?? before?.intent ?? '', inputs: pb.inputs ?? before?.inputs ?? [], outputs: pb.outputs ?? before?.outputs ?? [], testedRun: pb.testedRun ?? own?.testedRun ?? null };
    const problems = playbookProblems({ ...pb, scripts });
    // Over concepts: inputs and citations valid against the ontology, no specific fact written in.
    problems.push(...inputProblems(pb, this.brain.facts.typeOf), ...leakedSpecifics(pb, (type) => this.p.graphRepo.byType(type)));
    // What proves it works: a finished rehearsal with its agreement, or a good run of it.
    if (pb.testedRun && pb.testedRun !== own?.testedRun) {
      const problem = testedRunProblem(this.p.playbookRepo.run(pb.testedRun), pb.name, pb.testedRun);
      if (problem) problems.push(problem);
    }
    if (pb.variationOf && (pb.variationOf === pb.name || !this.p.playbookRepo.get(pb.variationOf))) {
      problems.push(`variationOf: playbook base não existe: ${pb.variationOf}`);
    }
    if (problems.length) throw new Error(problems.join('; '));
    // Editing the steps keeps the level: a changed step runs other actions, and new actions ask anyway.
    this.p.playbookRepo.save({ ...pb, scripts });
    return this.p.playbookRepo.get(pb.name)!;
  }

  /** The developer edits a playbook on the Cérebro screen. Name, autonomy, base and counters stay. */
  editPlaybook(name: string, change: Partial<Pick<Playbook, 'description' | 'trigger' | 'appliesTo' | 'steps' | 'instructions' | 'outputs' | 'scripts' | 'intent' | 'inputs'>>): Playbook {
    const current = this.p.playbookRepo.get(name);
    if (!current) throw new Error(`playbook não encontrado: ${name}`);
    const { uses: _u, successes: _s, updatedAt: _t, ...rest } = current;
    return this.savePlaybook({ ...rest, ...change });
  }

  /** Deletes a playbook. Variations stay (unlinked); past runs stay in Execuções. */
  deletePlaybook(name: string): { detachedVariations: string[] } {
    if (!this.p.playbookRepo.get(name)) throw new Error(`playbook não encontrado: ${name}`);
    const using = this.p.pipelineRepo.using(name);
    if (using.length) throw new Error(`o procedimento ${name} está nas esteiras ${using.join(', ')}: tire-o delas antes de apagar`);
    let detachedVariations: string[] = [];
    transaction(this.p.db, () => {
      detachedVariations = this.p.playbookRepo.delete(name);
      this.p.levels.forget(name);
      this.brain.learnings.forget(name);
      this.brain.proofs.forget(name);
    });
    return { detachedVariations };
  }

  /** observe: only reports. ask and auto are shortcuts for N1 and N3, set by the developer. */
  setPlaybookAutonomy(name: string, autonomy: Autonomy): Playbook {
    const pb = this.p.playbookRepo.get(name);
    if (!pb) throw new Error(`playbook não encontrado: ${name}`);
    this.p.playbookRepo.setAutonomy(name, autonomy);
    // Leaving "só observar" keeps the level it had; otherwise ask/auto choose N1/N3.
    if (pb.autonomy === 'observe' && autonomy !== 'observe') this.p.playbookRepo.setLevel(name, levelState(pb));
    else if (autonomy !== 'observe') this.brain.setPlaybookLevel(name, { level: autonomy === 'auto' ? 3 : 1 });
    return this.p.playbookRepo.get(name)!;
  }

  playbook(name: string): Playbook | undefined {
    return this.p.playbookRepo.get(name);
  }

  playbooks(): Playbook[] {
    return this.p.playbookRepo.all();
  }

  /** Playbooks for a request, best first, with the stems they share with it. */
  searchPlaybooks(text: string, limit = 3): Array<{ playbook: Playbook; shared: string[] }> {
    return this.p.playbookRepo.search(ftsQuery(text), limit).map((playbook) => ({
      playbook,
      shared: sharedStems(text, [playbook.name, playbook.description, playbook.trigger, ...playbook.steps.map((s) => `${s.label} ${s.how}`)].join(' ')),
    }));
  }
}
