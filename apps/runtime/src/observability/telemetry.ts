import { observe, type FlueObservation } from '@flue/runtime';
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
  onTool?: (conversationId: string, outcome: { tool: string; failed: boolean; error?: string }) => void;
}

export function handleObservation(event: FlueObservation, { usage, log, onTool }: TelemetryDeps): void {
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
      }
      const attrs = {
        conversation, model, purpose: event.purpose === 'agent' ? undefined : event.purpose, ms: event.durationMs,
        tokensIn: u?.input, tokensOut: u?.output, costUsd: u ? Number(u.cost.total.toFixed(6)) : undefined,
      };
      if (event.isError) log.warn('turno do modelo falhou', { ...attrs, error: event.response.error?.message, finish: event.response.finishReason });
      else log.info('turno do modelo', attrs);
      return;
    }
    case 'tool': {
      if (conversation) usage.recordTool({ conversationId: conversation, durationMs: event.durationMs, failed: event.isError });
      if (conversation) onTool?.(conversation, { tool: event.toolName, failed: event.isError, ...(event.isError ? { error: toolError(event.result) } : {}) });
      const attrs = { conversation, tool: event.toolName, ms: event.durationMs };
      if (event.isError) log.warn('ferramenta falhou', { ...attrs, error: toolError(event.result) });
      else log.debug('ferramenta', attrs);
      return;
    }
    case 'submission_settled':
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
  const content = (result as { content?: Array<{ type?: string; text?: string }> } | undefined)?.content;
  const text = content?.find((c) => c.type === 'text')?.text;
  return text ? text.slice(0, 300) : undefined;
}

/** Starts watching; returns the function that stops. */
export function watchAgents(deps: TelemetryDeps): () => void {
  return observe((event) => handleObservation(event, deps));
}
