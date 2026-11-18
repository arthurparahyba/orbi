/**
 * Os procedimentos e as esteiras: o que o Orbi sabe fazer, o que uma execução fez, e a prova
 * de cada passo.
 */

import type { ActionEffect, Autonomy } from './trust.ts';

/** What a procedure receives each time, typed by a concept when it has one. */
export interface PlaybookParam { name: string; concept?: string; description?: string }

export interface Playbook {
  name: string; description: string; appliesTo: string | null; trigger: string; autonomy: Autonomy;
  steps: Array<{ id: string; label: string; how: string }>; instructions: string;
  /** Over concepts: what it is for, what it receives, and the rehearsal that proved it. */
  intent?: string; inputs?: PlaybookParam[]; testedRun?: string | null;
  /** The playbook this one was made from ("variação de"). */
  variationOf: string | null; uses: number; successes: number; updatedAt: string;
  /** What it hands over when it finishes, for the next stage of an esteira or an agent. */
  outputs: PlaybookOutput[];
  /** Its own Python scripts, approved with it and run by name (run_script). */
  scripts: PlaybookScript[];
  /** Autonomy that grows with use: 1 Aprendendo, 2 Assistido, 3 Autônomo; the ceiling; who set it. */
  level: 1 | 2 | 3; levelMax: 1 | 2 | 3; levelBy: 'learned' | 'promoted' | 'demoted' | 'user'; cleanStreak: number;
}

/** GET /api/brain/proofs — where each procedure stands: which steps already ran as they are written (docs/funcionalidades/25). */
export interface PlaybookProof {
  state: 'rascunho' | 'parcial' | 'provado';
  /** Steps still to prove, and steps the developer excused, in the procedure's order. */
  missing: string[];
  waived: string[];
  /** The line the developer reads: "provado", "falta provar o passo 3 · Filtrar". */
  label: string;
}

/** GET /api/brain/runs/:id/calls — what each tool call of an execution did (docs/funcionalidades/24). */
export interface RunCall {
  id: string; runId: string | null; conversationId: string; step: string | null; tool: string; summary: string;
  status: 'ok' | 'erro' | 'pediu' | 'negado' | 'observado' | 'recusado';
  approval: 'sozinha' | 'pedida' | 'aprovada' | 'negada' | null;
  error: string; durationMs: number; chars: number; marks: Array<'caro' | 'cortado' | 'chamada' | 'recusado-depois'>; at: string;
}

/** GET /api/step-learnings?playbook= — what was already tried in a procedure, by step (docs/funcionalidades/25). */
export interface StepLearning {
  id: string; playbook: string; step: string | null; tried: string; outcome: 'falhou' | 'funcionou' | 'negado' | 'orbi'; why: string;
  source: 'execucao' | 'revisao' | 'pedido' | 'orbi'; runId: string | null; conversationId: string; times: number; createdAt: string; updatedAt: string;
}

export interface PlaybookOutput { name: string; description: string }

export interface PlaybookScript { name: string; description: string; code: string; effect?: 'local' | 'publica' }

export interface PlaybookRun {
  id: string; playbook: string; conversationId: string; status: 'running' | 'done' | 'failed' | 'waiting';
  steps: Array<{ id: string; label: string; status: string; note?: string }>; startedAt: string; finishedAt: string | null;
  params: Record<string, string>; outputs: Record<string, string>;
  kind?: 'run' | 'rehearsal';
  /** Inputs resolved to facts (passo 0), and whether the run learned them by itself. */
  resolved?: Record<string, { value: string; entity: string; learned: 'known' | 'alias' | 'created'; undone?: boolean }>;
  actions: Array<{ fingerprint: string; tool: string; effect: ActionEffect; summary: string; step: string | null }>;
  /** `recovered`: the same step got past it right away (the tool worked next), not a problem. */
  deviations: Array<{ kind: 'falha' | 'negado' | 'passo' | 'comando' | 'intervencao' | 'chamada'; detail: string; tool?: string; step?: string | null; at: string; recovered?: boolean; command?: string; known?: boolean; problem?: string }>;
  /** Approvals asked during the run; model tokens and cost while it was open. */
  asked?: number;
  usage?: { tokensIn: number; tokensOut: number; costUsd: number };
}

/** Esteira: procedures in sequence (GET /api/pipelines). */
export interface PipelineInput { name: string; description: string; options?: string[]; default?: string }

export interface PipelineOption { playbook: string; when?: { field: string; equals: string }; map?: Record<string, string> }

export interface PipelineStage { id: string; label: string; options: PipelineOption[]; passage: 'ask' | 'auto' }

export interface Pipeline {
  name: string; description: string; inputs: PipelineInput[]; stages: PipelineStage[]; uses: number; updatedAt: string;
  /** Configuration problems: data that does not reach a stage, steps that ask what comes from before. */
  warnings?: Array<{ stage: string; playbook: string; text: string }>;
  /** Parameters nothing hands over: the Orbi will ask at that stage. */
  gaps?: Array<{ stage: string; playbook: string; param: string }>;
}

export interface PipelineRunStage {
  id: string; label: string; playbook: string | null; runId: string | null;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  params: Record<string, string>; from: Record<string, string>; outputs: Record<string, string>;
  startedAt: string | null; finishedAt: string | null;
}

/** One delivery: an esteira running in a conversation. */
export interface PipelineRun {
  id: string; pipeline: string; conversationId: string; status: 'running' | 'waiting' | 'done' | 'cancelled';
  destination: string | null; inputs: Record<string, string>; stages: PipelineRunStage[]; current: number;
  requestedBy: string; skipQuestions: boolean;
  waiting: { kind: 'passage' | 'failure' | 'params'; stage: string; missing?: string[]; message?: string; inboxId?: string } | null;
  createdAt: string; updatedAt: string; finishedAt: string | null;
}

/**
 * GET /api/brain/playbooks/:name/share — o que a tela de exportar mostra antes de gerar o arquivo:
 * o que viaja, o que fica (com o porquê de cada um), e os fatos que você pode escolher mandar.
 */
export interface ShareProcedure {
  name: string;
  /** Quantos passos, scripts, entradas e entregas vão no pacote: os números da caixinha. */
  counts: { steps: number; scripts: number; inputs: number; outputs: number };
  /** Os conceitos que viajam, por nome: sem a palavra, o passo que a cita não quer dizer nada. */
  types: string[];
  /** Os nomes dos segredos que o procedimento cita. O valor nunca sai do cofre. */
  secrets: string[];
  /** Quantos aprendizados existem, se você quiser mandá-los junto. */
  learnings: number;
  /** O que fica nesta máquina, com o porquê escrito. */
  leftBehind: Array<{ field: string; why: string }>;
  /** Os fatos que você pode escolher, com o que cada um revela. */
  facts: Array<{ id: string; type: string; reveals: string }>;
}

/**
 * POST /api/brain/procedures/package (ler) e /import (aplicar) — o que a caixinha mostra de um
 * pacote que chegou de outra pessoa: o que ele é, o que vai entrar, e o que já existe aqui.
 */
export interface PackageSeen {
  name: string;
  description: string;
  domain: string | null;
  counts: { steps: number; inputs: number; outputs: number; scripts: number };
  /** Já existe um procedimento com este nome aqui: aplicar não vai em cima dele. */
  conflict: boolean;
  newTypes: string[];
  keptTypes: string[];
  newFacts: string[];
  keptFacts: string[];
  /** Os segredos que o Orbi vai pedir quando rodar, e os que você já tem no cofre. */
  secretsToAsk: string[];
  secretsHeld: string[];
  learnings: number;
}
