# Arquitetura

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
- Modelo: `anthropic/claude-haiku-5-5` por padrão; qualquer outro por um adaptador (`src/llm`, ver [llm-adaptadores.md](llm-adaptadores.md))
- Correção de código: Claude Code via Claude Agent SDK, em worktree isolada
- Navegador: `chrome-devtools-mcp` atrás de uma ponte HTTP local (o Flue só fala MCP por HTTP)
- Banco: um arquivo SQLite (`data/orbi.db`) com o cérebro e o estado do app, sem servidor; migrações versionadas

```
src/
  app.ts                    entrada: lê a configuração, compõe, sobe o que roda em segundo plano
  config.ts                 configuração pura (loadConfig) e validada na partida (validateConfig)
  compose.ts                raiz de composição: createOrbi(config) cria e liga todas as peças
  services.ts               onde agentes e ferramentas pegam as peças (services())
  http/app.ts               monta a API (createHttpApp): CORS, token, rotas
  http/errors.ts            HttpError, validação de corpo/query, formato de erro
  http/routes/*.ts          uma rota por recurso (conversas, pendências, gravações,
                            cofre, cérebro, autonomia, health, eventos)
  events.ts                 o que mudou (createEvents), para o app acompanhar
  tell.ts                   manda mensagem a uma conversa de fora dela e avisa
  agents/orbi.ts            o agente (Flue 'use agent')
  agents/capabilities.ts    monta as capacidades do agente (useOrbi)
  agents/gate.ts            portão de autonomia: roda, só relata ou pede aprovação
  agents/ui-channel.ts      canal `ui` da conversa (componentes atualizados no lugar)
  agents/tools/             uma capacidade por arquivo: terminal, browser, code,
                            brain, playbooks, voice, clock
  subagents/investigador.ts investigação só-leitura em paralelo
  skills/aprender-procedimento.ts   a única skill de fábrica: como aprender
  brain/store.ts            cérebro: fachada que aplica as regras e grava pelos repositórios
  brain/domain/             regras puras, sem banco: ontologia, lacunas, playbooks, aprendizado
  brain/repo/               SQL do cérebro, um repositório por assunto
  db/                       banco único (orbi.db), migrações versionadas e
                            changes.ts (cada escrita vira evento)
  inbox.ts conversations.ts pendências e conversas, no mesmo banco
  policy/autonomy.ts        observar · perguntar · automático, por categoria e por playbook
  mcp/bridge.ts             stdio → HTTP para o chrome-devtools-mcp
  tools/exec.ts             execução sem shell, com allowlist
  tools/claude-code.ts      correção em worktree via Claude Agent SDK
  browser/                  Chrome compartilhado + gravador de demonstrações
  vault.ts                  cofre de credenciais (Keychain / arquivo criptografado)
  stt.ts                    transcrição da narração (Whisper local ou HTTP)
  llm/                      porta LlmAdapter, ponte para o Pi e adaptadores (openai-compatible)
  contract-check.ts         garante em tempo de compilação que o runtime cumpre o contrato
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
| `GET /api/health` | Modelo, chave, ponte do Chrome, cérebro, onde fica o `.env` |
| `GET /api/events` | Feed de mudanças (server-sent events) |

O servidor só escuta em loopback. Com `ORBI_API_TOKEN` definido, toda rota exige
`Authorization: Bearer <token>`.
