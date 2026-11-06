import {
  createAssistantMessageEventStream,
  createProvider,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Message,
  type Model,
  type Provider,
  type TextContent,
  type ToolCall as PiToolCall,
  type TranscriptContext,
  type Usage as PiUsage,
} from '@earendil-works/pi-ai';
import { collapseSystemMessages, getCurrentTools } from '@earendil-works/pi-ai/utils/transcript';
import { getSystemMessageText } from '@earendil-works/pi-ai/utils/text';
import type { ChatEvent, ChatMessage, ChatRequest, ChatResult, LlmAdapter, StopReason, ToolSpec, Usage } from './types.ts';

/**
 * Plugs an LlmAdapter into Flue/Pi as a provider. Pi hands providers a
 * transcript (system messages, user, assistant, tool results) and expects a
 * stream of events; this file translates both ways so an adapter only deals
 * with plain messages and tools.
 */

/** Provider id agents use: model spec = `orbi-llm/<model id>`. */
export const ADAPTER_PROVIDER = 'orbi-llm';
const API = 'orbi-adapter';

const textOf = (content: string | Array<{ type: string; text?: string }>) =>
  typeof content === 'string' ? content : content.map((c) => (c.type === 'text' ? c.text : '[imagem]')).join('\n');

/** JSON Schema without TypeBox's symbol keys (adapters may serialize it). */
const plainSchema = (schema: unknown) => JSON.parse(JSON.stringify(schema ?? { type: 'object', properties: {} }));

/** Pi transcript → adapter request. */
export function toChatRequest(model: Model<string>, context: TranscriptContext, maxTokens?: number, temperature?: number): ChatRequest {
  const collapsed = collapseSystemMessages(context);
  const system = collapsed.messages.find((m) => m.role === 'system');
  const tools: ToolSpec[] = getCurrentTools(context.messages).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: plainSchema(t.parameters),
  }));
  const messages: ChatMessage[] = [];
  for (const m of collapsed.messages as Message[]) {
    if (m.role === 'user') messages.push({ role: 'user', content: textOf(m.content) });
    else if (m.role === 'assistant') {
      const text = m.content.filter((c): c is TextContent => c.type === 'text').map((c) => c.text).join('');
      const calls = m.content.filter((c): c is PiToolCall => c.type === 'toolCall');
      // Turns that failed or were cut before saying anything carry nothing useful.
      if (!text && calls.length === 0) continue;
      messages.push({
        role: 'assistant',
        content: text,
        ...(calls.length ? { toolCalls: calls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments as Record<string, unknown> })) } : {}),
      });
    } else if (m.role === 'toolResult') {
      messages.push({ role: 'tool', toolCallId: m.toolCallId, name: m.toolName, content: textOf(m.content), isError: m.isError || undefined });
    }
  }
  return {
    model: model.id,
    system: system ? getSystemMessageText(system as never) : '',
    messages,
    tools,
    maxTokens: maxTokens ?? model.maxTokens,
    temperature,
  };
}

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
const toPiUsage = (u?: Usage): PiUsage => ({
  input: u?.inputTokens ?? 0,
  output: u?.outputTokens ?? 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: (u?.inputTokens ?? 0) + (u?.outputTokens ?? 0),
  cost: { ...ZERO_COST },
});
const toPiStop = (reason: StopReason | undefined, hasCalls: boolean) =>
  reason === 'length' ? 'length' : reason === 'tool_use' || (!reason && hasCalls) ? 'toolUse' : 'stop';

function isAsyncIterable(value: unknown): value is AsyncIterable<ChatEvent> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

/** A finished ChatResult as the events a streaming adapter would have sent. */
async function* resultEvents(result: ChatResult): AsyncIterable<ChatEvent> {
  if (result.text) yield { type: 'text', delta: result.text };
  for (const call of result.toolCalls ?? []) yield { type: 'tool_call', call };
  yield { type: 'done', stopReason: result.stopReason, usage: result.usage };
}

/** Runs one adapter turn and replays it as Pi's event protocol. */
function streamTurn(adapter: LlmAdapter, model: Model<string>, context: TranscriptContext, options?: { signal?: AbortSignal; maxTokens?: number; temperature?: number }): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: API,
    provider: ADAPTER_PROVIDER,
    model: model.id,
    usage: toPiUsage(),
    stopReason: 'pending',
    timestamp: Date.now(),
  };
  const snapshot = () => ({ ...message, content: [...message.content] });
  const fail = (reason: 'error' | 'aborted', error: unknown) => {
    const failed: AssistantMessage = { ...snapshot(), stopReason: reason, errorMessage: reason === 'aborted' ? 'Request was aborted' : `[${adapter.name}] ${error instanceof Error ? error.message : String(error)}` };
    stream.push({ type: 'error', reason, error: failed });
    stream.end(failed);
  };

  queueMicrotask(async () => {
    const controller = new AbortController();
    const signal = options?.signal;
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      if (signal?.aborted) return fail('aborted', null);
      const request = toChatRequest(model, context, options?.maxTokens, options?.temperature);
      const answer = adapter.chat(request, controller.signal);
      const events = isAsyncIterable(answer) ? answer : resultEvents(await answer);

      stream.push({ type: 'start', partial: snapshot() });
      let textIndex = -1;
      let calls = 0;
      let stop: StopReason | undefined;
      let usage: Usage | undefined;
      const closeText = () => {
        if (textIndex < 0) return;
        const block = message.content[textIndex] as TextContent;
        stream.push({ type: 'text_end', contentIndex: textIndex, content: block.text, partial: snapshot() });
        textIndex = -1;
      };
      for await (const event of events) {
        if (controller.signal.aborted) return fail('aborted', null);
        if (event.type === 'text') {
          if (!event.delta) continue;
          if (textIndex < 0) {
            message.content.push({ type: 'text', text: '' });
            textIndex = message.content.length - 1;
            stream.push({ type: 'text_start', contentIndex: textIndex, partial: snapshot() });
          }
          (message.content[textIndex] as TextContent).text += event.delta;
          stream.push({ type: 'text_delta', contentIndex: textIndex, delta: event.delta, partial: snapshot() });
        } else if (event.type === 'tool_call') {
          closeText();
          const toolCall: PiToolCall = { type: 'toolCall', id: event.call.id, name: event.call.name, arguments: (event.call.arguments ?? {}) as never };
          message.content.push(toolCall);
          const index = message.content.length - 1;
          stream.push({ type: 'toolcall_start', contentIndex: index, partial: snapshot() });
          stream.push({ type: 'toolcall_end', contentIndex: index, toolCall, partial: snapshot() });
          calls++;
        } else if (event.type === 'done') {
          stop = event.stopReason;
          usage = event.usage;
        }
      }
      closeText();
      message.usage = toPiUsage(usage);
      message.stopReason = toPiStop(stop, calls > 0);
      const final = snapshot();
      stream.push({ type: 'done', reason: message.stopReason as 'stop' | 'length' | 'toolUse', message: final });
      stream.end(final);
    } catch (error) {
      fail(controller.signal.aborted ? 'aborted' : 'error', error);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  });
  return stream;
}

/** The Pi provider that serves `orbi-llm/<model>` through the adapter. */
export function toPiProvider(adapter: LlmAdapter): Provider {
  if (!adapter.models.length) throw new Error(`adaptador ${adapter.name}: informe ao menos um modelo`);
  const models = adapter.models.map((m) => ({
    id: m.id,
    name: m.id,
    api: API,
    provider: ADAPTER_PROVIDER,
    baseUrl: `adapter://${adapter.name}`,
    reasoning: false,
    input: ['text'] as Array<'text'>,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.contextWindow ?? 128_000,
    maxTokens: m.maxTokens ?? 8_192,
  }));
  const stream = (model: Model<string>, context: TranscriptContext, options?: { signal?: AbortSignal; maxTokens?: number; temperature?: number }) =>
    streamTurn(adapter, model, context, options);
  return createProvider({
    id: ADAPTER_PROVIDER,
    name: adapter.name,
    // The adapter owns its credentials; Pi only needs to know the provider is usable.
    auth: { apiKey: { name: adapter.name, resolve: async () => ({ auth: {} }) } as never },
    models,
    api: { stream: stream as never, streamSimple: stream as never },
  }) as Provider;
}
