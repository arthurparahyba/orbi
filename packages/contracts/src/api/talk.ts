/**
 * A conversa: o que a tela lê de cada conversa, do caderno ao lado dela, do que espera o
 * desenvolvedor, dos retornos e do ditado.
 */

export interface ConversationInfo {
  id: string; title: string; createdAt: string; updatedAt: string;
  /** Set when a coding agent asked for this conversation over MCP. */
  origin?: ConversationOrigin;
  /** The model chosen for this conversation; none = the default. */
  model?: string;
  /** Where the conversation is: teaching (and the stage), doing something known, or done teaching. Derived by the runtime. */
  state?: ConversationState;
}

export type TeachingStage = 'explicar' | 'ensaiar' | 'combinar' | 'aprender' | 'assumir';

export type ConversationState =
  | { mode: 'conversa' }
  | { mode: 'ensinando'; stage: Exclude<TeachingStage, 'assumir'> }
  | { mode: 'aprendido'; stage: 'assumir'; playbook: string; level: 1 | 2 | 3 }
  | { mode: 'fazendo'; playbook: string; status: 'running' | 'waiting' | 'done' | 'failed' }
  | { mode: 'esteira'; pipeline: string; status: 'running' | 'waiting' | 'done' | 'cancelled' };

/** The "O que estou aprendendo" panel: what the Orbi understood in a conversation, from the brain. */
export interface ConversationNotebook {
  state: ConversationState;
  intent?: string;
  steps: Array<{ label: string; status: 'pending' | 'running' | 'done' | 'failed' | 'waiting' | 'skipped' | 'planned'; note?: string }>;
  receives: string[];
  agreement?: { start: string; end: string; outside: string[]; corrections: Array<{ explained: string; actual: string }> };
  noted: Array<{ id: string; type: string }>;
  readiness: Array<{ label: string; known: boolean; detail: string }>;
  procedure?: {
    name: string; description: string; level: 1 | 2 | 3; levelMax: 1 | 2 | 3; uses: number; successes: number;
    nextLevel?: { level: 1 | 2 | 3; cleanRunsLeft: number };
  };
}

export interface ConversationOrigin { agent: string; requestId: string; procedure: string | null; repo?: string; branch?: string; session?: string }

export interface InboxItem {
  id: string; kind: 'approval' | 'question' | 'learning' | 'secret' | 'pipeline' | 'level' | 'code-change' | 'followup'; conversationId: string; title: string; detail: string;
  approvalId?: string; routine?: string; createdAt: string; status: 'open' | 'approved' | 'denied' | 'answered';
  /** What the developer answered, for answered questions. */
  answer?: string;
  /** Changed in the card's conversation: the version shown now, and the earlier ones (oldest first). */
  version?: number;
  versions?: Array<{ title: string; detail: string; at: string }>;
}

/** GET /api/followups — the Orbi coming back later to a conversation (docs/funcionalidades/11). */
export interface Followup {
  id: string; conversationId: string; dueAt: string; note: string;
  status: 'scheduled' | 'delivering' | 'delivered' | 'failed' | 'cancelled';
  attempts: number; runId?: string | null; stepId?: string | null; createdAt: string;
  deliveredAt?: string | null; cancelledBy?: string | null; lastError?: string | null;
}

/** GET /api/voice — the local transcription model: which, where, what is missing, state. */
export interface VoiceStatus {
  backend: 'local' | 'http' | 'off';
  url?: string;
  model: string;
  defaultModel: string;
  dir: string;
  host: string;
  offline: boolean;
  files: Array<{ path: string; present: boolean; bytes: number; url: string }>;
  complete: boolean;
  known: Array<{ id: string; size: string; note: string }>;
  status:
    | { state: 'idle' }
    | { state: 'downloading'; file?: string; progress?: number }
    | { state: 'loading' }
    | { state: 'ready' }
    | { state: 'error'; message: string };
}
