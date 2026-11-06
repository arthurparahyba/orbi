// Modelo de adaptador de LLM para o Orbi. Copie, renomeie e preencha o `chat`.
//
// Ativar (apps/runtime/.env, ou ~/Library/Application Support/br.com.zup.orbi/.env no app instalado):
//   ORBI_LLM=module:/caminho/absoluto/para/meu-adaptador.mjs
//   ORBI_LLM_MODEL=nome-do-modelo
//   ORBI_LLM_BASE_URL=…  ORBI_LLM_API_KEY=…   (opcionais; qualquer ORBI_LLM_* chega em settings.env)
//
// O contrato completo, com os tipos, está em apps/runtime/src/llm/types.ts.
// Um exemplo completo (HTTP no formato da OpenAI) está em src/llm/adapters/openai-compatible.ts.

/** @param {import('../src/llm/types.ts').LlmSettings} settings */
export default function criarAdaptador(settings) {
  /** @type {import('../src/llm/types.ts').LlmAdapter} */
  const adaptador = {
    name: 'meu-gateway',
    models: [{ id: settings.model ?? 'modelo-padrao', contextWindow: 128_000, maxTokens: 8_192 }],

    /**
     * Uma ida ao modelo.
     * request.system   instruções do Orbi (texto)
     * request.messages histórico: user | assistant (com toolCalls) | tool (resultado de ferramenta)
     * request.tools    ferramentas que o modelo pode chamar: { name, description, parameters (JSON Schema) }
     * Devolva { text?, toolCalls?: [{ id, name, arguments }], stopReason?, usage? }.
     */
    async chat(request, signal) {
      // 1. Converta request para o formato do seu ambiente (SDK interno, API própria…).
      // 2. Chame o modelo repassando `signal` para permitir cancelar.
      // 3. Converta a resposta de volta.
      const resposta = await fetch(`${settings.baseUrl}/gerar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
          modelo: request.model,
          instrucoes: request.system,
          mensagens: request.messages,
          ferramentas: request.tools,
        }),
        signal,
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}: ${await resposta.text()}`);
      const dados = await resposta.json();
      return {
        text: dados.texto,
        toolCalls: (dados.chamadas ?? []).map((c, i) => ({ id: c.id ?? `call_${i}`, name: c.nome, arguments: c.argumentos })),
      };
    },
  };
  return adaptador;
}
