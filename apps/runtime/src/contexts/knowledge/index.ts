/**
 * The `knowledge` context — what the Orbi knows (documento 26, map in `docs/modulos.md`).
 *
 * This is the context's only door (test/boundary.test.ts checks it). It owns the `types`,
 * `entities` and `edges` tables, and it imports no other context.
 *
 * ontology  the types the developer taught, and what each may link to
 * facts     entities and links, and whether a new fact already exists
 * search    the FTS5 index over facts and procedures
 * problems  facts of type problema, matched against the text of an error
 */

export { Facts } from './facts/src/facts.ts';
export { GraphRepo } from './facts/src/repo.ts';
export { OntologyRepo } from './ontology/src/repo.ts';
export { factsForRun } from './facts/src/for-run.ts';
export type { FactsForRun } from './facts/src/for-run.ts';

export { entityProblems, edgeProblems, findGaps, isTypeName, EXAMPLE_TYPES } from './ontology/src/ontology.ts';
export { classifyEntity, mergeEntity, compact, verdictLine } from './facts/src/match.ts';
export type { Candidate, FactVerdict } from './facts/src/match.ts';
export { ftsQuery, sharedStems, stem, words } from './search/src/similarity.ts';
export {
  asKnownProblem,
  fixedByCodeAgent,
  matchesProblem,
  knownProblemsFor,
  errorTail,
  knowledgeSuggestions,
  problemsIn,
  recurrence,
} from './problems/src/problems.ts';
export type { KnownProblem } from './problems/src/problems.ts';

export { brainRoutes } from './http.ts';
