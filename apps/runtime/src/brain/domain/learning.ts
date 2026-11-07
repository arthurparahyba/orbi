import { entityProblems, isTypeName } from './ontology.ts';
import type { Autonomy, Edge, Entity, OntologyType, Playbook, PlaybookStep, ProposalKind } from './types.ts';

/**
 * Learning: what Orbi proposes to remember waits for the developer. These rules
 * check a proposal and turn an approved one into the change to store.
 */

export interface ProposalContext {
  typeOf(name: string): OntologyType | undefined;
  entity(id: string): Entity | undefined;
}

/** Dry-run validation against the current ontology; empty = can be proposed. */
export function proposalProblems(kind: ProposalKind, payload: Record<string, unknown>, ctx: ProposalContext): string[] {
  switch (kind) {
    case 'type':
      return isTypeName(payload.name) ? [] : ['nome de tipo inválido'];
    case 'entity':
      return entityProblems({ id: String(payload.id ?? ''), type: String(payload.type ?? '') }, ctx.typeOf);
    case 'edge': {
      // The endpoints may be created by an earlier proposal in the same batch; only check the relation name then.
      const from = ctx.entity(String(payload.from));
      if (!from) return [];
      return ctx.typeOf(from.type)?.relations[String(payload.rel)] ? [] : [`ligação "${payload.rel}" não existe para ${from.type}`];
    }
    case 'playbook':
      return Array.isArray(payload.steps) && payload.steps.length > 0 ? [] : ['playbook sem passos'];
  }
}

/** The change an approved proposal makes, ready for the repositories. */
export type Change =
  | { kind: 'type'; type: OntologyType; label: string }
  | { kind: 'entity'; entity: Omit<Entity, 'updatedAt'>; label: string }
  | { kind: 'edge'; edge: { from: string; rel: string; to: string; attrs: Record<string, unknown>; validFrom?: string; validTo: string | null }; label: string }
  | { kind: 'playbook'; playbook: Omit<Playbook, 'uses' | 'successes' | 'updatedAt'>; label: string };

export function changeFromProposal(kind: ProposalKind, p: Record<string, unknown>, conversationId: string): Change {
  switch (kind) {
    case 'type':
      return {
        kind,
        label: `tipo ${p.name}`,
        type: { name: String(p.name), description: String(p.description ?? ''), relations: (p.relations as Record<string, string>) ?? {}, requires: (p.requires as string[]) ?? [] },
      };
    case 'entity':
      return {
        kind,
        label: `${p.type} ${p.id}`,
        entity: { id: String(p.id), type: String(p.type), props: (p.props as Record<string, unknown>) ?? {}, body: String(p.body ?? '') },
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
          variationOf: p.variationOf ? String(p.variationOf) : null,
        },
      };
  }
}
