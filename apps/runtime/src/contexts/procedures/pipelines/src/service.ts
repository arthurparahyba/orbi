import { transaction } from '../../../../db/database.ts';
import { pipelineGaps, pipelineProblems, type Pipeline, type PipelineInputDef } from './pipelines.ts';
import { playbookParams } from '../../definition/src/playbooks.ts';
import { pipelineConfigProblems } from './config.ts';
import { PASSAGE_STREAK } from '../../../../language/index.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { PlaybookRepo } from '../../definition/src/repo.ts';
import type { PipelineRepo } from './repo.ts';
import type { LevelRepo } from '../../../trust/index.ts';

/** What the esteiras need: their own storage, the procedures they chain, and what each knows. */
export interface PipelineDeps {
  db: DatabaseSync;
  playbooks: PlaybookRepo;
  pipelines: PipelineRepo;
  /** `trust`: an esteira's streak reads what each procedure already does alone. */
  levels: LevelRepo;
}

/** Esteiras as definitions: save, check, passages that learned to go on alone. */
export class PipelineDefs {
  constructor(private readonly d: PipelineDeps) {}

  // ── esteiras (procedures in sequence) ─────────────────────────────────
  savePipeline(p: PipelineInputDef): Pipeline {
    const problems = pipelineProblems(p, (name) => this.d.playbooks.get(name));
    if (problems.length) throw new Error(problems.join('; '));
    this.d.pipelines.save(p);
    return this.d.pipelines.get(p.name)!;
  }

  pipeline(name: string): Pipeline | undefined {
    return this.d.pipelines.get(name);
  }

  pipelines(): Pipeline[] {
    return this.d.pipelines.all();
  }

  deletePipeline(name: string): boolean {
    return this.d.pipelines.delete(name);
  }

  countPipelineUse(name: string): void {
    this.d.pipelines.countUse(name);
  }

  /** Parameters no stage hands over and no input gives: the Orbi will ask when it gets there. */
  pipelineGaps(p: PipelineInputDef) {
    return pipelineGaps(p, (name) => this.d.playbooks.get(name), (pb) => playbookParams(pb));
  }

  /**
   * The developer decided on a passage that asks. After PASSAGE_STREAK times "go on" in a row,
   * the passage goes on by itself; "stop" starts the count again. Returns the change, if any.
   */
  notePassage(name: string, stageId: string, continued: boolean, conversationId: string | null): { from: string; to: string; reason: string } | null {
    const p = this.d.pipelines.get(name);
    const stage = p?.stages.find((s) => s.id === stageId);
    if (!p || !stage || stage.passage !== 'ask') return null;
    const streaks = this.d.pipelines.passageStreaks(name);
    const count = continued ? (streaks[stageId] ?? 0) + 1 : 0;
    if (count < PASSAGE_STREAK) {
      this.d.pipelines.setPassageStreaks(name, { ...streaks, [stageId]: count });
      return null;
    }
    const reason = `você seguiu ${PASSAGE_STREAK} vezes seguidas`;
    transaction(this.d.db, () => {
      this.d.pipelines.save({ ...p, stages: p.stages.map((s) => (s.id === stageId ? { ...s, passage: 'auto' as const } : s)) });
      this.d.pipelines.setPassageStreaks(name, { ...streaks, [stageId]: 0 });
      this.d.levels.addEvent({ subjectKind: 'passage', subject: `${name}/${stageId}`, from: 'pergunta', to: 'segue', reason, conversationId });
    });
    return { from: 'pergunta', to: 'segue', reason };
  }

  /** "Manter perguntando": the passage asks again, and the count starts over. */
  keepPassageAsking(name: string, stageId: string, conversationId: string | null): void {
    const p = this.d.pipelines.get(name);
    if (!p || !p.stages.some((s) => s.id === stageId)) throw new Error(`etapa não encontrada: ${name}/${stageId}`);
    transaction(this.d.db, () => {
      this.d.pipelines.save({ ...p, stages: p.stages.map((s) => (s.id === stageId ? { ...s, passage: 'ask' as const } : s)) });
      this.d.pipelines.setPassageStreaks(name, { ...this.d.pipelines.passageStreaks(name), [stageId]: 0 });
      this.d.levels.addEvent({ subjectKind: 'passage', subject: `${name}/${stageId}`, from: 'segue', to: 'pergunta', reason: 'você mudou', conversationId });
    });
  }

  passageStreaks(name: string): Record<string, number> {
    return this.d.pipelines.passageStreaks(name);
  }

  /** Configuration problems of an esteira (data that does not flow, steps that ask, fixed values). */
  pipelineWarnings(p: PipelineInputDef, delivered: Record<string, Record<string, string>> = {}) {
    return pipelineConfigProblems(p, (name) => this.d.playbooks.get(name), delivered);
  }

  /** Esteiras that use a playbook. */
  pipelinesUsing(playbook: string): string[] {
    return this.d.pipelines.using(playbook);
  }
}
