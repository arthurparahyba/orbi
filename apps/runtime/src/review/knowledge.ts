import type { OrbiServices } from '../services.ts';
import type { Agent } from '../agents/runtime-port.ts';
import type { PlaybookRun } from '../brain/domain/types.ts';
import type { Observation } from '../observability/run-observations.ts';
import { tellAgent } from '../conversations/tell.ts';
import { redact } from '../vault/vault.ts';
import { log } from '../observability/log.ts';

/**
 * The knowledge review at the end of a run (docs/funcionalidades/19): what the run read (command
 * output, pages) goes, cleaned of credentials, to the Revisor agent (agents/revisor.ts, the cheap
 * model), which proposes facts about concepts the brain already has. When it is done, the facts
 * go to the run's conversation and the Orbi proposes them with brain_learn: the developer approves
 * on the learning card, as with anything learned.
 */
export const KNOWLEDGE_PREFIX = 'revisao:';

export type FactCandidate =
  | { kind: 'entity'; id: string; type: string; props: Record<string, unknown>; aliases?: string[]; why: string }
  | { kind: 'edge'; from: string; rel: string; to: string; why: string };

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

/** The Revisor finished: the facts it found go to the run's conversation, for the Orbi to propose. */
export async function deliverKnowledge(s: OrbiServices, agent: Agent, reviewerConversation: string): Promise<void> {
  const runId = reviewerConversation.slice(KNOWLEDGE_PREFIX.length);
  const facts = s.knowledge.take(runId);
  const run = s.brain.run(runId);
  if (!run || facts.length === 0) return;
  try {
    await tellAgent(s.events, agent, {
      id: run.conversationId,
      message: { kind: 'signal', type: 'knowledge', tagName: 'conhecimento', body: knowledgeInstruction(run.playbook, facts) },
    });
  } catch (error) {
    log.error('fatos da revisão de conhecimento não entregues', { conversation: run.conversationId, error: error instanceof Error ? error.message : String(error) });
  }
}

export function knowledgeInstruction(playbook: string, facts: FactCandidate[]): string {
  const lines = facts.map((f) =>
    f.kind === 'entity'
      ? `- ${f.id} (${f.type}) ${JSON.stringify(f.props)}${f.aliases?.length ? ` · também ${f.aliases.join(', ')}` : ''}: ${f.why}`
      : `- ${f.from} ${f.rel} ${f.to}: ${f.why}`,
  );
  return [
    `Revisão de conhecimento da execução de ${playbook}: lendo o que a execução retornou, o revisor achou estes fatos:`,
    ...lines,
    'Proponha os que estão certos com UM brain_learn só de fatos (itens entity e edge; nenhum procedimento e nenhum tipo novo). ' +
      'Em uma linha, diga o que quer guardar. Não rode nada.',
  ].join('\n');
}
