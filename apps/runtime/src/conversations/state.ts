import type { PlaybookRun } from '../brain/domain/types.ts';
import { agreementOf } from '../brain/domain/rehearsal.ts';

/**
 * Where a conversation is, as the app shows it: teaching (and at which
 * stage), doing something already known, or done teaching. It is derived from
 * what the brain already records (the last run, the open learning card, what
 * was learned here); nothing new is stored.
 */
export type TeachingStage = 'explicar' | 'ensaiar' | 'combinar' | 'aprender' | 'assumir';

export type ConversationState =
  | { mode: 'ensinando'; stage: Exclude<TeachingStage, 'assumir'> }
  | { mode: 'aprendido'; stage: 'assumir'; playbook: string; level: 1 | 2 | 3 }
  | { mode: 'fazendo'; playbook: string; status: PlaybookRun['status'] };

export interface StateFacts {
  /** The latest run started in the conversation (a rehearsal or a real run). */
  lastRun?: PlaybookRun;
  /** A learning card waits for the developer in the conversation. */
  learningOpen: boolean;
  /** The procedure learned in this conversation, if any (the latest one). */
  learned?: { name: string; level: 1 | 2 | 3 };
}

export function conversationState({ lastRun, learningOpen, learned }: StateFacts): ConversationState {
  // A real run is the newest thing: whatever was taught before, now it is doing.
  if (lastRun && lastRun.kind !== 'rehearsal') return { mode: 'fazendo', playbook: lastRun.playbook, status: lastRun.status };
  if (learned && !learningOpen) return { mode: 'aprendido', stage: 'assumir', playbook: learned.name, level: learned.level };
  if (learningOpen) return { mode: 'ensinando', stage: 'aprender' };
  if (lastRun) {
    if (agreementOf(lastRun)) return { mode: 'ensinando', stage: 'aprender' };
    const tried = lastRun.steps.length > 0 && lastRun.steps.every((s) => s.status === 'done' || s.status === 'skipped');
    return { mode: 'ensinando', stage: tried ? 'combinar' : 'ensaiar' };
  }
  return { mode: 'ensinando', stage: 'explicar' };
}
