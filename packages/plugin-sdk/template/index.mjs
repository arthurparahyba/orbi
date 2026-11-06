// Plugin __NAME__: conecta o Orbi ao LLM da sua empresa.
//
// 1. Preencha o chat() abaixo com a chamada ao seu LLM (API própria, SDK interno…).
// 2. Configure em apps/runtime/.env (no app instalado: ~/Library/Application Support/br.com.zup.orbi/.env):
//      ORBI_LLM=__NAME__
//      ORBI_LLM_MODEL=nome-do-modelo
//      ORBI_LLM_BASE_URL=…   ORBI_LLM_API_KEY=…   (opcionais; qualquer ORBI_LLM_* chega em settings.env)
// 3. Teste contra o LLM real:  npm run plugin:test -- __NAME__
//
// Contrato completo: packages/plugin-sdk/src/llm.ts. Exemplo completo (HTTP no formato da
// OpenAI): apps/runtime/src/llm/adapters/openai-compatible.ts.

/** @type {import('@orbi/plugin-sdk').LlmPlugin} */
export default {
  kind: 'llm',
  name: '__NAME__',
  apiVersion: 1,
  description: 'LLM da empresa',

  create(settings) {
    return {
      name: '__NAME__',
      models: [{ id: settings.model ?? 'modelo-padrao', contextWindow: 128_000, maxTokens: 8_192 }],

      /**
       * Uma ida ao modelo.
       *   request.system    instruções do Orbi (texto)
       *   request.messages  histórico: user | assistant (com toolCalls) | tool (resultado de ferramenta)
       *   request.tools     ferramentas que o modelo pode chamar: { name, description, parameters (JSON Schema) }
       * Devolva { text?, toolCalls?: [{ id, name, arguments }], stopReason?, usage? }.
       */
      async chat(request, signal) {
        // Troque pelo formato do seu LLM. Repasse `signal` para o cancelamento funcionar.
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
  },
};
