/**
 * O gasto: quanto o modelo e as ferramentas foram usados, por conversa e no total.
 */

/** How much the model and the tools were used: tokens, estimated cost (USD) and time. */
export interface UsageTotals {
  turns: number;
  failedTurns: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  /** Time waiting for the model, summed over turns. */
  modelMs: number;
  toolCalls: number;
  failedTools: number;
  toolMs: number;
}

export interface ConversationUsage extends UsageTotals {
  conversationId: string;
  title: string;
  model: string;
  lastAt: string;
}

export interface UsageReport {
  days: number;
  since: string;
  today: UsageTotals;
  period: UsageTotals;
  conversations: ConversationUsage[];
}

/** Uma linha do registro do runtime (documento 29). */
export interface LogLine {
  /** `orbi` quando veio do logger e os campos são conhecidos; `raw` quando não (plugin, pilha de erro). */
  kind: 'orbi' | 'raw';
  at: string | null;
  level: 'debug' | 'info' | 'warn' | 'error' | null;
  msg: string;
  attrs: Record<string, unknown>;
}

/** GET /api/logs?level=&text=&limit= */
export interface RecentLog {
  file: string;
  bytes: number;
  /** A primeira linha pode estar cortada: o arquivo é lido do fim. */
  partial: boolean;
  lines: LogLine[];
  /** Quantas das linhas mostradas o Orbi não reconheceu. */
  raw: number;
}
