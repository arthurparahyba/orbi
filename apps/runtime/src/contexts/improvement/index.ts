/**
 * The `improvement` context — how the Orbi gets better (documento 26, map in `docs/modulos.md`).
 *
 * This is the context's only door: nothing outside imports a file inside `review/`, `judge/`,
 * `diagnosis/` or `report/` (test/boundary.test.ts checks it). It owns the `diagnoses` and
 * `diagnosis_reports` tables; `review_notes` is still the brain's until phase 4.
 *
 * review     looks at the run that ended and proposes a change to the procedure
 * judge      tells a defect of the procedure from a wrong call by the model
 * diagnosis   detectors for what went wrong, by category, and who writes the report
 * report     the diagnosis report and the issue in the Orbi's own repository
 */

export { sendReview, reviewInstruction } from './review/src/review.ts';
export { KnowledgeCandidates, deliverKnowledge, matchFacts, KNOWLEDGE_PREFIX } from './review/src/knowledge.ts';
export type { FactCandidate } from './review/src/knowledge.ts';
export { retrospective } from './review/src/retrospective.ts';

export { judge, outOfScope, CHANGE_SCOPE_MS } from './judge/src/judge.ts';
export type { ReviewNote, ReviewNoteKind, ReviewNoteStatus } from './judge/src/judge.ts';
export { stepClaimProblems, inlineScriptSuggestions, showSuggestions, defaultSuggestions } from './judge/src/suggestions.ts';

export { Diagnoses, DiagnosisSettings, DEFAULT_SETUP, detect, countsLine, worthTelling, DETECTORS } from './diagnosis/src/diagnoses.ts';
export type { Diagnosis, DiagnosisReport, DiagnosisSetup, DiagnosisWhen, DiagnosisWho, Detected, DiagnosisCategory, Seen } from './diagnosis/src/diagnoses.ts';
export { startReport } from './diagnosis/src/start.ts';

export { AGENT_PROMPT, REPORT_PREFIX, reportBrief } from './report/src/report.ts';
export { draftIssue, issueUrl } from './report/src/issue.ts';
export type { IssueDraft } from './report/src/issue.ts';
export { sendIssue } from './report/src/send.ts';
export type { Sent } from './report/src/send.ts';

export { diagnosisRoutes } from './http.ts';
