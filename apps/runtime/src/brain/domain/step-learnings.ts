/**
 * What was already tried in a procedure, kept with it (docs/funcionalidades/25): an attempt that
 * failed, one that worked, a proposal the developer denied, a workaround for a defect of the Orbi
 * itself. The run reads them when it starts; a proposal that repeats one that failed or was denied
 * goes back to the model before any card. Pure rules.
 */
import type { PlaybookRun } from './types.ts';

export type LearningOutcome = 'falhou' | 'funcionou' | 'negado' | 'orbi';
export const LEARNING_OUTCOMES: readonly LearningOutcome[] = ['falhou', 'funcionou', 'negado', 'orbi'];
export type LearningSource = 'execucao' | 'revisao' | 'pedido' | 'orbi';

export interface StepLearning {
  id: string;
  playbook: string;
  /** The step it is about; null = the procedure as a whole. */
  step: string | null;
  /** What was tried, in one line. */
  tried: string;
  outcome: LearningOutcome;
  /** Why it failed, was denied, or what makes it work. */
  why: string;
  source: LearningSource;
  runId: string | null;
  conversationId: string;
  /** How many times the same attempt was seen. */
  times: number;
  createdAt: string;
  updatedAt: string;
}

export type NewLearning = Pick<StepLearning, 'playbook' | 'step' | 'tried' | 'outcome' | 'why' | 'source' | 'runId' | 'conversationId'>;

const words = (text: string) => new Set(text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9_.-]{3,}/g) ?? []);

/** How much two texts say the same (shared words over all words, 0 to 1). */
export function likeness(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** The same attempt, said in other words. */
export const SAME_ATTEMPT = 0.75;
export const sameAttempt = (a: string, b: string) => a.trim() === b.trim() || likeness(a, b) >= SAME_ATTEMPT;

const day = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/');
const BAD: Record<Exclude<LearningOutcome, 'funcionou'>, string> = { falhou: 'falhou', negado: 'foi negado pelo desenvolvedor', orbi: 'era contorno de um defeito do Orbi' };

/**
 * Steps of a new version that repeat an attempt that failed, was denied, or was a workaround for
 * the Orbi: one line each, for the model. Empty = nothing repeated.
 */
export function repeatedAttempts(
  before: ReadonlyArray<{ id: string; how: string }>,
  after: ReadonlyArray<{ id: string; how: string }>,
  learnings: readonly StepLearning[],
): string[] {
  const was = new Map(before.map((s) => [s.id, s.how]));
  const out: string[] = [];
  for (const s of after) {
    if (was.get(s.id) === s.how) continue;
    const hit = learnings.find((l) => l.outcome !== 'funcionou' && (l.step ?? s.id) === s.id && sameAttempt(l.tried, s.how));
    if (hit) out.push(`passo ${s.id}: isso já foi tentado em ${day(hit.updatedAt)} e ${BAD[hit.outcome as keyof typeof BAD]}${hit.why ? ` (${hit.why})` : ''}. Proponha outro jeito; se o desenvolvedor pediu exatamente isso agora, passe o pedido dele em \`asked\`.`);
  }
  return out;
}

/** The steps a denied version wanted to change: each becomes "negado", so it is not proposed again. */
export function deniedAttempts(
  playbook: string,
  before: ReadonlyArray<{ id: string; how: string }>,
  after: ReadonlyArray<{ id: string; how: string }>,
  conversationId: string,
): NewLearning[] {
  const was = new Map(before.map((s) => [s.id, s.how]));
  return after
    .filter((s) => s.how.trim() && was.get(s.id) !== s.how)
    .map((s) => ({ playbook, step: s.id, tried: s.how.slice(0, 600), outcome: 'negado' as const, why: '', source: 'revisao' as const, runId: null, conversationId }));
}

/**
 * What a finished run tried and did not work, in a step that got done anyway (another way worked):
 * worth remembering. A wrong call of the model and a slip fixed by the same call are not attempts.
 */
export function failedAttempts(run: Pick<PlaybookRun, 'id' | 'playbook' | 'conversationId' | 'steps' | 'deviations'>): NewLearning[] {
  const done = new Set(run.steps.filter((s) => s.status === 'done').map((s) => s.id));
  const out: NewLearning[] = [];
  for (const d of run.deviations) {
    if (d.recovered || !d.step || !done.has(d.step)) continue;
    if (d.kind !== 'falha' && d.kind !== 'comando') continue;
    const tried = d.kind === 'comando' ? (d.command ?? d.tool ?? 'comando') : (d.tool ?? 'ferramenta');
    const why = d.detail.replace(/\s+/g, ' ').slice(0, 300);
    if (!out.some((o) => o.step === d.step && o.tried === tried)) out.push({ playbook: run.playbook, step: d.step, tried: tried.slice(0, 600), outcome: 'falhou', why, source: 'execucao', runId: run.id, conversationId: run.conversationId });
  }
  return out;
}

const MARK: Record<LearningOutcome, string> = { falhou: 'falhou', funcionou: 'funcionou', negado: 'negado pelo desenvolvedor', orbi: 'contorno de defeito do Orbi, não repetir' };

/** The learnings as lines for the model, newest first, at most `limit`. */
export function learningLines(learnings: readonly StepLearning[], limit = 12): string[] {
  return learnings.slice(0, limit).map((l) => `${l.step ? `passo ${l.step}` : 'procedimento'} · ${MARK[l.outcome]}: ${l.tried.slice(0, 200)}${l.why ? ` (${l.why.slice(0, 200)})` : ''}`);
}
