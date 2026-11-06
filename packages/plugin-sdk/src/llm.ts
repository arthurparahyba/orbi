/**
 * The contract between Orbi and a language model.
 *
 * To run Orbi on a model reached in a non-standard way (a corporate gateway,
 * an internal SDK, a different vendor) implement `LlmAdapter`: one method that
 * takes the conversation so far plus the tools Orbi offers, and returns the
 * model's answer (text and/or tool calls). Nothing here depends on Flue, Pi or
 * any vendor SDK; `pi-bridge.ts` plugs an adapter into the agent runtime.
 *
 * See docs/plugins.md for a walkthrough and apps/runtime/src/llm/adapters/openai-compatible.ts
 * for a complete example.
 */

/** JSON Schema object describing a tool's input (draft-07 compatible). */
export type JsonSchema = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the tool's arguments. */
  parameters: JsonSchema;
}

export interface ToolCall {
  /** Id that links the call to its result. Generate one if your API has none. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

export interface ChatRequest {
  /** Model id as configured (ORBI_LLM_MODEL), e.g. "gpt-4.1" or "llm-corporativo-v2". */
  model: string;
  /** System prompt: Orbi's instructions, skills catalog and context. */
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
}

export type StopReason = 'stop' | 'tool_use' | 'length';

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** A complete answer. Simplest to implement. */
export interface ChatResult {
  text?: string;
  toolCalls?: ToolCall[];
  /** Defaults to 'tool_use' when there are tool calls, else 'stop'. */
  stopReason?: StopReason;
  usage?: Usage;
}

/** Streaming alternative: yield events as they arrive (text shows up live in the app). */
export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; stopReason?: StopReason; usage?: Usage };

export interface LlmModelInfo {
  id: string;
  /** Tokens the model accepts per request. Default 128 000. */
  contextWindow?: number;
  /** Max tokens per answer. Default 8 192. */
  maxTokens?: number;
}

export interface LlmAdapter {
  /** Short name shown in logs and in the Autonomia screen, e.g. "gateway-corporativo". */
  name: string;
  /** Models this adapter serves. The first one is the default. */
  models: LlmModelInfo[];
  /**
   * Answer one turn. Return a ChatResult (simple) or an AsyncIterable of
   * ChatEvent (streaming). Throw on failure; honour `signal` to cancel.
   */
  chat(request: ChatRequest, signal: AbortSignal): Promise<ChatResult> | AsyncIterable<ChatEvent>;
}

/** Settings handed to an adapter factory (from .env: ORBI_LLM_*). */
export interface LlmSettings {
  /** ORBI_LLM_MODEL */
  model?: string;
  /** ORBI_LLM_BASE_URL */
  baseUrl?: string;
  /** ORBI_LLM_API_KEY */
  apiKey?: string;
  /** ORBI_LLM_HEADERS (JSON object) */
  headers?: Record<string, string>;
  /** Every ORBI_LLM_* variable, for adapter-specific options. */
  env: Record<string, string>;
}

export type LlmAdapterFactory = (settings: LlmSettings) => LlmAdapter | Promise<LlmAdapter>;
