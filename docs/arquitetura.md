# Arquitetura

Visão geral do sistema. Cada funcionalidade tem o seu documento, com onde
aparece, diagramas e detalhes: veja [funcionalidades/](funcionalidades/README.md).


```
┌──────────────── Orbi.app ────────────────────────────────────────────────┐
│  apps/desktop (Tauri)                                                     │
│   ├─ janela: React — Conversa · Cérebro · Autonomia                       │
│   └─ inicia ──▶ orbi-node apps/runtime/dist/server.mjs  (encerra junto)   │
│                                                                           │
│  apps/runtime  (127.0.0.1:3000)                                           │
│   ├─ agente Orbi (Flue + Claude Haiku 5.5)                                │
│   ├─ cérebro: SQLite (ontologia, grafo temporal, playbooks, execuções)    │
│   ├─ mãos: git/gh/aws/python sem shell · Chrome DevTools MCP · Claude Code│
│   ├─ gravador de demonstrações + transcrição + cofre                      │
│   └─ API HTTP + stream da conversa                                        │
└───────────────────────────────────────────────────────────────────────────┘
        packages/contracts: o que trafega entre os dois (tipos + esquema da UI)
```

## Runtime (`apps/runtime`)

- Framework: [Flue](https://flueframework.com) 2.3 sobre o harness Pi
- Modelo: `anthropic/claude-haiku-5-5` por padrão; qualquer outro por um adaptador (`src/llm`, ver [modelo e plugins](funcionalidades/12-modelo-e-plugins.md))
- Correção de código: Claude Code via Claude Agent SDK, em worktree isolada
- Navegador: `chrome-devtools-mcp` atrás de uma ponte HTTP local (o Flue só fala MCP por HTTP)
- Banco: um arquivo SQLite (`data/orbi.db`) com o cérebro e o estado do app, sem servidor; migrações versionadas

Uma pasta por capacidade. Na raiz de `src/` ficam só a entrada e o que liga as peças.

```
src/
  app.ts                    entrada: lê a configuração, compõe, sobe o que roda em segundo plano
  config.ts                 configuração pura (loadConfig) e validada na partida (validateConfig)
  compose.ts                raiz de composição: createOrbi(config) cria e liga todas as peças
  services.ts               onde agentes e ferramentas pegam as peças (services())
  events.ts                 o que mudou (createEvents), para o app acompanhar
  contract-check.ts         garante em tempo de compilação que o runtime cumpre o contrato

  agents/                   o agente Orbi (Flue 'use agent')
    orbi.ts                 instruções fixas em prompts/orbi.md + estado atual
    capabilities.ts         monta as capacidades do agente (useOrbi)
    gate.ts                 portão de autonomia: roda, só relata ou pede aprovação
    ui-channel.ts           canal `ui` da conversa (componentes atualizados no lugar)
    tools/                  uma ferramenta por capacidade: terminal, browser, code,
                            brain, playbooks, voice, clock
  subagents/investigador.ts investigação só-leitura em paralelo
  skills/                   a única skill de fábrica: como aprender
  prompts/*.md              os textos que o modelo lê (Orbi, investigador, skill)

  brain/                    cérebro: store.ts (fachada), domain/ (regras puras), repo/ (SQL)
  conversations/            conversas, pendências e tellAgent (mensagem de fora da conversa)
  autonomy/policy.ts        observar · perguntar · automático, por categoria e por playbook
  terminal/exec.ts          execução sem shell, com allowlist
  code/claude-code.ts       correção em worktree via Claude Agent SDK
  browser/                  Chrome compartilhado, gravador de demonstrações e
    mcp/                    a ponte stdio → HTTP do chrome-devtools-mcp
  voice/stt.ts              transcrição da narração (Whisper local ou HTTP)
  vault/vault.ts            cofre de credenciais (Keychain / arquivo criptografado)
  llm/                      porta LlmAdapter, ponte para o Pi, adaptadores e plugins
  observability/            log.ts (logs estruturados), telemetry.ts (observa o Flue),
                            usage.ts (uso por conversa e por dia)

  http/                     a API: app.ts monta, errors.ts, routes/ (uma por recurso)
  db/                       banco único (orbi.db), migrações e changes.ts (escrita → evento)
scripts/
  demo-server.ts            runtime com modelo roteirizado, cérebro e portal de exemplo
  e2e-*.ts                  testes de ponta a ponta com Chrome
```

## App (`apps/desktop`)

```
src/
  views/conversation/       lista de conversas, Chat (mensagens, compositor), pendências
  views/brain/              Cérebro: grafo (e seu layout), detalhe, playbooks, execuções, ontologia
  views/AutonomyView.tsx    níveis de autonomia, modelo, plugins, cofre
  components/               catálogo do canal ui, demonstração, painel de gravação, Markdown
  api.ts                    cliente da API local (tipos vêm do contrato)
  live.ts                   o feed de mudanças do runtime (uma conexão para o app todo)
  hooks.ts                  useLive (dados que seguem o runtime), useLoad, usePoll (só o health)
  audio.ts                  microfone → WAV 16 kHz cortado nas pausas
test/                       Vitest: feed de eventos, layout do grafo, agrupamento das mensagens
src-tauri/
  src/main.rs               janela + início/parada do runtime, PATH do shell, pasta de dados
  tauri.conf.json           identidade do app (br.com.zup.orbi), janela, CSP
  tauri.bundle.conf.json    acrescentado só no `npm run build`: runtime e Node embutidos
```

O app procura o runtime em `127.0.0.1:3000`. Se já houver um (por exemplo o
`npm run demo`), usa esse. Senão, inicia:

- **app instalado**: o runtime de dentro do pacote com o `orbi-node` ao lado do
  executável; dados em `~/Library/Application Support/br.com.zup.orbi`; o PATH
  vem do seu shell de login, para achar `git`, `gh`, `aws` e `python3` do Homebrew;
- **desenvolvimento**: `apps/runtime/dist/server.mjs` com o `node` do PATH; dados em `apps/runtime/data`.

Se o app morrer sem conseguir encerrar o runtime, o runtime percebe (vigia o
processo pai) e sai sozinho.

## Contrato (`packages/contracts`)

Tudo o que cruza a fronteira runtime ↔ app:

- `ui.ts`: o esquema (valibot) dos componentes que o agente manda no canal `ui`
  (`stepper`, `status`, `approval`, `question`, `table`, `link`, `code`, `learning`).
  O runtime valida com ele; o app desenha a partir dos mesmos tipos.
- `api.ts`: os formatos da API HTTP como o app os lê.
- `requests.ts`: o esquema (valibot) de cada corpo que o app envia e o formato
  único de erro `ApiError`.
- `events.ts`: os tópicos do feed de mudanças.

## Eventos: o app acompanha sem consultar de tempos em tempos

`GET /api/events` é um stream (server-sent events) que diz **o que** mudou,
nunca o dado em si: `{"topic":"inbox","id":"…"}`. A tela que mostra aquele
tópico busca de novo pela rota de sempre. A cada conexão o runtime manda
`hello`, e todas as telas recarregam, então nada fica velho depois de o runtime
reiniciar.

De onde vêm os eventos:

- **banco**: `db/changes.ts` cria um gatilho SQLite por tabela que chama de
  volta o `events.emit`. Qualquer escrita, de qualquer código, vira evento, e
  as lojas (cérebro, pendências, conversas, autonomia) nem sabem disso;
- **cofre** e **gravação**: avisam por um `onChange` que a composição liga;
- **conversa**: `tellAgent` (aprovação, demonstração, retorno agendado) avisa
  `dispatched`, e o app busca a conversa se ela ainda estava vazia.

Mudanças do mesmo instante viram um evento só. A única consulta periódica que
sobrou é o `health`, que é justamente para saber se o runtime está de pé.

## API HTTP

Cada recurso tem seu arquivo em `http/routes`. A rota valida o corpo com o
esquema de `requests.ts` (`body(c, Esquema)`) e, se algo der errado, lança um
`HttpError`. Um único tratador transforma isso na resposta:

```json
{ "error": { "code": "invalid_body", "message": "…", "details": [{ "path": "level", "message": "…" }] } }
```

Códigos usados: `invalid_body`, `invalid_query` (400), `unauthorized` (401),
`not_found` (404), `conflict` (409, por exemplo uma pendência já decidida),
`too_large` (413) e `internal` (500, com o erro no log). O app lê `error.message`
e mostra direto ao usuário. `test/http.test.ts` cobre as rotas.

`apps/runtime/src/contract-check.ts` compara os tipos internos do runtime com o
contrato. Se um lado mudar sem o outro, `npm test` falha apontando o par.

## Composição

Nenhum módulo cria nada ao ser importado. `app.ts` é a única entrada com
efeitos: lê o `.env`, chama `createOrbi(loadConfig())` e entrega as peças ao
servidor. Como o Flue chama os agentes só com `{ id }`, agentes e ferramentas
pegam as peças com `services()`. Testes e scripts montam o próprio conjunto com
`createOrbi(config, substitutas)`: por exemplo, um transcritor falso ou um cofre
em arquivo.

O contrato é código TypeScript sem etapa de build: o Vite do app e o do runtime
o compilam junto. No runtime ele propositalmente não aparece em `dependencies`
(o Flue deixaria qualquer dependência declarada de fora do bundle).

## O cérebro começa vazio

O Orbi não vem com nada: nem conhecimento, nem tipos. Na primeira vez que um
aprendizado precisa de um tipo (`Repositorio`, `Portal`…), o Orbi propõe o tipo
no mesmo lote, e você aprova tudo junto no mesmo cartão. Dentro do lote os tipos
são gravados antes das entidades que os usam. Assim a ontologia fica só com o
que existe no seu trabalho, com os nomes que surgiram com você.

O `npm run demo` continua com uma ontologia e um grafo de exemplo
(`EXAMPLE_TYPES`), para mostrar a ideia. Um cérebro criado antes desta versão
perde, na migração 4, os tipos de fábrica que nunca foram usados nem editados;
o que você já ensinou fica.

## Busca

Toda busca por texto (procedimentos em `playbook_similar`, entidades em
`brain_query`) passa pelo índice de texto do SQLite (FTS5), mantido por
gatilhos a cada escrita:

- o pedido vira palavras sem acento e sem palavrinhas ("de", "para"…), cortadas
  no radical: "deleta", "deletar" e "deletado" viram `delet*`;
- o índice ordena por BM25: palavra rara e decisiva pesa mais que palavra comum,
  e o nome do procedimento pesa mais que a descrição, que pesa mais que os passos;
- sinônimos ("apagar" × "deletar") não se encontram aqui; isso é a busca por
  significado, que ainda não existe.

O catálogo de skills nas instruções do modelo tem só os 15 procedimentos mais
usados (`ORBI_SKILL_CATALOG_SIZE`), em ordem estável. Os outros o modelo acha
com `playbook_similar` e roda pelo nome. Assim as instruções não crescem com o
cérebro.

**Medição.** `test/fixtures/search-eval.json` tem 24 procedimentos e 40 pedidos,
cada um com o procedimento certo. `npm run eval:search -w @orbi/runtime` mostra
o acerto no 1º lugar e entre os 3 primeiros, separado em pedidos com as mesmas
palavras e pedidos por sinônimo. Um teste trava o mínimo, para nenhuma mudança
piorar a busca sem ninguém ver. Hoje: 100% entre os 3 com as mesmas palavras
(antes do índice, 91%), 38% por sinônimo.

## Já sei algo parecido?

Antes de agir num pedido e antes de guardar um procedimento, o Orbi procura o
que já sabe:

1. `playbook_similar` busca no índice (veja "Busca" abaixo) e traz os 3
   melhores com passos, instruções e histórico. Não decide nada.
2. O modelo compara e decide: **igual** (mesmo objetivo e passos), **parecido**
   ou **distante**. Na dúvida, é parecido. O playbook de uma ação nunca serve
   para a ação oposta.
3. `similar_found` mostra o resultado. Igual vira uma linha, "Já sei fazer
   isso", e o turno segue. Parecido vira o cartão (o que sei, o que aproveito, o
   que muda, a sugestão e as opções) e o turno termina até você escolher. O
   histórico do cartão (usos, sucessos, data) vem do cérebro, nunca do modelo.
4. Se a escolha for uma versão, o playbook novo leva `variationOf` com o nome
   da base e mantém o `id` dos passos aproveitados. O cartão de aprovação compara
   com a base e marca cada passo como igual, muda, novo ou sai. A base não muda.

No Cérebro, cada variação aparece logo abaixo da base, com a ligação nos dois
sentidos. O `npm run demo` tem o caso de exemplo: peça para deletar um
repositório.

## Prompts

O que o modelo lê fica em `src/prompts/*.md`, fora do código: dá para revisar e
ajustar o texto sem mexer em TypeScript. O código importa o arquivo como texto
(`import instrucoes from '../prompts/orbi.md?raw'`); no build o Vite embute o
texto, e nos testes e scripts o `scripts/raw-hooks.mjs` faz o mesmo no Node.
Só o que muda a cada conversa (estado do cérebro, playbook em execução) é
montado em `agents/orbi.ts`.

## Observabilidade

**Logs.** Todo log sai por `log.ts`, uma linha por evento com atributos em vez
de texto montado: `turno do modelo conversation=chat:… model=… ms=812
tokensIn=3593 costUsd=0.0042`. No terminal o formato é legível; no app
(`logs/runtime.log`) é JSON, uma linha por evento, fácil de filtrar com `jq`:

```bash
jq -c 'select(.conversation == "chat:01…")' ~/Library/Application\ Support/br.com.zup.orbi/logs/runtime.log
```

`ORBI_LOG_FORMAT` (`json` | `pretty`) e `ORBI_LOG_LEVEL` (`debug` mostra também
cada ferramenta que deu certo) mudam isso.

**Uso.** `telemetry.ts` assina os eventos de runtime do Flue (`observe`). Cada
turno do modelo e cada chamada de ferramenta soma, por conversa e por dia, na
tabela `usage`: tokens, custo estimado (pela tabela de preços do modelo), tempo
de espera e falhas. A conversa é a instância do agente (`chat:…`), então o
trabalho de subagentes conta na conversa que os chamou. A tela Autonomia mostra
hoje, o período (7, 30 ou 90 dias) e cada conversa, e atualiza sozinha pelo
evento `usage`. Adaptadores de LLM que não informam uso aparecem com zero.

## API local

| Rota | O quê |
| --- | --- |
| `POST /agents/orbi/:id` · `GET /agents/orbi/:id` | Conversa Flue: enviar mensagem, ler stream |
| `GET/POST/PATCH /api/conversations` | Lista, cria e renomeia conversas |
| `GET /api/inbox` | Aprovações, perguntas e aprendizados pendentes |
| `POST /api/inbox/:id/decision` `{decision}` | Aprovar/negar (vira sinal na conversa) |
| `POST /api/inbox/:id/answer` `{text}` | Responder pergunta |
| `GET /api/brain` | Ontologia, entidades, ligações, lacunas |
| `GET /api/brain/entities/:id` · `GET /api/brain/search?q=` | Navegar o grafo |
| `GET /api/brain/playbooks` · `PATCH /api/brain/playbooks/:name` | Playbooks e autonomia de cada um |
| `GET /api/brain/runs` | Execuções de playbook (passo a passo) |
| `POST /api/brain/export` | Exporta o cérebro em Markdown (Obsidian) |
| `GET/PATCH /api/autonomy` | Níveis globais por categoria |
| `POST /api/recordings` · `GET /api/recordings/:id` · `POST …/audio` · `POST …/stop` | Demonstração no navegador |
| `GET /api/vault` · `PUT/DELETE /api/vault/:name` | Cofre (só nomes e descrições, nunca valores) |
| `POST /api/transcribe` | Ditado: áudio WAV vira texto (nada é guardado) |
| `GET /api/voice` · `POST /api/voice/prepare` · `PUT /api/voice/model` | Modelo de transcrição: pasta, arquivos, baixar e testar, trocar |
| `DELETE /api/conversations/:id` | Apagar conversa |
| `/api/agents/...` · `POST /mcp` | Agentes de código (documento 15) |
| `GET /api/health` | Modelo, chave, ponte do Chrome, cérebro, onde fica o `.env` |
| `PATCH`/`DELETE /api/brain/entities/:id` | Editar ou apagar uma entidade (pela tela Cérebro) |
| `PUT`/`DELETE /api/brain/playbooks/:name` | Editar ou apagar um procedimento |
| `GET /api/events` | Feed de mudanças (server-sent events) |
| `GET /api/usage?days=30` | Uso do modelo e das ferramentas: hoje, período e por conversa |

O servidor só escuta em loopback. Com `ORBI_API_TOKEN` definido, toda rota exige
`Authorization: Bearer <token>`.
