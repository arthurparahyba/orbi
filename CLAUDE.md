# CLAUDE.md

Orbi é um copiloto local para desenvolvedores: aprende os procedimentos repetitivos
depois do commit (CI, deploy, GMUD, portais) e passa a executá-los, com aprovação
conforme a autonomia que o desenvolvedor dá. Roda inteiro na máquina do usuário:
um app desktop (Tauri + React) e um runtime Node (Flue) com SQLite.

Antes de mexer numa funcionalidade, leia o documento dela em
`docs/funcionalidades/` (01 a 16). A visão geral está em `docs/arquitetura.md`; as
tabelas, migrações e gatilhos, em `docs/banco.md`.

## Estrutura

npm workspaces. Rode tudo da raiz.

```
apps/runtime/       runtime: agente (Flue), API HTTP (Hono), cérebro (SQLite), navegador, cofre
  src/compose.ts      raiz de composição: createOrbi(config) monta todas as peças; startBackground
  src/services.ts     services(): como agentes e ferramentas pegam as peças (o Flue não injeta)
  src/config.ts       loadConfig(env, cwd) puro + validateConfig
  src/agents/         o agente Orbi; tools/ tem uma capacidade por arquivo; gate.ts é o portão
  src/brain/          domain/ (regras puras) · repo/ (SQL) · store.ts (fachada BrainStore)
  src/http/           app.ts monta; routes/ um arquivo por recurso; errors.ts
  src/db/             migrações versionadas e changes.ts (gatilhos → eventos)
  src/mcp/            o Orbi como servidor MCP para agentes de código (/mcp): ferramentas, pedidos, sugestões
  src/pipelines/      esteiras: entregas (runs.ts) e o motor que decide a próxima etapa (engine.ts)
  src/prompts/*.md    textos que o modelo lê
  src/{autonomy,browser,code,conversations,llm,observability,terminal,vault,voice}/
  test/               node:test (+ fixtures/search-eval.json)
  scripts/            demo-server, e2e, eval-search, write-entry, register-raw
apps/desktop/       app: React 19 + Vite; src-tauri/ (Rust) sobe e para o runtime
  src/views/{conversation,pipelines,brain,agents,autonomy}/   telas
  src/components/     cartões do canal ui, gravação, confirmação
  src/live.ts, hooks.ts   feed de eventos (SSE) e useLive
  test/               Vitest
packages/contracts/ tipos e esquemas valibot compartilhados pelo app e pelo runtime
packages/plugin-sdk/ contrato dos plugins de LLM (só tipos) e o modelo de plugin
plugins/            plugins locais (ignorados pelo git, exceto o README)
docs/               funcionalidades/, arquitetura, desenvolvimento, empacotamento, plugins
scripts/            start, dev, build-app, plugin-new
```

## Comandos

```bash
npm install
npm start                 # compila o runtime e abre a interface no navegador (precisa de ANTHROPIC_API_KEY em apps/runtime/.env)
npm run demo              # runtime com modelo roteirizado e exemplos, sem chave; com `npm run demo:ui` na outra aba
npm run dev               # app desktop (precisa de Rust/cargo)
npm test                  # testes do runtime, tipos do runtime e do app, Vitest do app
npm run e2e               # ponta a ponta com Chrome real (ponte MCP + demonstração gravada)
npm run eval:search -w @orbi/runtime   # acerto da busca de procedimentos
npm run build             # instalador da plataforma atual (gere na plataforma de destino)
```

Um teste só: `cd apps/runtime && node --import tsx --import ./scripts/register-raw.mjs --test test/<arquivo>.test.ts`
(o `register-raw` é obrigatório: os prompts são importados com `?raw`).

Antes de dar uma mudança por pronta: `npm test` e, se tocou em navegador, gravação,
cofre ou ponte MCP, `npm run e2e`.

## Regras da arquitetura

- **Toda ação que muda algo passa pelo portão** (`agents/gate.ts`, via `ctx.gated`), com
  uma categoria de `autonomy/policy.ts`. Leitura pode ser ferramenta comum. Nunca crie
  uma ferramenta que escreve, publica ou apaga sem o portão. `aprender` sempre pede aprovação.
- **O código não conhece o domínio do usuário.** Nada de CI, GMUD ou portal específico no
  código: isso é aprendido e guardado no cérebro. O código dá capacidades genéricas.
- **O cérebro começa vazio**, sem tipos. Não reintroduza tipos de fábrica; a demo usa
  `EXAMPLE_TYPES` explicitamente.
- **Regras puras em `brain/domain/`**, SQL em `brain/repo/`, orquestração em `store.ts`.
  Validação vale igual para o que o Orbi aprende e para o que o usuário edita na tela.
- **Sem efeito colateral ao importar um módulo.** Tudo é criado em `createOrbi`; o que roda
  em segundo plano, em `startBackground`. Configuração só por `loadConfig`.
- **Contrato compartilhado**: formatos da API, pedidos (valibot) e componentes do canal `ui`
  ficam em `packages/contracts`. Mudou um lado, mude o contrato; `contract-check.ts` acusa
  divergência no runtime. Erros da API saem sempre como `{ error: { code, message, details? } }`
  (`HttpError`).
- **O modelo nunca escreve HTML.** Interface na conversa é um componente do catálogo em
  `contracts/src/ui.ts`, desenhado em `apps/desktop/src/components/`. Dados mostrados nos
  cartões (histórico, contadores) vêm do banco, preenchidos pelo runtime, nunca do modelo.
- **Banco**: um arquivo `data/orbi.db`. Migrações em `db/migrations.ts` são só de acréscimo,
  nunca edite uma que já existe (e atualize `docs/banco.md`). Toda tabela que a tela mostra precisa estar em `db/changes.ts`
  para virar evento; o app não consulta de tempos em tempos (só o health, e o `live.ts` quando o feed cai).
- **Busca** passa pelo índice FTS5 (mantido por gatilhos SQLite). Mudou a busca: rode
  `eval:search`; o teste em `brain-domain.test.ts` trava o mínimo, e esse mínimo não pode baixar.
- **Prompts** ficam em `src/prompts/*.md`, importados com `?raw`. Regra de comportamento do
  modelo vai no prompt, não espalhada em descrições de ferramenta.
- **Telas**: componentes pequenos (até ~90 linhas), um arquivo por parte da tela; lógica sem
  React em arquivos `.ts` testáveis com Vitest. Dados que seguem o runtime usam `useLive(load, tópicos)`.

## Segurança (não negociável)

- **Credenciais nunca chegam ao modelo, ao cérebro, à conversa nem aos logs.** Ficam no
  cofre (`vault/`); procedimentos guardam `{{segredo:nome}}`, resolvido só dentro da
  ferramenta que usa, com a saída limpa por `redact`.
- **O runtime escuta só em 127.0.0.1** (`scripts/write-entry.mjs` substitui a entrada do
  Flue). A ponte do Chrome também, com token. Não exponha nada à rede.
- **Comandos sem shell**, só binários da lista (`ORBI_ALLOWED_BINARIES`), só dentro do
  workspace, com ambiente montado explicitamente. `run_python` roda em pasta própria sem o
  ambiente do usuário.
- Nunca peça nem cole chaves de API; elas ficam em `apps/runtime/.env` (ignorado pelo git).
- Credencial que o Orbi precisa é pedida com `ask_secret`: o cartão grava direto no cofre
  (`POST /api/inbox/:id/secret`) e o modelo recebe só a referência. Nunca leve um valor
  digitado pelo usuário para a conversa.
- **Agentes de código (MCP)** entram por `/mcp` com token próprio (só o hash fica no banco).
  Eles nunca aprovam, nunca veem credenciais e nunca gravam no cérebro: `orbi_teach` vira
  sugestão, e só o desenvolvedor aceita (`/api/agents/suggestions/:id/accept`). Rodar
  esteiras e pular perguntas de passagem são permissões desligadas por padrão.
- **Autonomia que cresce**: dentro de um procedimento, o portão decide pelo nível (N1–N3,
  `brain/domain/levels.ts`) e pela ação já ser conhecida. Apagar nunca roda sozinho, a não
  ser no N3 posto pelo desenvolvedor com a ação conhecida. Subir e descer é do runtime
  (`settleRun`), nunca do modelo, e sempre avisa (cartão e Pendências, com Manter).
- **Esteiras**: o motor (`pipelines/engine.ts`) decide ramo, dados e passagem, nunca o
  modelo. Passagem "perguntar" só segue sem o desenvolvedor com destino dado por ele
  ou com a permissão do agente.

## Armadilhas conhecidas

- **Pi fixado em 1.1.0** (`overrides` na raiz): o Flue 2.3 quebra com o Pi 1.2+. Não atualize
  `@earendil-works/pi-ai` nem `pi-agent-core` sem testar o fluxo inteiro.
- **`@orbi/contracts` e `@orbi/plugin-sdk` não podem estar nas dependências do runtime**: o
  `@flue/vite` externaliza toda dependência declarada, e o Node não roda `.ts` de
  `node_modules`. Sem declarar, eles entram no bundle.
- **O agente é refeito a cada turno** (Flue): instruções, ferramentas e skills são
  recalculadas. Mudanças no catálogo de skills viram sinais na conversa; mantenha o catálogo
  estável (só os mais usados, em ordem fixa).
- **Semicolons** quebram mensagens em diagramas Mermaid de sequência. Use vírgula.
- O app empacotado só se gera na plataforma de destino; o Windows ainda não foi testado.

## Convenções

- **Idioma**: interface, mensagens ao usuário, prompts, documentação e mensagens de commit
  em português do Brasil. Código, nomes e comentários de código em inglês.
- Texto da interface direto e curto, sem jargão técnico quando houver palavra comum
  ("procedimento", não "playbook", nos textos novos voltados ao usuário).
- Ao mudar uma funcionalidade, atualize o documento dela em `docs/funcionalidades/`
  (onde aparece, como funciona, peças, configuração, limites, testes) e, se mudar a API,
  a tabela em `docs/arquitetura.md`.
- Variável de configuração nova: em `loadConfig`, validada em `validateConfig` se puder dar
  erro, e documentada em `apps/runtime/.env.example`.
- Logs só por `observability/log.ts`, com atributos (`conversation`, `tool`…), nunca
  `console.log` no runtime.
