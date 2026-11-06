import type { ChatEvent, ChatRequest, ChatResult, LlmAdapter } from './types.ts';

/**
 * Checks an LlmAdapter against what Orbi needs, by calling the real model:
 * plain text, a tool call with arguments, and an answer after a tool result.
 * `npm run plugin:test -- <nome>` runs it before the plugin is used in the app.
 */

export interface CheckResult {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
  /** What to look at when it failed. */
  hint?: string;
}

/** Drains a streamed answer into the same shape as a plain one. */
export async function collect(answer: Promise<ChatResult> | AsyncIterable<ChatEvent>): Promise<ChatResult> {
  if (!(typeof answer === 'object' && answer !== null && Symbol.asyncIterator in answer)) return await answer;
  const out: ChatResult = { text: '', toolCalls: [] };
  for await (const event of answer as AsyncIterable<ChatEvent>) {
    if (event.type === 'text') out.text += event.delta;
    else if (event.type === 'tool_call') out.toolCalls!.push(event.call);
    else if (event.type === 'done') {
      out.stopReason = event.stopReason;
      out.usage = event.usage;
    }
  }
  return out;
}

const SUM_TOOL = {
  name: 'somar',
  description: 'Soma dois números e devolve o resultado.',
  parameters: {
    type: 'object',
    properties: { a: { type: 'number', description: 'primeira parcela' }, b: { type: 'number', description: 'segunda parcela' } },
    required: ['a', 'b'],
  },
};

export async function checkAdapter(adapter: LlmAdapter, options: { model?: string; timeoutMs?: number } = {}): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const model = options.model ?? adapter.models?.[0]?.id ?? '';
  const timeoutMs = options.timeoutMs ?? 90_000;

  const shape = [
    !adapter?.name && 'falta name',
    !Array.isArray(adapter?.models) || adapter.models.length === 0 ? 'falta models (ao menos um { id })' : '',
    typeof adapter?.chat !== 'function' && 'falta chat(request, signal)',
  ].filter(Boolean);
  results.push({ name: 'Formato do adaptador', ok: shape.length === 0, ms: 0, detail: shape.length ? shape.join('; ') : `${adapter.name}, modelo ${model}` });
  if (shape.length) return results;

  async function step(name: string, hint: string, run: () => Promise<string>): Promise<boolean> {
    const started = Date.now();
    try {
      const detail = await run();
      results.push({ name, ok: true, ms: Date.now() - started, detail });
      return true;
    } catch (error) {
      results.push({ name, ok: false, ms: Date.now() - started, detail: error instanceof Error ? error.message : String(error), hint });
      return false;
    }
  }
  const ask = (req: Omit<ChatRequest, 'model'>) => collect(adapter.chat({ model, maxTokens: 512, ...req }, AbortSignal.timeout(timeoutMs)));

  await step('Resposta em texto', 'Confira URL, credenciais e o formato da resposta no seu chat(); devolva { text }.', async () => {
    const r = await ask({ system: 'Responda em português, numa palavra.', messages: [{ role: 'user', content: 'Responda apenas: pronto' }], tools: [] });
    if (!r.text?.trim()) throw new Error(`resposta sem texto: ${JSON.stringify(r).slice(0, 300)}`);
    return `"${r.text.trim().slice(0, 80)}"`;
  });

  let call: { id: string; name: string; arguments: Record<string, unknown> } | undefined;
  const calledTool = await step(
    'Chamada de ferramenta',
    'O Orbi age por ferramentas. Envie request.tools ao modelo no formato da sua API e converta a resposta em toolCalls: [{ id, name, arguments }].',
    async () => {
      const r = await ask({
        system: 'Você é um assistente. Para qualquer conta, use a ferramenta somar; não calcule de cabeça.',
        messages: [{ role: 'user', content: 'Quanto é 17 + 25?' }],
        tools: [SUM_TOOL],
      });
      call = r.toolCalls?.find((c) => c.name === 'somar');
      if (!call) throw new Error(`o modelo não chamou "somar" (texto: "${(r.text ?? '').slice(0, 120)}", chamadas: ${JSON.stringify(r.toolCalls ?? [])})`);
      if (!call.id) throw new Error('a chamada veio sem id; gere um se a sua API não tiver');
      const { a, b } = call.arguments as { a?: unknown; b?: unknown };
      if (Number(a) + Number(b) !== 42) throw new Error(`argumentos inesperados: ${JSON.stringify(call.arguments)}`);
      return `somar(${JSON.stringify(call.arguments)}), id ${call.id}`;
    },
  );

  if (calledTool && call) {
    const c = call;
    await step(
      'Resposta depois do resultado da ferramenta',
      'Mande ao modelo a mensagem assistant com toolCalls e a mensagem tool com toolCallId, no formato da sua API.',
      async () => {
        const r = await ask({
          system: 'Você é um assistente. Para qualquer conta, use a ferramenta somar; não calcule de cabeça.',
          messages: [
            { role: 'user', content: 'Quanto é 17 + 25?' },
            { role: 'assistant', content: '', toolCalls: [c] },
            { role: 'tool', toolCallId: c.id, name: 'somar', content: '42' },
          ],
          tools: [SUM_TOOL],
        });
        if (!r.text?.includes('42')) throw new Error(`esperava uma resposta com 42, veio: "${(r.text ?? '').slice(0, 160)}"`);
        return `"${r.text.trim().slice(0, 80)}"`;
      },
    );
  }
  return results;
}
