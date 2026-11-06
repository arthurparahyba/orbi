# Adaptadores de LLM

O Orbi fala com o modelo por uma interface própria, `LlmAdapter`
(`apps/runtime/src/llm/types.ts`). A Anthropic é só o padrão. Para usar outro
provedor, um gateway corporativo ou um SDK interno, implemente essa interface;
o resto do Orbi (agente, ferramentas, aprovações, playbooks) não muda.

```
Agente Orbi (Flue) ──▶ Pi ──▶ provedor "orbi-llm" (pi-bridge.ts) ──▶ seu LlmAdapter ──▶ seu modelo
```

## Escolher o modelo

Em `apps/runtime/.env` (no app instalado: `~/Library/Application Support/br.com.zup.orbi/.env`):

| `ORBI_LLM` | Quando usar | Outras variáveis |
| --- | --- | --- |
| `anthropic` (padrão) | API da Anthropic | `ANTHROPIC_API_KEY`, `ORBI_MODEL` |
| `openai-compatible` | Qualquer endpoint `/chat/completions`: OpenAI, Azure OpenAI, vLLM, Ollama, LiteLLM e a maioria dos gateways | `ORBI_LLM_BASE_URL`, `ORBI_LLM_MODEL`, `ORBI_LLM_API_KEY`, `ORBI_LLM_HEADERS` (JSON) |
| `module:<arquivo>` | Seu adaptador, carregado na inicialização, sem recompilar | `ORBI_LLM_MODEL` e qualquer `ORBI_LLM_*` que ele leia |
| `<nome>` | Seu adaptador compilado junto (registrado em `ADAPTERS`) | as que ele usar |

Opcionais do `openai-compatible`: `ORBI_LLM_CONTEXT_WINDOW` (padrão 128000),
`ORBI_LLM_MAX_TOKENS` (8192), `ORBI_LLM_TIMEOUT_MS` (120000).

A tela **Autonomia** mostra o provedor ativo, e o log do runtime imprime
`[orbi] modelo: …` ao iniciar.

## Escrever um adaptador

Copie `apps/runtime/adaptadores/modelo.mjs`. Um adaptador é uma função que
recebe as configurações e devolve:

```ts
{
  name: 'meu-gateway',
  models: [{ id: 'modelo-x', contextWindow: 128000, maxTokens: 8192 }],
  chat(request, signal) → Promise<ChatResult> | AsyncIterable<ChatEvent>
}
```

O `request` traz:

- `system`: as instruções do Orbi (texto único);
- `messages`: o histórico, com três papéis:
    - `user` (texto);
    - `assistant` (texto e, se houver, `toolCalls`);
    - `tool` (resultado de uma ferramenta, com `toolCallId`);
- `tools`: as ferramentas que o modelo pode chamar, com parâmetros em JSON Schema;
- `model`, `maxTokens` e `temperature`.

A resposta mais simples é `{ text, toolCalls }`. Para o texto aparecer aos
poucos no app, devolva um gerador com eventos `text`, `tool_call` e `done`
(veja `types.ts`).

Regras que o Orbi espera:

- **Chamadas de ferramenta são obrigatórias.** O Orbi age por ferramentas: um
  modelo sem suporte a function calling não consegue executar playbooks. Se o
  seu ambiente não tem function calling nativo, o adaptador pode pedir ao modelo
  um JSON com a chamada e convertê-lo em `toolCalls`.
- **Cada chamada precisa de um `id`** que volta depois no resultado (`toolCallId`).
  Gere um se a sua API não tiver.
- **Falhas viram exceções.** A mensagem chega ao app com o nome do adaptador na
  frente (`[meu-gateway] …`).
- **Repasse o `signal`** para o cancelamento funcionar.
- **Mensagens `user` podem conter avisos do runtime** (por exemplo
  `<signal type="resources">…`). Repasse como estão.

## Registrar compilado junto

Para um adaptador TypeScript que vai junto no build, crie
`apps/runtime/src/llm/adapters/meu-gateway.ts` exportando uma
`LlmAdapterFactory` e acrescente uma linha em `ADAPTERS`
(`apps/runtime/src/llm/index.ts`):

```ts
export const ADAPTERS = {
  'openai-compatible': openAICompatible,
  'meu-gateway': meuGateway,
};
```

Depois use `ORBI_LLM=meu-gateway`.

## O que muda fora da Anthropic

- **Correções de código pelo Claude Code ficam desligadas.** Elas usam o Claude
  Agent SDK, que fala com a API da Anthropic. Se o seu gateway aceitar o formato
  da Anthropic, ligue com `ORBI_CODE_FIXER=claude-code` e `ANTHROPIC_BASE_URL`.
- **O raciocínio estendido ("thinking") não é usado.** O adaptador recebe só o
  texto.
- **Imagens viram o texto `[imagem]`.** Hoje o Orbi não manda imagens ao modelo.
- **A transcrição de áudio é independente** (Whisper local ou `ORBI_STT_URL`).

## Testes

`apps/runtime/test/llm-adapter.test.ts` roda o agente inteiro sobre um
adaptador escrito no próprio teste. `llm-openai-compatible.test.ts` faz o mesmo
contra um servidor que imita `/v1/chat/completions`. Use-os como modelo para
testar o seu adaptador sem rede.
