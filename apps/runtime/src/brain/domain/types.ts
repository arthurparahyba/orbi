/** The brain's vocabulary: what it stores, as the rest of Orbi sees it. */

export type Autonomy = 'observe' | 'ask' | 'auto';

export interface OntologyType {
  name: string;
  description: string;
  /** relation name → target type ("*" = any type) */
  relations: Record<string, string>;
  /** relations every entity of this type should have */
  requires: string[];
}

export interface Entity {
  id: string;
  type: string;
  props: Record<string, unknown>;
  body: string;
  updatedAt: string;
}

export interface Edge {
  from: string;
  rel: string;
  to: string;
  attrs: Record<string, unknown>;
  validFrom: string;
  validTo: string | null;
}

export interface PlaybookStep {
  id: string;
  label: string;
  /** How the step is done: which capability and what to check. Free text for the model. */
  how: string;
}

export interface Playbook {
  name: string;
  description: string;
  /** Ontology type or entity the playbook applies to, e.g. "Repositorio" or "classe:FrontEnd". */
  appliesTo: string | null;
  trigger: string;
  autonomy: Autonomy;
  steps: PlaybookStep[];
  instructions: string;
  learnedFrom: string | null;
  /** The playbook this one was made from ("variação de"); the base is not changed by it. */
  variationOf: string | null;
  uses: number;
  successes: number;
  updatedAt: string;
}

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'waiting' | 'skipped';

export interface PlaybookRun {
  id: string;
  playbook: string;
  conversationId: string;
  status: 'running' | 'done' | 'failed' | 'waiting';
  steps: Array<PlaybookStep & { status: StepStatus; note?: string }>;
  startedAt: string;
  finishedAt: string | null;
}

export type ProposalKind = 'entity' | 'edge' | 'playbook' | 'type';

export interface Proposal {
  id: string;
  kind: ProposalKind;
  payload: Record<string, unknown>;
  reason: string;
  conversationId: string;
  status: 'open' | 'applied' | 'rejected';
  createdAt: string;
}

export interface Gap {
  entity: string;
  type: string;
  missing: string;
}
