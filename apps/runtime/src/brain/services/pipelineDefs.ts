import { transaction } from '../../db/database.ts';
import { pipelineGaps, pipelineProblems, type Pipeline, type PipelineInputDef } from '../domain/pipelines.ts';
import { playbookParams } from '../domain/playbooks.ts';
import { pipelineConfigProblems } from '../domain/review.ts';
import { PASSAGE_STREAK } from '../domain/levels.ts';
import type { BrainParts } from './parts.ts';
import type { BrainStore } from '../store.ts';

/** Esteiras as definitions: save, check, passages that learned to go on alone. */
export class PipelineDefs {
  constructor(private readonly p: BrainParts, private readonly brain: BrainStore) {}

  // ── esteiras (procedures in sequence) ─────────────────────────────────
  savePipeline(p: PipelineInputDef): Pipeline {
    const problems = pipelineProblems(p, (name) => this.p.playbookRepo.get(name));
    if (problems.length) throw new Error(problems.join('; '));
    this.p.pipelineRepo.save(p);
    return this.p.pipelineRepo.get(p.name)!;
  }

  pipeline(name: string): Pipeline | undefined {
    return this.p.pipelineRepo.get(name);
  }

  pipelines(): Pipeline[] {
    return this.p.pipelineRepo.all();
  }

  deletePipeline(name: string): boolean {
    return this.p.pipelineRepo.delete(name);
  }

  countPipelineUse(name: string): void {
    this.p.pipelineRepo.countUse(name);
  }

  /** Parameters no stage hands over and no input gives: the Orbi will ask when it gets there. */
  pipelineGaps(p: PipelineInputDef) {
    return pipelineGaps(p, (name) => this.p.playbookRepo.get(name), (pb) => playbookParams(pb));
  }

  /**
   * The developer decided on a passage that asks. After PASSAGE_STREAK times "go on" in a row,
   * the passage goes on by itself; "stop" starts the count again. Returns the change, if any.
   */
  notePassage(name: string, stageId: string, continued: boolean, conversationId: string | null): { from: string; to: string; reason: string } | null {
    const p = this.p.pipelineRepo.get(name);
    const stage = p?.stages.find((s) => s.id === stageId);
    if (!p || !stage || stage.passage !== 'ask') return null;
    const streaks = this.p.pipelineRepo.passageStreaks(name);
    const count = continued ? (streaks[stageId] ?? 0) + 1 : 0;
    if (count < PASSAGE_STREAK) {
      this.p.pipelineRepo.setPassageStreaks(name, { ...streaks, [stageId]: count });
      return null;
    }
    const reason = `você seguiu ${PASSAGE_STREAK} vezes seguidas`;
    transaction(this.p.db, () => {
      this.p.pipelineRepo.save({ ...p, stages: p.stages.map((s) => (s.id === stageId ? { ...s, passage: 'auto' as const } : s)) });
      this.p.pipelineRepo.setPassageStreaks(name, { ...streaks, [stageId]: 0 });
      this.p.levels.addEvent({ subjectKind: 'passage', subject: `${name}/${stageId}`, from: 'pergunta', to: 'segue', reason, conversationId });
    });
    return { from: 'pergunta', to: 'segue', reason };
  }

  /** "Manter perguntando": the passage asks again, and the count starts over. */
  keepPassageAsking(name: string, stageId: string, conversationId: string | null): void {
    const p = this.p.pipelineRepo.get(name);
    if (!p || !p.stages.some((s) => s.id === stageId)) throw new Error(`etapa não encontrada: ${name}/${stageId}`);
    transaction(this.p.db, () => {
      this.p.pipelineRepo.save({ ...p, stages: p.stages.map((s) => (s.id === stageId ? { ...s, passage: 'ask' as const } : s)) });
      this.p.pipelineRepo.setPassageStreaks(name, { ...this.p.pipelineRepo.passageStreaks(name), [stageId]: 0 });
      this.p.levels.addEvent({ subjectKind: 'passage', subject: `${name}/${stageId}`, from: 'segue', to: 'pergunta', reason: 'você mudou', conversationId });
    });
  }

  passageStreaks(name: string): Record<string, number> {
    return this.p.pipelineRepo.passageStreaks(name);
  }

  /** Configuration problems of an esteira (data that does not flow, steps that ask, fixed values). */
  pipelineWarnings(p: PipelineInputDef, delivered: Record<string, Record<string, string>> = {}) {
    return pipelineConfigProblems(p, (name) => this.p.playbookRepo.get(name), delivered);
  }

  /** Esteiras that use a playbook. */
  pipelinesUsing(playbook: string): string[] {
    return this.p.pipelineRepo.using(playbook);
  }
}
