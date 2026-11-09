# 12. Modelo de linguagem e plugins

## Para que serve

O Orbi pensa com um modelo de linguagem. Por padrão é o Claude, pela API da
Anthropic. Mas o Orbi pode rodar onde só existe o LLM da empresa, por uma API ou
SDK próprios. Por isso ele fala com o modelo por uma interface própria, o
**adaptador**, e o resto (agente, ferramentas, aprovações, procedimentos) não muda.

## Onde aparece

- Em tudo: cada resposta do Orbi passa pelo modelo.
- **Tela Autonomia → Capacidades**: o provedor ativo, os plugins encontrados
  (e o erro, se algum não carregou) e se a correção de código está ligada.
- **Painel "Uso do modelo"** (documento 13): tokens e custo por conversa.

## Como funciona

```mermaid
flowchart LR
  Agente[Agente Orbi: Flue] --> Pi[Pi: camada de provedores]
  Pi -->|ORBI_LLM=anthropic| Anthropic[API da Anthropic]
  Pi -->|qualquer outro| Ponte[provedor orbi-llm: pi-bridge.ts]
  Ponte --> Adapt{LlmAdapter}
  Adapt --> OAI[openai-compatible: OpenAI, Azure, vLLM, Ollama, LiteLLM]
  Adapt --> Plugin[plugin da empresa: plugins/nome]
  Adapt --> Mod[module: arquivo solto]
```

- O Flue usa o **Pi** para falar com provedores. Com a Anthropic, o Pi fala
  direto com a API.
- Para qualquer outro, o Orbi registra no Pi um provedor chamado `orbi-llm`
  (`llm/pi-bridge.ts`), que traduz nos dois sentidos: a conversa do Pi (mensagens,
  ferramentas, resultados) vira uma `ChatRequest` simples; a resposta do adaptador
  (texto, chamadas de ferramenta, uso de tokens) vira os eventos que o Pi espera.
- O adaptador só precisa de uma função `chat(request)`, que devolve o resultado
  inteiro ou aos pedaços:

```ts
interface LlmAdapter {
  name: string;
  models: LlmModelInfo[];
  chat(request: ChatRequest, signal: AbortSignal): Promise<ChatResult> | AsyncIterable<ChatEvent>;
}
```

O contrato completo está em `packages/plugin-sdk/src/llm.ts`.

## Escolher o modelo

No `.env` do runtime:

| `ORBI_LLM` | Quando usar | Outras variáveis |
| --- | --- | --- |
| `anthropic` (padrão) | API da Anthropic | `ANTHROPIC_API_KEY`, `ORBI_MODEL` |
| `openai-compatible` | Qualquer endpoint `/chat/completions`: OpenAI, Azure OpenAI, vLLM, Ollama, LiteLLM e a maioria dos gateways | `ORBI_LLM_BASE_URL`, `ORBI_LLM_MODEL`, `ORBI_LLM_API_KEY`, `ORBI_LLM_HEADERS` (JSON) |
| `<nome de um plugin>` | O LLM da sua empresa, por API ou SDK próprios | as `ORBI_LLM_*` que o plugin usar |
| `module:<arquivo>` | Um adaptador num arquivo solto (forma antiga; prefira plugin) | as que ele usar |

Opcionais do `openai-compatible`: `ORBI_LLM_CONTEXT_WINDOW` (padrão 128000),
`ORBI_LLM_MAX_TOKENS` (8192), `ORBI_LLM_TIMEOUT_MS` (120000).

## Plugins

Um plugin é uma pasta em `plugins/<nome>` (no app instalado, na pasta de dados;
documento 14) com um `index.mjs` que exporta:

```js
export default {
  kind: 'llm',
  name: 'llm-empresa',
  apiVersion: 1,
  description: 'LLM interno da Empresa',
  create(settings) { return { name: 'llm-empresa', models: [...], async chat(request, signal) { ... } } },
};
```

```mermaid
sequenceDiagram
  participant Runtime as Runtime (partida)
  participant Dir as plugins/
  participant Plugin as plugin llm-empresa
  participant Pi

  Runtime->>Dir: procura plugins (ORBI_PLUGINS_DIR, plugins/)
  Dir-->>Runtime: llm-empresa/index.mjs
  Runtime->>Runtime: valida (kind, name, apiVersion = 1, create)
  Runtime->>Plugin: create(settings vindas das ORBI_LLM_*)
  Plugin-->>Runtime: LlmAdapter
  Runtime->>Pi: registra o provedor orbi-llm com o adaptador
```

- `npm run plugin:new -- <nome>` cria a pasta a partir do modelo.
- `npm run plugin:test -- <nome>` confere o plugin sem o resto do Orbi: texto
  simples, chamada de ferramenta (somar 17 + 25) e resposta depois do resultado.
- O passo a passo de escrever um plugin está em [../plugins.md](../plugins.md).
- O pacote `@orbi/plugin-sdk` tem só os tipos e o número da versão do contrato
  (`PLUGIN_API_VERSION = 1`). Um plugin de versão diferente aparece com erro na
  tela Capacidades, em vez de quebrar o Orbi.

## Peças

| Onde | O quê |
| --- | --- |
| `packages/plugin-sdk/` | Contrato do adaptador e do plugin, e o modelo de plugin |
| `apps/runtime/src/llm/index.ts` | Escolhe o provedor (`configureLlm`) e monta as configurações |
| `apps/runtime/src/llm/pi-bridge.ts` | Tradução entre o Pi e o adaptador |
| `apps/runtime/src/llm/adapters/openai-compatible.ts` | Adaptador para `/chat/completions` |
| `apps/runtime/src/llm/plugins.ts` | Achar, validar e descrever plugins |
| `apps/runtime/src/llm/plugin-check.ts` + `apps/runtime/scripts/plugin-test.ts` | O teste de plugin |
| `scripts/plugin-new.mjs` | Cria um plugin a partir do modelo |

## Tecnologias

- **Pi** (`@earendil-works/pi-ai`, fixado na 1.1.0 junto com o
  `pi-agent-core`: o Flue 2.3 quebra com o Pi 1.2+).
- **Flue** (`useModel`).
- Plugins como **módulos ES** carregados com `import()`, sem compilar.

## O que muda fora da Anthropic

- **A correção de código não depende do modelo**: ela usa o agente de código
  instalado na máquina (`ORBI_CODE_AGENT`, documento 10), com qualquer modelo.
- **O raciocínio estendido ("thinking") não é usado**; o adaptador recebe só o texto.
- **Imagens viram o texto `[imagem]`.**
- **Custo**: o painel de uso mostra tokens e custo se o adaptador informar o uso;
  senão aparecem zerados.
- **Transcrição é independente** (documento 6).

## Configuração

Além da tabela acima: `ORBI_PLUGINS_DIR` (onde procurar plugins) e
`ANTHROPIC_API_KEY` com a Anthropic. A tela Capacidades mostra o provedor ativo,
e o log da partida registra `runtime iniciado` com o modelo e o adaptador.

## Testes

- `apps/runtime/test/llm-adapter.test.ts`: o agente inteiro sobre um adaptador
  escrito no próprio teste.
- `apps/runtime/test/llm-openai-compatible.test.ts`: o mesmo contra um servidor
  que imita `/v1/chat/completions`.
- `apps/runtime/test/plugins.test.ts`: achar, validar e carregar plugins.
