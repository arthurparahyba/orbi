import type { DatabaseSync } from 'node:sqlite';
import type { OntologyRepo } from '../repo/ontology.ts';
import type { GraphRepo } from '../repo/graph.ts';
import type { PlaybookRepo } from '../repo/playbooks.ts';
import type { PipelineRepo } from '../repo/pipelines.ts';
import type { ProposalRepo } from '../repo/proposals.ts';
import type { LevelRepo } from '../repo/levels.ts';

/** The database and the repositories every part of the brain shares. */
export interface BrainParts {
  db: DatabaseSync;
  ontology: OntologyRepo;
  graphRepo: GraphRepo;
  playbookRepo: PlaybookRepo;
  pipelineRepo: PipelineRepo;
  proposalRepo: ProposalRepo;
  levels: LevelRepo;
}
