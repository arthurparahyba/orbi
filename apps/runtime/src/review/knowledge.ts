import type { OrbiServices } from '../services.ts';
import type { Agent } from '../agents/runtime-port.ts';
import type { PlaybookRun } from '../brain/domain/types.ts';
import type { Observation } from '../observability/run-observations.ts';
import { tellAgent } from '../conversations/tell.ts';
import { redact } from '../vault/vault.ts';
import { log } from '../observability/log.ts';
import { classifyEntity, verdictLine } from '../brain/domain/fact-match.ts';

/**
 * The knowledge review at the end of a run (docs/funcionalidades/19): what the run read (command
 * output, pages) goes, cleaned of credentials, to the Revisor agent (agents/revisor.ts, the cheap
 * model), which proposes facts about concepts the brain already has. When it is done, the facts
 * go to the run's conversation and the Orbi proposes them with brain_learn: the developer approves
 * on the learning card, as with anything learned.
 */
export const KNOWLEDGE_PREFIX = 'revisao:';

export type FactCandidate = (
  | { kind: 'entity'; id: string; type: string; props: Record<string, unknown>; aliases?: string[]; why: string }
  | { kind: 'edge'; from: string; rel: string; to: string; why: string }
) & {
  /** The step of the procedure whose output showed it (docs/funcionalidades/22). */
  step?: string;
  /** Against the brain: 'já sei', or the line saying what it adds, changes or is the same as. */
  verdict?: string;
};

/**
 * The Revisor's facts against the brain (docs/funcionalidades/22): one already known is marked
 * "já sei"; one that is an existing fact under another name becomes that fact (its name as another
 * name, relations rewritten); the others carry what they add or change.
 */
export function matchFacts(facts: FactCandidate[], brain: Pick<OrbiServices['brain'], 'byType' | 'neighbors'>): FactCandidate[] {
  const renamed = new Map<string, string>();
  const out: FactCandidate[] = [];
  for (const f of facts) {
    if (f.kind !== 'entity') continue;
    const v = classifyEntity({ id: f.id, type: f.type, props: f.props, aliases: f.aliases }, (t) => brain.byType(t));
    if (v.kind === 'known') { out.push({ ...f, verdict: 'já sei' }); continue; }
    if (v.kind === 'same') {
      renamed.set(f.id, v.id);
      out.push({ ...f, id: v.id, aliases: v.aliases, verdict: verdictLine(f, v) });
      continue;
    }
    out.push({ ...f, verdict: verdictLine(f, v) });
  }
  for (const f of facts) {
    if (f.kind !== 'edge') continue;
    const e = { ...f, from: renamed.get(f.from) ?? f.from, to: renamed.get(f.to) ?? f.to };
    const exists = brain.neighbors(e.from).out.some((x) => x.rel === e.rel && x.to === e.to);
    out.push({ ...e, verdict: exists ? 'já sei' : 'nova ligação' });
  }
  return out;
}

/** Facts the Revisor found, per run, until they are handed to the run's conversation. */
export class KnowledgeCandidates {
  private readonly byRun = new Map<string, FactCandidate[]>();

  offer(runId: string, facts: FactCandidate[]): void {
    this.byRun.set(runId, [...(this.byRun.get(runId) ?? []), ...facts]);
  }

  take(runId: string): FactCandidate[] {
    const list = this.byRun.get(runId) ?? [];
    this.byRun.delete(runId);
    return list;
  }
}

/** Values that look like credentials, wherever they show up in an output. */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(sk|pk)-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g,
  // "password": "x", PASSWORD=x, senha: x, token=x, secret: x (the value only)
  /((?:pass(?:word)?|passwd|pwd|senha|secret|segredo|token|api[_-]?key|apikey)["']?\s*[:=]\s*["']?)([^"'\s,;}]+)/gi,
];

/** Output with the vault's values and anything that looks like a credential taken out. */
export function scrub(text: string, secrets: string[]): string {
  let out = redact(text, secrets);
  for (const p of SECRET_PATTERNS) out = out.replace(p, (all, keep?: string) => (typeof keep === 'string' && all.startsWith(keep) ? `${keep}••••••` : '••••••'));
  return out;
}

/** What the Revisor reads: the procedure, the concepts and facts it touches, and what the run read. */
export function knowledgeBrief(s: Pick<OrbiServices, 'brain'>, run: PlaybookRun, observations: Observation[]): string {
  const pb = s.brain.playbook(run.playbook);
  // What the brain already has of its concepts, so a fact it knows is not proposed again (doc 22).
  const known = s.brain.types().slice(0, 30).flatMap((t) => s.brain.byType(t.name).slice(0, 15).map((e) =>
    `- ${e.id} (${e.type}) ${JSON.stringify(e.props)}${e.aliases?.length ? ` · também ${e.aliases.join(', ')}` : ''}`)).slice(0, 120);
  const steps = (pb?.steps ?? []).map((st) => `- ${st.id}: ${st.label}${st.how ? ` · ${st.how}` : ''}`);
  const types = s.brain.types().slice(0, 30).map((t) => {
    const props = Object.keys(t.props ?? {});
    const rels = Object.entries(t.relations).map(([r, to]) => `${r} → ${to}`);
    return `- ${t.name}: ${t.description}${props.length ? ` · propriedades: ${props.join(', ')}` : ''}${rels.length ? ` · relações: ${rels.join(', ')}` : ''}`;
  });
  const touched = Object.values(run.resolved ?? {}).filter((r) => !r.undone).map((r) => r.entity);
  const facts = [...new Set(touched)].flatMap((id) => {
    const e = s.brain.get(id);
    if (!e) return [];
    const out = s.brain.neighbors(id).out.map((ed) => `${ed.rel} → ${ed.to}`);
    return [`- ${e.id} (${e.type}) ${JSON.stringify(e.props)}${out.length ? ` · ${out.join(', ')}` : ''}`];
  });
  return [
    `Execução de ${run.playbook}${pb?.intent ? ` (${pb.intent})` : pb ? ` (${pb.description})` : ''}, com ${JSON.stringify(run.params)}.`,
    '',
    'Conceitos que o cérebro já conhece:',
    ...(types.length ? types : ['(nenhum)']),
    '',
    'Fatos que esta execução tocou:',
    ...(facts.length ? facts : ['(nenhum)']),
    '',
    'Fatos que o cérebro já tem desses conceitos (não proponha de novo o que está igual):',
    ...(known.length ? known : ['(nenhum)']),
    '',
    'Passos do procedimento (em `step`, diga de qual passo veio cada fato):',
    ...(steps.length ? steps : ['(sem passos)']),
    '',
    'O que a execução leu (já sem credenciais):',
    ...observations.map((o) => `[${o.step ? `passo ${o.step}` : 'execução'} · ${o.tool}]\n${o.text}`),
  ].join('\n');
}

/** After the review of a run: hand what it read to the Revisor, if it read anything. */
export async function startKnowledgeReview(s: OrbiServices, agent: Agent, runId: string): Promise<void> {
  const run = s.brain.run(runId);
  const observations = s.observations.take(runId);
  if (!s.config.knowledgeReview || !run || run.kind === 'rehearsal' || observations.length === 0) return;
  // Facts are about concepts the brain already has: with none, there is nothing to attach them to.
  if (s.brain.types().length === 0) return;
  try {
    const secrets: string[] = [];
    for (const x of s.vault.list()) {
      const value = await s.vault.get(x.name).catch(() => undefined);
      if (value) secrets.push(value);
    }
    const clean = observations.map((o) => ({ ...o, text: scrub(o.text, secrets) }));
    await tellAgent(s.events, agent, { id: `${KNOWLEDGE_PREFIX}${runId}`, message: knowledgeBrief(s, run, clean) });
  } catch (error) {
    log.error('revisão de conhecimento não começou', { conversation: run.conversationId, error: error instanceof Error ? error.message : String(error) });
  }
}

/** A step already looks in the brain first when its `how` says so. */
export const consultsBrain = (how: string) => /c[ée]rebro|brain_query/i.test(how);

/**
 * The steps whose output showed a fact and that still go straight to the source
 * (docs/funcionalidades/22): they should look in the brain first, in the same card as the fact.
 */
export function stepsToConsultBrain(steps: ReadonlyArray<{ id: string; label: string; how: string }>, facts: FactCandidate[]): Array<{ id: string; label: string; how: string }> {
  const ids = new Set(facts.map((f) => f.step).filter((x): x is string => !!x));
  return steps.filter((st) => ids.has(st.id) && !consultsBrain(st.how ?? ''));
}

/** The Revisor finished: the facts it found go to the run's conversation, for the Orbi to propose. */
export async function deliverKnowledge(s: OrbiServices, agent: Agent, reviewerConversation: string): Promise<void> {
  const runId = reviewerConversation.slice(KNOWLEDGE_PREFIX.length);
  const facts = s.knowledge.take(runId);
  const run = s.brain.run(runId);
  if (!run || facts.length === 0) return;
  const fresh = facts.filter((f) => f.verdict !== 'já sei');
  const pb = s.brain.playbook(run.playbook);
  const steps = pb ? stepsToConsultBrain(pb.steps, facts) : [];
  if (fresh.length === 0 && steps.length === 0) return;
  // Only those steps may change in that card (brain_learn refuses others), on top of what the
  // end-of-run review already let change; an open scope with no limit stays so.
  if (pb && steps.length) {
    const open = s.brain.review.changeScope(pb.name, run.conversationId);
    if (!open || open.length) s.brain.review.scopeChange(pb.name, [...new Set([...(open ?? []), ...steps.map((st) => st.id)])], runId, run.conversationId);
  }
  try {
    await tellAgent(s.events, agent, {
      id: run.conversationId,
      message: { kind: 'signal', type: 'knowledge', tagName: 'conhecimento', body: knowledgeInstruction(run.playbook, fresh, steps) },
    });
  } catch (error) {
    log.error('fatos da revisão de conhecimento não entregues', { conversation: run.conversationId, error: error instanceof Error ? error.message : String(error) });
  }
}

export function knowledgeInstruction(playbook: string, facts: FactCandidate[], steps: Array<{ id: string; label: string; how: string }> = []): string {
  const lines = facts.map((f) =>
    f.kind === 'entity'
      ? `- ${f.id} (${f.type}) ${JSON.stringify(f.props)}${f.aliases?.length ? ` · também ${f.aliases.join(', ')}` : ''}${f.verdict ? ` [${f.verdict}]` : ''}: ${f.why}`
      : `- ${f.from} ${f.rel} ${f.to}${f.verdict ? ` [${f.verdict}]` : ''}: ${f.why}`,
  );
  const stepPart = steps.length
    ? [
        `No MESMO brain_learn, inclua o procedimento ${playbook} inteiro, mudando só estes passos para consultar primeiro o Cérebro (brain_query) o que eles buscam e, só se não houver, fazer como hoje:`,
        ...steps.map((st) => `- ${st.id}: ${st.label} · hoje: ${st.how}`),
        'Ex.: "Consultar no Cérebro (brain_query) o repositório da aplicação; se não houver, <como é hoje>". Os outros passos ficam exatamente como estão (mesmo id, label e how).',
      ]
    : [];
  return [
    facts.length
      ? `Revisão de conhecimento da execução de ${playbook}: lendo o que a execução retornou, o revisor achou estes fatos (entre colchetes, o que cada um muda no cérebro: o runtime já conferiu):`
      : `Revisão de conhecimento da execução de ${playbook}: os fatos que a execução achou já estão no cérebro, mas os passos de onde vieram ainda vão direto à fonte.`,
    ...lines,
    ...stepPart,
    `Proponha com UM brain_learn: ${facts.length ? 'os fatos certos (itens entity e edge; nenhum tipo novo)' : ''}${facts.length && steps.length ? ' e ' : ''}${steps.length ? `o procedimento ${playbook} com esses passos mudados` : ''}. ` +
      'Em uma linha, diga o que quer guardar. Não rode nada.',
  ].join('\n');
}
