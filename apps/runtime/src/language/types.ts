/** The brain's vocabulary: what it stores, as the rest of Orbi sees it. */
import type { Deviation, Level, LevelBy, RunAction } from './levels.ts';
import type { PlaybookScript } from '../contexts/procedures/index.ts';
export type { PlaybookScript };

export type Autonomy = 'observe' | 'ask' | 'auto';

export interface OntologyType {
  name: string;
  description: string;
  /** relation name → target type ("*" = any type) */
  relations: Record<string, string>;
  /** relations every entity of this type should have */
  requires: string[];
  /** The subject this type belongs to (documento 28). None = `comum`. */
  domain?: string | null;
  /**
   * O procedimento que confere na fonte um fato deste tipo (documento 28, fase D): a "receita".
   * Fica no tipo e não no fato porque `conta-dev`, `conta-hom` e `conta-prod` se atualizam todas
   * do mesmo jeito, mudando o parâmetro — receita por fato duplicaria e envelheceria em três
   * lugares. Nulo é o normal: um tipo ganha receita quando merece, não por obrigação.
   */
  refresh?: string | null;
  /** Declared properties (name → what it is): what a procedure may cite as {{entrada.propriedade}}. */
  props?: Record<string, string>;
  /** What is known for every entity of the type (name → how): "de pé", "conectar", "achar". */
  knows?: Record<string, string>;
}

/**
 * Onde um fato foi achado **no mundo** (documento 28, fase C) — a fonte de verdade dele, não o
 * evento do Orbi que o escreveu (isso é o `source`). Muita coisa que o Orbi guarda não está na
 * LLM e nunca vai estar: o número de uma conta, uma página da documentação interna da empresa. O
 * que dá para guardar é por onde se chega nela de novo.
 *
 * Nunca é escolhido pelo modelo: é derivado da chamada de ferramenta que produziu o dado — o
 * terminal sabe o programa e os argumentos, o navegador sabe o endereço, o cofre sabe o nome do
 * segredo. Mesmo princípio do domínio: herdado, não inventado.
 */
export interface FoundIn {
  /** `cli` um programa, `page` um endereço, `file` um arquivo, `person` alguém disse, `screen` o desenvolvedor digitou. */
  kind: 'cli' | 'page' | 'file' | 'person' | 'screen';
  /** Como se chega lá de novo: o comando, o endereço, o caminho, a conversa. */
  ref: string;
  /** Quando foi visto assim. */
  at: string;
}

export interface Entity {
  id: string;
  type: string;
  props: Record<string, unknown>;
  body: string;
  /** Other names it goes by ("xpto" for xpto-mfe): found by them too. */
  aliases?: string[];
  /** Where the fact came from: "cartao:<conversa>", "execucao:<run>", "tela". */
  source?: string;
  /** The subject it was learned in (documento 28). None = `comum`: it holds in every domain. */
  domain?: string | null;
  /** Onde foi achado no mundo (documento 28, fase C): a fonte de verdade. */
  foundIn?: FoundIn | null;
  /** Quando o valor foi conferido na fonte pela última vez. */
  checkedAt?: string | null;
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

/** What a procedure receives each time, typed by a concept when it has one (mfe: MicroFrontend). */
export interface PlaybookParam {
  name: string;
  /** Ontology type the value is an instance of; none = a plain value (a version, a date). */
  concept?: string;
  description?: string;
}

/** Something a playbook hands over when it finishes (a version, a PR link, a change number). */
export interface PlaybookOutput {
  name: string;
  description: string;
}

export interface Playbook {
  /** O assunto a que o procedimento pertence (documento 28). Nulo é `comum`. */
  domain?: string | null;
  name: string;
  description: string;
  /** Ontology type or entity the playbook applies to, e.g. "Repositorio" or "classe:FrontEnd". */
  appliesTo: string | null;
  trigger: string;
  autonomy: Autonomy;
  steps: PlaybookStep[];
  instructions: string;
  learnedFrom: string | null;
  /** What it is for, in terms of concepts ("publicar uma Versão de um MicroFrontend em um Ambiente"). */
  intent?: string;
  /** What it receives; steps cite them as {{nome}} and {{nome.propriedade}}. Empty = the older free {{parameters}}. */
  inputs?: PlaybookParam[];
  /** The rehearsal (or run) that proved it works. */
  testedRun?: string | null;
  /** The playbook this one was made from ("variação de"); the base is not changed by it. */
  variationOf: string | null;
  /** What it hands over at the end, for whoever comes next (an esteira's next stage, an agent). */
  outputs: PlaybookOutput[];
  /** Its own scripts, run by name with run_script (domain/scripts.ts). */
  scripts: PlaybookScript[];
  /** Autonomy that grows with use (domain/levels.ts). */
  level: Level;
  levelMax: Level;
  levelBy: LevelBy;
  cleanStreak: number;
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
  /** 'rehearsal': trying out what was explained, before there is a procedure. */
  kind?: 'run' | 'rehearsal';
  steps: Array<PlaybookStep & { status: StepStatus; note?: string }>;
  /** Inputs resolved to facts (passo 0): input → what it became and what was learned on the way. */
  resolved?: Record<string, ResolvedInput>;
  /** The {{parameters}} it ran with. */
  params: Record<string, string>;
  /** Approvals the gate asked for during the run. */
  asked?: number;
  /** Model tokens and cost spent while the run was open. */
  usage?: { tokensIn: number; tokensOut: number; costUsd: number };
  /** What it handed over (declared outputs only). */
  outputs: Record<string, string>;
  /** Actions it ran (they become known when the run ends without deviation). */
  actions: RunAction[];
  /** What went off the path: a tool failed, an action was denied. */
  deviations: Deviation[];
  startedAt: string;
  finishedAt: string | null;
}

/** How an input became a fact: found as it was, by another name, or learned in this run. */
export interface ResolvedInput {
  value: string;
  entity: string;
  /** created: a new fact; alias: the value was added as another name of `entity`; known: it was already there. */
  learned: 'known' | 'alias' | 'created';
  /** The developer took back what was learned. */
  undone?: boolean;
}

export type ProposalKind = 'entity' | 'edge' | 'playbook' | 'type' | 'pipeline';

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

/** A playbook as saved: outputs may be left out (none). */
export type PlaybookInput = Omit<Playbook, 'uses' | 'successes' | 'updatedAt' | 'outputs' | 'scripts' | 'level' | 'levelMax' | 'levelBy' | 'cleanStreak'> & {
  outputs?: PlaybookOutput[];
  /** Left out: the scripts it already has stay. */
  scripts?: PlaybookScript[];
};
