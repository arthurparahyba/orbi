import type { Entity, Playbook, PlaybookRun, StepStatus } from '../brain/domain/types.ts';
import type { ReadinessItem } from '../brain/domain/concepts.ts';
import { agreementOf, type Agreement } from '../brain/domain/rehearsal.ts';
import { RUNS_FOR_N3, type Level } from '../brain/domain/levels.ts';
import type { ConversationState } from './state.ts';

/**
 * The "O que estou aprendendo" panel beside a conversation: what the Orbi understood so far,
 * built from what the brain already records (the rehearsal, the agreement, the procedure, the
 * facts noted in this conversation). Never written by the model; nothing new is stored.
 */
export interface ConversationNotebook {
  state: ConversationState;
  /** What it is for: the rehearsal's goal or the procedure's intent. */
  intent?: string;
  /** Steps as tried (rehearsal, run) or as learned (`planned`). */
  steps: Array<{ label: string; status: StepStatus | 'planned'; note?: string }>;
  /** What it needs each time. */
  receives: string[];
  agreement?: Pick<Agreement, 'start' | 'end' | 'outside' | 'corrections'>;
  /** Facts that came from this conversation (approved cards, runs). */
  noted: Array<{ id: string; type: string }>;
  /** Before or during a run over concepts: what it knows and what it does not. */
  readiness: ReadinessItem[];
  procedure?: {
    name: string; description: string; level: Level; levelMax: Level; uses: number; successes: number;
    /** The next level and how many clean runs it still takes; none at the top or at the cap. */
    nextLevel?: { level: Level; cleanRunsLeft: number };
  };
}

export interface NotebookFacts {
  conversationId: string;
  state: ConversationState;
  lastRun?: PlaybookRun;
  /** The procedure the state is about (learned here, or the one running). */
  procedure?: Playbook;
  /** The brain's entities (only those from this conversation are kept). */
  entities: Entity[];
  /** The ids of the runs of this conversation (facts a run created name it). */
  runIds: string[];
  readiness: ReadinessItem[];
}

export function nextLevel(pb: Pick<Playbook, 'level' | 'levelMax' | 'cleanStreak'>): { level: Level; cleanRunsLeft: number } | undefined {
  if (pb.level >= pb.levelMax) return undefined;
  return pb.level === 1 ? { level: 2, cleanRunsLeft: 1 } : { level: 3, cleanRunsLeft: Math.max(1, RUNS_FOR_N3 - pb.cleanStreak) };
}

export function buildNotebook(f: NotebookFacts): ConversationNotebook {
  const from = new Set([`cartao:${f.conversationId}`, ...f.runIds.map((id) => `execucao:${id}`)]);
  const noted = f.entities.filter((e) => e.source && from.has(e.source)).map((e) => ({ id: e.id, type: e.type }));
  const pb = f.procedure;
  const procedure = pb && {
    name: pb.name, description: pb.description, level: pb.level, levelMax: pb.levelMax, uses: pb.uses, successes: pb.successes,
    ...(nextLevel(pb) ? { nextLevel: nextLevel(pb) } : {}),
  };
  const fromProcedure = {
    intent: pb ? pb.intent || pb.description : undefined,
    receives: (pb?.inputs ?? []).map((i) => (i.concept ? `${i.name} (${i.concept})` : i.name)),
  };
  const run = f.lastRun;
  const tried = (r: PlaybookRun) => r.steps.map((s) => ({ label: s.label, status: s.status, ...(s.note ? { note: s.note } : {}) }));

  if ((f.state.mode === 'fazendo' || f.state.mode === 'esteira') && run && run.kind !== 'rehearsal') {
    return { state: f.state, ...fromProcedure, steps: tried(run), noted, readiness: f.readiness, ...(procedure ? { procedure } : {}) };
  }
  if (f.state.mode === 'aprendido' && pb) {
    const agreed = run?.kind === 'rehearsal' ? agreementOf(run) : undefined;
    return {
      state: f.state, ...fromProcedure, steps: pb.steps.map((s) => ({ label: s.label, status: 'planned' as const })), noted, readiness: [],
      ...(agreed ? { agreement: { start: agreed.start, end: agreed.end, outside: agreed.outside, corrections: agreed.corrections } } : {}),
      procedure: procedure!,
    };
  }
  if (run?.kind === 'rehearsal') {
    const agreed = agreementOf(run);
    return {
      state: f.state, intent: run.params.objetivo, steps: tried(run), receives: agreed?.receives ?? [], noted, readiness: [],
      ...(agreed ? { agreement: { start: agreed.start, end: agreed.end, outside: agreed.outside, corrections: agreed.corrections } } : {}),
    };
  }
  return { state: f.state, steps: [], receives: [], noted, readiness: [] };
}
