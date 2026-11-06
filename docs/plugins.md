# Plugins

Um plugin é código seu que o Orbi carrega sem que você mexa no código do Orbi.
O Orbi define o contrato (`@orbi/plugin-sdk`), você implementa e coloca a pasta
do plugin no lugar certo. Hoje o tipo suportado é `llm`: a conexão com um
modelo de linguagem, por exemplo o LLM da sua empresa.

## Em 4 passos

```bash
npm run plugin:new -- gateway-empresa      # 1. cria plugins/gateway-empresa a partir do modelo
#                                            2. implemente chat() em plugins/gateway-empresa/index.mjs
#                                            3. em apps/runtime/.env:  ORBI_LLM=gateway-empresa  (+ ORBI_LLM_*)
npm run plugin:test -- gateway-empresa     # 4. testa contra o LLM real
npm start
```

O `plugin:test` chama o seu LLM três vezes e só aprova quando as três funcionam:

| Verificação | O que confere |
| --- | --- |
| Resposta em texto | URL, credenciais e leitura da resposta |
| Chamada de ferramenta | Pede `17 + 25` com uma ferramenta `somar` e espera uma chamada com `id` e argumentos que somam 42 |
| Resposta depois do resultado | Devolve o resultado da ferramenta e espera uma resposta com 42 |

Quando algo falha, ele mostra o erro e o que olhar no seu `chat()`.

## Onde ficam

| Situação | Pasta de plugins | Configuração (`.env`) |
| --- | --- | --- |
| Rodando do repositório (`npm start`, `npm run dev`) | `plugins/` na raiz | `apps/runtime/.env` |
| App instalado (`Orbi.app`) | `~/Library/Application Support/br.com.zup.orbi/plugins` | `~/Library/Application Support/br.com.zup.orbi/.env` |
| Qualquer outra | `ORBI_PLUGINS_DIR` (uma ou mais pastas, separadas por `:`) | — |

No app instalado, os plugins ficam fora do pacote: atualizar o Orbi não apaga
o plugin. Basta copiar a pasta do plugin para lá e reabrir o app.

`plugins/` não vai para o git do Orbi (só o README). O plugin da empresa pode
ter um repositório privado próprio, clonado dentro de `plugins/`.

## O contrato

Um plugin é uma pasta com `index.mjs` (ou `"main"` no `package.json`) que
exporta por padrão:

```js
/** @type {import('@orbi/plugin-sdk').LlmPlugin} */
export default {
  kind: 'llm',
  name: 'gateway-empresa',      // usado em ORBI_LLM=
  apiVersion: 1,                // versão do contrato para a qual foi escrito
  description: 'LLM da empresa',
  create(settings) {            // settings: model, baseUrl, apiKey, headers e env (todas as ORBI_LLM_*)
    return {
      name: 'gateway-empresa',
      models: [{ id: settings.model, contextWindow: 128000, maxTokens: 8192 }],
      async chat(request, signal) {
        // request: { model, system, messages, tools, maxTokens, temperature }
        return { text, toolCalls };   // toolCalls: [{ id, name, arguments }]
      },
    };
  },
};
```

Os tipos completos, com comentários, estão em `packages/plugin-sdk/src/llm.ts`.

O que o Orbi espera de um adaptador:

- **Chamada de ferramentas é obrigatória.** O Orbi age por ferramentas. Se a
  API da empresa não tiver function calling, o `chat()` pode pedir ao modelo um
  JSON com a chamada e convertê-lo em `toolCalls`.
- **Cada chamada tem um `id`**, que volta depois na mensagem `tool` (`toolCallId`).
  Gere um se a API não tiver.
- **Falhas são exceções.** A mensagem aparece no app com o nome do plugin na frente.
- **Repasse o `signal`** para o cancelamento funcionar.
- **Mensagens `user` podem conter avisos do runtime** (`<signal …>`). Repasse como estão.
- **Streaming é opcional.** Para o texto aparecer aos poucos no app, devolva um
  gerador de eventos `text` / `tool_call` / `done` em vez de um objeto.

## Versões do contrato

`apiVersion` diz para qual versão do contrato o plugin foi escrito. O Orbi só
muda o número quando quebra o contrato. Se um plugin ficar para trás, a tela
**Autonomia** e o log mostram "escrito para a versão X do contrato; este Orbi
usa a versão Y", e o plugin não é carregado.

## Dependências e TypeScript

- **Dependências próprias** (um SDK interno, por exemplo): `npm install <pacote>`
  dentro da pasta do plugin. O Node as encontra a partir dali.
- **Tipos no editor:** com o plugin dentro de `plugins/` no repositório, o
  `@type {import('@orbi/plugin-sdk')…}` do modelo já funciona.
- **Plugin em TypeScript:** compile para JavaScript e aponte o `"main"` para o
  `.js`. O `index.ts` direto só funciona com Node ≥ 22.18.

## Ver o que foi carregado

- **Tela Autonomia:** cada plugin, se está ativo, disponível ou com erro, e de qual pasta veio.
- **Log do runtime:** `[orbi] plugin <nome> (llm) ok — <pasta>`.
- **Lista no terminal:** `npm run plugin:test` sem nome lista as pastas e os plugins encontrados.
