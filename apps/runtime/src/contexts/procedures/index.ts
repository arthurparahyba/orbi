/**
 * The `procedures` context — what the Orbi knows how to do, and what it is doing (documento 26,
 * map in `docs/modulos.md`).
 *
 * This is the context's only door (test/boundary.test.ts checks it). It owns the `playbooks`,
 * `playbook_runs`, `run_calls`, `playbook_proofs`, `playbook_learnings`, `pipelines` and
 * `pipeline_runs` tables. It reads `knowledge` through the narrow `FactsForRun` port and asks
 * `trust` for a procedure's level; neither of them reaches back in here.
 *
 * flows       what each feature of this context does, step by step, in calls only (documento 27)
 * definition  the procedure, its steps, scripts, inputs, outputs and variations
 * rehearsal   the test run that proves a procedure before it counts
 * execution   the real run: steps, step 0, the call registry, deviations
 * proofs      which step already ran as it is written
 * learnings   what each step already tried, and how it went
 * pipelines   procedures in sequence, and the engine that picks the next stage
 */

export { findSimilarProcedures } from './flows/find-similar.ts';
export type { SimilarProcedure } from './flows/find-similar.ts';
export { startProcedure } from './flows/start-procedure.ts';
export type { Started, Refused } from './flows/start-procedure.ts';

export { Procedures } from './definition/src/service.ts';
export type { ProceduresDeps } from './definition/src/service.ts';
export { PlaybookRepo } from './definition/src/repo.ts';
export * from './definition/src/playbooks.ts';
export * from './definition/src/scripts.ts';
export * from './definition/src/concepts.ts';

export * from './rehearsal/src/rehearsal.ts';

export { Execution } from './execution/src/service.ts';
export type { ExecutionDeps } from './execution/src/service.ts';
export { RunCallRepo } from './execution/src/calls-repo.ts';
export * from './execution/src/run-calls.ts';

export { ProofRepo } from './proofs/src/repo.ts';
export * from './proofs/src/proofs.ts';

export { StepLearningRepo } from './learnings/src/repo.ts';
export * from './learnings/src/learnings.ts';

export { PipelineDefs } from './pipelines/src/service.ts';
export type { PipelineDeps } from './pipelines/src/service.ts';
export { PipelineRepo } from './pipelines/src/repo.ts';
export * from './pipelines/src/pipelines.ts';
export * from './pipelines/src/config.ts';
export * from './pipelines/src/engine.ts';
export * from './pipelines/src/runs.ts';

export { pipelineRoutes, pipelineRunRoutes } from './pipelines-http.ts';
export { stepLearningRoutes } from './learnings-http.ts';
