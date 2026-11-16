import type { ChatMessage, ChatResult, LlmAdapter, LlmAdapterFactory, StopReason, ToolCall } from '../types.ts';

/**
 * Any endpoint that speaks OpenAI's Chat Completions format: OpenAI itself,
 * Azure OpenAI, vLLM, Ollama, LM Studio, LiteLLM and most corporate LLM
 * gateways. Also the reference implementation of an LlmAdapter.
 *
 *   ORBI_LLM=openai-compatible
 *   ORBI_LLM_BASE_URL=https://gateway.empresa/v1      (…/chat/completions is appended)
 *   ORBI_LLM_API_KEY=…                                 (sent as Authorization: Bearer)
 *   ORBI_LLM_MODEL=nome-do-modelo
 *   ORBI_LLM_HEADERS={"x-tenant":"time-x"}             (optional extra headers)
 *   ORBI_LLM_CONTEXT_WINDOW=128000 ORBI_LLM_MAX_TOKENS=8192 ORBI_LLM_TIMEOUT_MS=120000 (optional)
 */
export const openAICompatible: LlmAdapterFactory = (settings) => {
  if (!settings.baseUrl) throw new Error('ORBI_LLM_BASE_URL é obrigatório para ORBI_LLM=openai-compatible');
  if (!settings.model) throw new Error('ORBI_LLM_MODEL é obrigatório para ORBI_LLM=openai-compatible');
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const timeoutMs = Number(settings.env.ORBI_LLM_TIMEOUT_MS ?? 120_000);

  const adapter: LlmAdapter = {
    name: 'openai-compatible',
    models: [
      {
        id: settings.model,
        contextWindow: Number(settings.env.ORBI_LLM_CONTEXT_WINDOW ?? 128_000),
        maxTokens: Number(settings.env.ORBI_LLM_MAX_TOKENS ?? 8_192),
      },
    ],
    async chat(request, signal): Promise<ChatResult> {
      const body = {
        model: request.model,
        max_tokens: request.maxTokens,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        messages: [{ role: 'system', content: request.system }, ...request.messages.flatMap(toOpenAI)],
        ...(request.tools.length
          ? { tools: request.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }
          : {}),
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}),
          ...settings.headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 500);
        throw new Error(`HTTP ${response.status} de ${url}: ${detail}`);
      }
      const data = (await response.json()) as OpenAIResponse;
      const choice = data.choices?.[0];
      if (!choice) throw new Error(`resposta sem "choices" de ${url}`);
      const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((c, i) => ({
        id: c.id || `call_${i}`,
        name: c.function.name,
        arguments: parseArguments(c.function.arguments),
      }));
      return {
        text: choice.message.content ?? undefined,
        toolCalls,
        stopReason: STOP[choice.finish_reason ?? ''] ?? undefined,
        usage: data.usage ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 } : undefined,
      };
    },
  };
  return adapter;
};

interface OpenAIResponse {
  choices?: Array<{
    finish_reason?: string;
    message: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const STOP: Record<string, StopReason> = { stop: 'stop', tool_calls: 'tool_use', function_call: 'tool_use', length: 'length' };

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    // Some models emit broken JSON; hand it to the tool so validation reports it to the model.
    return { _raw: raw };
  }
}

function toOpenAI(m: ChatMessage): unknown[] {
  if (m.role === 'user') return [{ role: 'user', content: m.content }];
  if (m.role === 'tool') return [{ role: 'tool', tool_call_id: m.toolCallId, content: m.content }];
  return [
    {
      role: 'assistant',
      content: m.content || null,
      ...(m.toolCalls?.length
        ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) }
        : {}),
    },
  ];
}
