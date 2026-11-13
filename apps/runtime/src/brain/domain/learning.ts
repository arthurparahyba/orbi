import { entityProblems, isTypeName } from './ontology.ts';
import { scriptProblems, type PlaybookScript } from './scripts.ts';
import { pipelineProblems, type PipelineInputDef } from './pipelines.ts';
import type { Autonomy, Edge, Entity, OntologyType, Playbook, PlaybookInput, PlaybookOutput, PlaybookStep, ProposalKind } from './types.ts';

/**
 * Learning: what Orbi proposes to remember waits for the developer. These rules
 * check a proposal and turn an approved one into the change to store.
 */

export interface ProposalContext {
  typeOf(name: string): OntologyType | undefined;
  entity(id: string): Entity | undefined;
  playbook(name: string): Playbook | undefined;
}

/** Dry-run validation against the current ontology; empty = can be proposed. */
export function proposalProblems(kind: ProposalKind, payload: Record<string, unknown>, ctx: ProposalContext): string[] {
  switch (kind) {
    case 'type':
      return isTypeName(payload.name) ? [] : ['nome de tipo inválido'];
    case 'entity':
      return [...entityProblems({ id: String(payload.id ?? ''), type: String(payload.type ?? '') }, ctx.typeOf), ...credentialProblems(payload.props)];
    case 'edge': {
      // The endpoints may be created by an earlier proposal in the same batch; only check the relation name then.
      const from = ctx.entity(String(payload.from));
      if (!from) return [];
      return ctx.typeOf(from.type)?.relations[String(payload.rel)] ? [] : [`ligação "${payload.rel}" não existe para ${from.type}`];
    }
    case 'playbook':
    {
      if (!Array.isArray(payload.steps) || payload.steps.length === 0) return ['playbook sem passos'];
      // Left out, the scripts it has stay: the steps are checked against those.
      // A new version of another procedure starts with its base's scripts (Procedures.savePlaybook).
      const scripts = Array.isArray(payload.scripts)
        ? (payload.scripts as PlaybookScript[])
        : (ctx.playbook(String(payload.name)) ?? (payload.variationOf ? ctx.playbook(String(payload.variationOf)) : undefined))?.scripts;
      return scriptProblems(scripts, (payload.steps as PlaybookStep[]).map((st) => ({ id: String(st.id), how: String(st.how ?? '') })));
    }
    case 'pipeline':
      return pipelineProblems(pipelineFromPayload(payload), ctx.playbook);
  }
}

/** An esteira from a proposal or a request body, with defaults. */
export function pipelineFromPayload(p: Record<string, unknown>): PipelineInputDef {
  return {
    name: String(p.name ?? ''),
    description: String(p.description ?? ''),
    inputs: Array.isArray(p.inputs) ? (p.inputs as PipelineInputDef['inputs']) : [],
    stages: Array.isArray(p.stages)
      ? (p.stages as PipelineInputDef['stages']).map((s) => ({ ...s, passage: s.passage === 'auto' ? 'auto' : 'ask', options: Array.isArray(s.options) ? s.options : [] }))
      : [],
  };
}

/** The change an approved proposal makes, ready for the repositories. */
export type Change =
  | { kind: 'type'; type: Pick<OntologyType, 'name' | 'description'> & Partial<OntologyType>; label: string }
  | { kind: 'entity'; entity: Omit<Entity, 'updatedAt'>; label: string }
  | { kind: 'edge'; edge: { from: string; rel: string; to: string; attrs: Record<string, unknown>; validFrom?: string; validTo: string | null }; label: string }
  | { kind: 'playbook'; playbook: PlaybookInput; label: string }
  | { kind: 'pipeline'; pipeline: PipelineInputDef; label: string };

export function changeFromProposal(kind: ProposalKind, p: Record<string, unknown>, conversationId: string): Change {
  switch (kind) {
    case 'type':
      return {
        kind,
        label: `tipo ${p.name}`,
        // Left out, relations and requires stay as they were (Facts.upsertType); props and knows add up.
        type: {
          name: String(p.name),
          description: String(p.description ?? ''),
          ...(p.relations ? { relations: p.relations as Record<string, string> } : {}),
          ...(p.requires ? { requires: p.requires as string[] } : {}),
          ...(p.props ? { props: p.props as Record<string, string> } : {}),
          ...(p.knows ? { knows: p.knows as Record<string, string> } : {}),
        },
      };
    case 'entity':
      return {
        kind,
        label: `${p.type} ${p.id}`,
        entity: {
          id: String(p.id),
          type: String(p.type),
          props: (p.props as Record<string, unknown>) ?? {},
          body: String(p.body ?? ''),
          ...(Array.isArray(p.aliases) ? { aliases: (p.aliases as unknown[]).map(String) } : {}),
          source: conversationId ? `cartao:${conversationId}` : 'cartao',
        },
      };
    case 'edge':
      return {
        kind,
        label: `${p.from} —${p.rel}→ ${p.to}`,
        edge: {
          from: String(p.from),
          rel: String(p.rel),
          to: String(p.to),
          attrs: (p.attrs as Record<string, unknown>) ?? {},
          validFrom: p.validFrom ? String(p.validFrom) : undefined,
          validTo: p.validTo ? String(p.validTo) : null,
        } satisfies Partial<Edge>,
      };
    case 'playbook':
      return {
        kind,
        label: `playbook ${p.name}`,
        playbook: {
          name: String(p.name),
          description: String(p.description ?? ''),
          appliesTo: p.appliesTo ? String(p.appliesTo) : null,
          trigger: String(p.trigger ?? ''),
          autonomy: (p.autonomy as Autonomy) ?? 'ask',
          steps: p.steps as PlaybookStep[],
          instructions: String(p.instructions ?? ''),
          learnedFrom: conversationId || null,
          // Left out (a correction of the steps), intent and inputs stay as they were (Procedures.savePlaybook).
          ...(p.intent !== undefined ? { intent: String(p.intent) } : {}),
          ...(Array.isArray(p.inputs)
            ? {
                inputs: (p.inputs as Array<Record<string, unknown>>).map((i) => ({
                  name: String(i.name ?? ''),
                  ...(i.concept ? { concept: String(i.concept) } : {}),
                  ...(i.description ? { description: String(i.description) } : {}),
                })),
              }
            : {}),
          ...(p.testedRun ? { testedRun: String(p.testedRun) } : {}),
          variationOf: p.variationOf ? String(p.variationOf) : null,
          // Left out: what it hands over stays as it was (Procedures.savePlaybook).
          ...(Array.isArray(p.outputs)
            ? { outputs: (p.outputs as Array<Partial<PlaybookOutput>>).map((o) => ({ name: String(o.name ?? ''), description: String(o.description ?? '') })) }
            : {}),
          // Left out: the scripts the playbook already has stay (store.savePlaybook).
          ...(Array.isArray(p.scripts)
            ? {
                scripts: (p.scripts as Array<Partial<PlaybookScript>>).map((s) => ({
                  name: String(s.name ?? ''),
                  description: String(s.description ?? ''),
                  code: String(s.code ?? ''),
                  ...(s.effect === 'publica' ? { effect: 'publica' as const } : {}),
                })),
              }
            : {}),
        },
      };
    case 'pipeline':
      return { kind, label: `esteira ${p.name}`, pipeline: pipelineFromPayload(p) };
  }
}

const SECRET_NAME = /^(?:.*[_-])?(senha|password|passwd|pwd|secret|segredo|token|api[_-]?key|apikey|private[_-]?key|credencial|credential)s?$/i;
const SECRET_VALUE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abpr]-[A-Za-z0-9-]{10,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.)/;
const REFERENCE = /^\s*\{\{segredo:[^}]+\}\}\s*$/;

/**
 * Credentials never go to the brain: a fact whose property is named like one, or whose value
 * looks like one (a private key, an access key, a token), is refused. A {{segredo:name}}
 * reference is fine: the value stays in the vault.
 */
export function credentialProblems(props: unknown): string[] {
  if (!props || typeof props !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    const text = typeof v === 'string' ? v : JSON.stringify(v ?? '');
    if (REFERENCE.test(text)) continue;
    if (SECRET_NAME.test(k) || SECRET_VALUE.test(text)) {
      out.push(`a propriedade ${k} parece uma credencial: credenciais ficam no cofre (ask_secret), nunca no cérebro`);
    }
  }
  return out;
}
