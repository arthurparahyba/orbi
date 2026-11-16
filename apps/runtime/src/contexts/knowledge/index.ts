/**
 * The `knowledge` context — what the Orbi knows (documento 26, map in `docs/modulos.md`).
 *
 * This is the context's only door (test/boundary.test.ts checks it). It owns the `types`,
 * `entities`, `edges` and `domains` tables, and it imports no other context.
 *
 * domains   o assunto em que cada coisa foi aprendida, e as pontes entre eles (documento 28)
 * ontology  the types the developer taught, and what each may link to
 * facts     entities and links, and whether a new fact already exists
 * search    the FTS5 index over facts and procedures
 * problems  facts of type problema, matched against the text of an error
 */

export { entityPanel, type EntityPanel, type NoEntity } from './use-cases/entity-panel.ts';
export { suggestDomain, type About, type Suggestion } from './use-cases/suggest-domain.ts';
export { domainOverview, type DomainOverview } from './use-cases/domain-overview.ts';
export { domainDetail, type DomainDetail, type NoDomain } from './use-cases/domain-detail.ts';
export { howToRefresh, type Refresh, type NoRefresh } from './use-cases/how-to-refresh.ts';

export { Domains } from './domains/src/domains.ts';
export { DomainRepo } from './domains/src/repo.ts';
export type { Bridge, Domain, DomainSize, ProceduresByDomain } from './domains/src/domains.ts';

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
