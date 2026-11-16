/**
 * The `learning` context — what the developer still has to approve (documento 26, map in
 * `docs/modulos.md`).
 *
 * One module only, so the code is flat in `src/`. It owns the `proposals` table, and it owns the
 * guarantee that a batch lands whole or not at all (docs/funcionalidades/22): a batch may carry a
 * type, a fact, a link, a procedure and an esteira at once, so the transaction crosses
 * `knowledge` and `procedures` and needs a place with a name. This is it.
 */

export { Learning } from './src/learn.ts';
export type { LearningDeps } from './src/learn.ts';
export { ProposalRepo } from './src/repo.ts';
export { changeFromProposal, proposalProblems, pipelineFromPayload, credentialProblems } from './src/changes.ts';
export type { Change, ProposalContext } from './src/changes.ts';
