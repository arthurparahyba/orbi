/**
 * A revisão e o diagnóstico: o que deu errado, o que a revisão guardou, e a issue que sai
 * daqui sem nada do trabalho do desenvolvedor.
 */

/** GET /api/brain/playbooks/:name/autonomy */
/**
 * What the runtime found at the end of an execution (signal `review` in the conversation,
 * attribute `review` as JSON): each procedure that ran, its problems and level change,
 * and the esteira's configuration problems.
 */
/**
 * What one check of the review found in a run (apps/runtime/src/review/analyzers): a problem,
 * something that would make it run alone next time, or something to keep in the brain.
 */
export interface Finding { kind: 'problema' | 'melhoria' | 'aprender'; text: string; analyzer: string }

export interface ExecutionReview {
  runs: Array<{
    runId: string; playbook: string; status: 'done' | 'failed' | 'open';
    findings: Finding[];
    /** What each step went through, from the registry of the execution (docs/funcionalidades/25). */
    retro?: string[];
    level?: { from: number; to: number; reason: string; inboxId?: string; alone: string[]; asks: string[] };
  }>;
  config: Array<{ stage: string; playbook: string; text: string }>;
  pipeline?: string;
  /** What the judge let change: only these steps of the procedure (docs/funcionalidades/19). */
  change?: Array<{ playbook: string; why: string; steps: string[] }>;
  /** A known problem that comes back every run: fix it once, at the root. */
  environment?: Array<{ noteId: string; playbook: string; problem: string; sintoma: string; causa?: string; solucao: string; raiz?: string; quemCorrige?: string; runs: number }>;
  /** Ideas not worth a change now: kept in the Cérebro, no card. */
  ideas?: Array<{ noteId: string; playbook: string; text: string; why: string }>;
  /**
   * What went wrong that is not the procedure's fault (docs/funcionalidades/24): a defect of the
   * Orbi, or a call the model got wrong. Never a reason to change the procedure.
   */
  orbi?: Array<{ id: string; runId: string; category: 'orbi' | 'modelo'; title: string; detail: string; times: number }>;
}

/** GET /api/review-notes — what the review kept: ideas and environments to fix. */
export interface ReviewNote {
  id: string; playbook: string; kind: 'idea' | 'environment' | 'change'; subject: string; text: string; runId: string | null;
  conversationId: string; status: 'kept' | 'open' | 'dismissed' | 'done' | 'applied'; times: number; createdAt: string; updatedAt: string;
}

/** GET/PUT /api/diagnoses/setup — quem escreve o relatório do diagnóstico e quando (docs/funcionalidades/24). */
export interface DiagnosisSetup {
  who: 'regras' | 'modelo' | 'agente';
  when: 'quando-houver' | 'so-pedindo' | 'sempre';
}

/** GET /api/diagnoses/report?run= — o relatório daquela execução. */
export interface DiagnosisReport {
  runId: string; text: string;
  /** `modelo` ou o id do agente de código que escreveu. */
  by: string; model: string | null; at: string;
}

/** GET /api/diagnoses/:id/issue — o texto exato que iria para o repositório do Orbi, já sem nada do trabalho do desenvolvedor. */
export interface IssueDraft {
  title: string; body: string;
  /** O que foi trocado antes de sair: "saida/promo.json" vira "&lt;arquivo-1&gt;". */
  swaps: Array<{ from: string; to: string }>;
  fingerprint: string;
}

/** POST /api/diagnoses/:id/issue — como a issue saiu. */
export interface IssueSent {
  via: 'gh' | 'browser';
  url: string;
  /** Já existia issue com a mesma impressão digital: entrou como ocorrência nela. */
  commented?: boolean;
  /** Por que não foi pelo `gh`. */
  why?: string;
}

/** GET /api/diagnoses — o que deu errado por culpa do Orbi ou de uma chamada do modelo (docs/funcionalidades/24). */
export interface Diagnosis {
  id: string; runId: string; playbook: string; detector: string; category: 'orbi' | 'modelo';
  title: string; detail: string; hint?: string; step: string | null; fingerprint: string;
  times: number; minor?: boolean; status: 'open' | 'dismissed'; at: string;
}
