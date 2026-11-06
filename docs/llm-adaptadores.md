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
| `<nome de um plugin>` | O LLM da sua empresa, por uma API ou SDK próprios: veja [plugins.md](plugins.md) | as `ORBI_LLM_*` que o plugin usar |
| `module:<arquivo>` | Um adaptador num arquivo solto (forma antiga; prefira plugin) | as que ele usar |

Opcionais do `openai-compatible`: `ORBI_LLM_CONTEXT_WINDOW` (padrão 128000),
`ORBI_LLM_MAX_TOKENS` (8192), `ORBI_LLM_TIMEOUT_MS` (120000).

A tela **Autonomia** mostra o provedor ativo e os plugins encontrados. O log do
runtime imprime `[orbi] modelo: …` ao iniciar.

## Conectar o LLM da sua empresa

Escreva um plugin: `npm run plugin:new -- <nome>`, implemente o `chat()` e
teste com `npm run plugin:test -- <nome>`. O passo a passo está em
[plugins.md](plugins.md).

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
