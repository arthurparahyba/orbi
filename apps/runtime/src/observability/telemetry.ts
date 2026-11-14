import { observe, type FlueObservation } from '../agents/runtime-port.ts';
import type { Logger } from './log.ts';
import type { UsageStore } from './usage.ts';

/**
 * What Orbi watches in Flue's runtime events (see Flue's observability guide):
 * every model call and tool call is counted per conversation, and logged with
 * its conversation, model, time and cost; failed runs are logged as errors.
 */
export interface TelemetryDeps {
  usage: Pick<UsageStore, 'recordTurn' | 'recordTool'>;
  log: Logger;
  /** Every tool call's outcome, per conversation (failed steps, deviations of a run). */
  /** `result`: what a successful tool returned (text, up to 4 000 characters), for the review of what was learned. */
  /** `id`: the tool call's id, and `chars`: everything it returned to the model, for the registry of the execution. */
  onTool?: (conversationId: string, outcome: { tool: string; failed: boolean; error?: string; result?: string; id?: string; chars?: number; durationMs?: number }) => void;
  /** A tool call started, with its arguments: the registry of the execution writes it down now, so a turn that dies halfway still leaves its trail. */
  onToolStart?: (conversationId: string, call: { id: string; tool: string; args: unknown }) => void;
  /** Every model turn's tokens and cost, per conversation (they also count in the open run). */
  onTurn?: (conversationId: string, usage: { tokensIn: number; tokensOut: number; costUsd: number }) => void;
  /** A conversation's turn ended (every tool outcome of it has been reported). */
  onSettled?: (conversationId: string, outcome: 'completed' | 'failed' | 'aborted') => void;
}

export function handleObservation(event: FlueObservation, { usage, log, onTool, onToolStart, onSettled, onTurn }: TelemetryDeps): void {
  // Orbi's conversations are Flue agent instances (`chat:…`); Flue's own conversationId is an
  // internal stream id. Subagent work carries the parent's instance, so it counts there too.
  const conversation = event.instanceId ?? event.conversationId;
  switch (event.type) {
    case 'turn': {
      const u = event.response.usage;
      const model = `${event.request.providerId}/${event.request.requestedModel}`;
      if (conversation) {
        usage.recordTurn({
          conversationId: conversation, model, durationMs: event.durationMs, failed: event.isError,
          tokensIn: u?.input, tokensOut: u?.output, cacheRead: u?.cacheRead, cacheWrite: u?.cacheWrite, costUsd: u?.cost.total,
        });
        if (u) onTurn?.(conversation, { tokensIn: u.input ?? 0, tokensOut: u.output ?? 0, costUsd: u.cost?.total ?? 0 });
      }
      const attrs = {
        conversation, model, purpose: event.purpose === 'agent' ? undefined : event.purpose, ms: event.durationMs,
        tokensIn: u?.input, tokensOut: u?.output, costUsd: u ? Number(u.cost.total.toFixed(6)) : undefined,
      };
      if (event.isError) log.warn('turno do modelo falhou', { ...attrs, error: event.response.error?.message, finish: event.response.finishReason });
      else log.info('turno do modelo', attrs);
      return;
    }
    case 'tool_start':
      if (conversation) onToolStart?.(conversation, { id: event.toolCallId, tool: event.toolName, args: event.args });
      return;
    case 'tool': {
      if (conversation) usage.recordTool({ conversationId: conversation, durationMs: event.durationMs, failed: event.isError });
      if (conversation) {
        const whole = toolText(event.result, Number.MAX_SAFE_INTEGER);
        const result = event.isError ? undefined : whole?.slice(0, 4000);
        onTool?.(conversation, {
          tool: event.toolName, failed: event.isError, id: event.toolCallId, chars: whole?.length ?? 0, durationMs: event.durationMs,
          ...(event.isError ? { error: toolError(event.result) } : {}), ...(result ? { result } : {}),
        });
      }
      const attrs = { conversation, tool: event.toolName, ms: event.durationMs };
      if (event.isError) log.warn('ferramenta falhou', { ...attrs, error: toolError(event.result) });
      else log.debug('ferramenta', attrs);
      return;
    }
    case 'submission_settled':
      if (conversation) onSettled?.(conversation, event.outcome);
      if (event.outcome === 'failed') log.error('execução falhou', { agent: event.agentName, submission: event.submissionId, error: event.error?.message });
      else if (event.outcome === 'aborted') log.info('execução interrompida', { agent: event.agentName, submission: event.submissionId });
      return;
    case 'log': {
      // Lines written by tools and hooks through Flue's `log`.
      log[event.level](event.message, { conversation, ...(event.attributes ?? {}) });
      return;
    }
    default:
      return;
  }
}

/** The text of a failed tool's result, when there is one. */
function toolError(result: unknown): string | undefined {
  return toolText(result, 300);
}

/** The text a tool returned, cut to `max` characters. */
function toolText(result: unknown, max: number): string | undefined {
  const content = (result as { content?: Array<{ type?: string; text?: string }> } | undefined)?.content;
  const text = content?.find((c) => c.type === 'text')?.text;
  return text ? text.slice(0, max) : undefined;
}

/** Starts watching; returns the function that stops. */
export function watchAgents(deps: TelemetryDeps): () => void {
  return observe((event) => handleObservation(event, deps));
}
