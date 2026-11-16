import type { DatabaseSync } from 'node:sqlite';
import { ulid } from 'ulidx';
import { transaction } from '../../../db/database.ts';
import { now } from '../../../db/rows.ts';
import type { Entity, OntologyType, Playbook, PlaybookInput, Proposal, ProposalKind } from '../../../language/index.ts';
import { changeFromProposal, proposalProblems } from './changes.ts';
import type { PipelineInputDef } from '../../procedures/index.ts';
import type { ProposalRepo } from './repo.ts';

/**
 * What learning writes into its neighbours. A batch lands whole or not at all
 * (docs/funcionalidades/22), and a batch may carry a type, a fact, a link, a procedure and an
 * esteira at once — so the atomicity crosses `knowledge` and `procedures`, and this context owns
 * it. The contexts share one SQLite connection, so one transaction wraps the lot (documento 26).
 */
export interface LearningDeps {
  db: DatabaseSync;
  proposals: ProposalRepo;
  knowledge: {
    typeOf(name: string): OntologyType | undefined;
    entity(id: string): Entity | undefined;
    upsertType(type: Pick<OntologyType, 'name' | 'description'> & Partial<OntologyType>): void;
    /** Adds to a fact that exists: what it had stays (docs/funcionalidades/22). */
    upsertEntity(entity: Omit<Entity, 'updatedAt'>): unknown;
    addEdge(edge: { from: string; rel: string; to: string; attrs?: Record<string, unknown>; validFrom?: string; validTo?: string | null }): unknown;
  };
  procedures: {
    playbook(name: string): Playbook | undefined;
    savePlaybook(playbook: PlaybookInput): unknown;
    savePipeline(pipeline: PipelineInputDef): unknown;
  };
}

/** What the developer still has to approve, and what applying it does. */
export class Learning {
  constructor(private readonly d: LearningDeps) {}

  /** What would be wrong with this proposal, before anyone is asked. */
  check(kind: ProposalKind, payload: Record<string, unknown>): string[] {
    return proposalProblems(kind, payload, {
      typeOf: this.d.knowledge.typeOf,
      entity: (id) => this.d.knowledge.entity(id),
      playbook: (name) => this.d.procedures.playbook(name),
    });
  }

  propose(kind: ProposalKind, payload: Record<string, unknown>, reason: string, conversationId: string): Proposal {
    const problems = this.check(kind, payload);
    if (problems.length) throw new Error(`proposta inválida: ${problems.join('; ')}`);
    const proposal: Proposal = { id: ulid(), kind, payload, reason, conversationId, status: 'open', createdAt: now() };
    this.d.proposals.insert(proposal);
    return proposal;
  }

  proposals(status: Proposal['status'] = 'open'): Proposal[] {
    return this.d.proposals.list(status);
  }

  /** Applies an approved proposal to whichever context it belongs to. */
  apply(proposalId: string): string {
    const proposal = this.d.proposals.get(proposalId);
    if (!proposal) throw new Error(`proposta não encontrada ou já decidida: ${proposalId}`);
    const change = changeFromProposal(proposal.kind, proposal.payload, proposal.conversationId);
    transaction(this.d.db, () => {
      if (change.kind === 'type') this.d.knowledge.upsertType(change.type);
      else if (change.kind === 'entity') this.d.knowledge.upsertEntity(change.entity);
      else if (change.kind === 'edge') this.d.knowledge.addEdge(change.edge);
      else if (change.kind === 'pipeline') this.d.procedures.savePipeline(change.pipeline);
      else this.d.procedures.savePlaybook(change.playbook);
      this.d.proposals.setStatus(proposalId, 'applied');
    });
    return change.label;
  }

  /**
   * Learns a whole batch at once (all of it lands, or none), in the order given: types first, so
   * an entity can use a type from the same batch.
   */
  learn(items: Array<{ kind: ProposalKind; payload: Record<string, unknown> }>, reason: string, conversationId: string): string[] {
    return transaction(this.d.db, () => items.map((item) => this.apply(this.propose(item.kind, item.payload, reason, conversationId).id)));
  }

  /** What would go wrong learning this batch, without keeping anything (checked before asking). */
  learnProblems(items: Array<{ kind: ProposalKind; payload: Record<string, unknown> }>): string[] {
    const problems: string[] = [];
    transaction(
      this.d.db,
      () => {
        for (const item of items) {
          try {
            transaction(this.d.db, () => this.apply(this.propose(item.kind, item.payload, 'verificação', '').id));
          } catch (error) {
            const label = String(item.payload.name ?? item.payload.id ?? `${item.payload.from} → ${item.payload.to}`);
            problems.push(`${item.kind} ${label}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      },
      { rollback: true },
    );
    return problems;
  }

  reject(proposalId: string): void {
    this.d.proposals.setStatus(proposalId, 'rejected');
  }

  countOpen(): number {
    return this.d.proposals.countOpen();
  }
}
