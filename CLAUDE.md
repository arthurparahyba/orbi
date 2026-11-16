# CLAUDE.md

Orbi é um copiloto local para desenvolvedores: aprende os procedimentos repetitivos
depois do commit (CI, deploy, GMUD, portais) e passa a executá-los, com aprovação
conforme a autonomia que o desenvolvedor dá. Roda inteiro na máquina do usuário:
um app desktop (Tauri + React) e um runtime Node (Flue) com SQLite.

Antes de mexer numa funcionalidade, leia o documento dela em
`docs/funcionalidades/` (01 a 26). O mapa dos módulos — quais contextos existem, o que cada
módulo faz, a interface pública de cada contexto e quem é dono de cada tabela — está em
`docs/modulos.md`, e é o mapa que o combinado abaixo usa.
A visão geral está em `docs/arquitetura.md`, e o mapa visual
(o que o Orbi recebe em cada turno e o que chama em cada ponto de ensinar, executar e revisar) em
`docs/mapa-visual/`: mudou um caso de uso, atualize o quadro dele; as
tabelas, migrações e gatilhos, em `docs/banco.md`.

## Combinado antes de cada funcionalidade

O desenvolvedor quer continuar fluente na arquitetura: usar os nomes dos módulos nas conversas
e perceber, a cada funcionalidade, se a divisão ainda serve. Então antes de escrever código de
qualquer funcionalidade nova, apresente o combinado e espere ele concordar. Cinco itens, curtos:

1. **Onde entra** — os contextos e módulos afetados, marcados na árvore de `docs/modulos.md`:
   `~` alterado, `+` novo. Só os ramos que mudam, não a árvore inteira.
2. **O caso de uso** — a função de `contexts/<contexto>/use-cases/` que é a funcionalidade: assinatura e
   corpo, em chamadas, sem implementação (documento 27). É este o código que o desenvolvedor quer
   revisar antes de existir. Funcionalidade de uma ou duas chamadas não ganha caso de uso: diga isso.
3. **Interface pública** — o que entra ou muda no `index.ts` de cada contexto afetado, por nome
   e assinatura. Se nada muda na interface, diga isso com essas palavras: é sinal de que a
   funcionalidade é interna a um módulo, e isso é uma boa notícia. Se a tela lê o resultado, diga também o
   que entra em `packages/contracts/src/api/<contexto>.ts` e em `apps/desktop/src/api/<contexto>.ts`:
   são os mesmos onze contextos nos três lugares (documento 26, fase 6).
4. **Dados** — tabela ou coluna nova, e qual contexto é dono. Referência a outro contexto é id
   em coluna solta; nunca chave estrangeira, nunca JOIN.
5. **Precisa repensar os módulos?** — responda sempre, inclusive quando a resposta é não.
   Quebre um módulo em dois quando ele passar a responder duas perguntas diferentes, quando a
   interface pública do contexto passar de uns oito nomes, ou quando dois módulos do mesmo
   contexto nunca forem usados juntos. Proponha contexto novo quando uma tabela nova não couber
   na pergunta de nenhum contexto existente.

Como apresentar: texto é suficiente, e a árvore de diretórios marcada costuma ser o mais claro.
Diagrama de sequência ou de contexto quando a funcionalidade atravessa três contextos ou mais.
O código da implementação não entra — mas **o caso de uso entra**: ele não é implementação, é a
funcionalidade em chamadas, e é o que o desenvolvedor quer ler.

Não implemente antes do ok. Se ele pedir para seguir direto, mostre o combinado junto da
primeira entrega, não depois dela. Terminada a implementação, atualize `docs/modulos.md` no
mesmo commit e diga em uma linha o que mudou na interface pública.

Fora do combinado também: ao falar de uma parte da aplicação, use o nome do módulo em português
(*fatos*, *portão*, *papéis*), não o caminho do arquivo. O caminho é em inglês, como manda a
convenção, e `docs/modulos.md` traz os dois lados. É esse vocabulário que mantém os dois alinhados.

## Quando o desenvolvedor pergunta como algo funciona

Ele quer ler a orquestração, não a implementação. Responda em quatro partes, nesta ordem:

1. **Onde mora** — o contexto e o caso de uso, com o caminho
   (`procedures`, `use-cases/start-procedure.ts`). O índice de cada contexto está em
   `docs/modulos.md`; é por ele que se acha o nome.
2. **Um diagrama de sequência simplificado.** Ele serve para dizer **onde aquele código roda** —
   quem dispara, por onde passa, de que módulo é cada um — e não o que acontece por dentro.
   - **Cada raia leva o módulo embaixo do nome**: `composição`, `em procedures`, `fora do
     runtime`. Sem isso o desenho não responde a pergunta que o desenvolvedor faz.
   - **Uma raia por salto de módulo, não por arquivo.** Dois arquivos do mesmo módulo
     conversando são uma raia só (o router do Flue e o agente, por exemplo).
   - **A exceção é o ponto de decisão**: quando entre dois participantes não há código e sim o
     modelo escolhendo, eles ficam em raias separadas mesmo sendo do mesmo módulo. É o salto
     mais importante do desenho.
   - **Teto de cinco raias.** Os módulos que o caso de uso chama por dentro vão numa caixa
     abaixo do diagrama, na ordem, não em raias.
   - **Monte o diagrama das declarações, não do código.** As raias saem de
     `agents/capabilities.ts` (a lista do turno), do `needs` de cada capability (de que contexto
     ela é e quais ela toca), do índice de casos de uso em `docs/modulos.md` e das linhas de
     `http/app.ts` (a entrada). Nenhuma implementação precisa ser lida para isso. O único arquivo
     que se abre é o caso de uso que a resposta vai mostrar — e dele sai a caixa de baixo.
     Se montar um diagrama exigiu ler implementação, uma declaração está mentindo: conserte a
     declaração, não o diagrama.
3. **O código do caso de uso, inteiro.** Ele cabe: o teste garante no máximo 25 linhas de corpo.
4. **As chamadas que ele faz**, uma linha cada, e só quando o nome não disser sozinho.

O diagrama é desenhado na hora, lendo o código, e **não é guardado em documento**: diagrama
guardado apodrece em três funcionalidades e nenhum teste pega. O que fica guardado é o índice
(`docs/modulos.md`) e esta regra.

Se a pergunta for sobre uma funcionalidade que ainda não tem caso de uso — porque é de uma ou
duas chamadas, ou porque o contexto dela ainda não ganhou a camada — diga isso e mostre o
handler. Não invente um caso de uso que não existe para a resposta ficar bonita.

## Estrutura

npm workspaces. Rode tudo da raiz.

```
apps/runtime/       runtime: agente (Flue), API HTTP (Hono), cérebro (SQLite), navegador, cofre
  src/compose.ts      raiz de composição: createOrbi(config) monta todas as peças; startBackground
  src/services.ts     services(): o agente (orbi.ts) e as rotas pegam as peças; ferramentas não
  src/config.ts       loadConfig(env, cwd) puro + validateConfig
  src/agents/         um agente por contexto de chat (orbi.ts, configurador.ts, revisor.ts; directory.ts roteia por prefixo);
                      tools/ uma capacidade por arquivo (defineCapability); gate.ts é o portão;
                      runtime-port.ts é a única porta para o Flue
  src/http/           app.ts monta; routes/ um arquivo por recurso; errors.ts
  src/db/             migrações versionadas e changes.ts (gatilhos → eventos)
  src/mcp/            o Orbi como servidor MCP para agentes de código (/mcp): ferramentas, pedidos, sugestões
  src/prompts/*.md    textos que o modelo lê; orbi/ em partes, escolhidas por agents/prompt.ts
  src/contexts/       toda a funcionalidade, em onze contextos (documento 26); de fora, só pelo index.ts
                      cada contexto com orquestração tem use-cases/: a funcionalidade em chamadas (doc 27)
    models/             com o que o Orbi pensa: provider, plugins, roles, cost, setup; rota em http.ts
    platform/           onde ele roda: os, env, preferences; dono da tabela settings
    secrets/            o cofre de credenciais (um módulo só, código plano em src/)
    improvement/        como ele fica melhor: review, judge, diagnosis, report; rota em http.ts
    trust/              o que ele pode fazer sozinho: levels, policy; rota em http.ts
    knowledge/          o que ele sabe: ontology, facts, search, problems (contexto folha)
    procedures/         o que sabe fazer e está fazendo: definition, rehearsal, execution,
                        proofs, learnings, pipelines
    learning/           o que espera aprovação, e a transação tudo-ou-nada do lote
    talk/               por onde o desenvolvedor fala: conversations, inbox, followups, voice
    tools/              com o que ele age: terminal, browser, mcp-client, code-agents, commands
    telemetry/          uso por conversa, log, resultado da última chamada
  src/language/         a linguagem compartilhada: só tipos e constantes, importa contexto nenhum
  src/wiring.ts         liga os contextos que compartilham o banco (e só isso)
  src/overview.ts       as duas leituras que atravessam contexto: stats e exportBrain
  test/               node:test (+ fixtures/search-eval.json); boundary.test.ts guarda a fronteira dos contextos
  scripts/            demo-server, e2e, eval-search, write-entry, register-raw
apps/desktop/       app: React 19 + Vite; src-tauri/ (Rust) sobe e para o runtime
  src/views/{conversation,pipelines,brain,autonomy}/   telas (autonomy/agents: agentes que pedem; autonomy/mcp: ferramentas MCP)
  src/components/     cartões do canal ui, gravação, confirmação; chat/ é o chat comum (ChatPanel) a todas as telas
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
npm run e2e               # ponta a ponta com Chrome real (ponte MCP + demonstração gravada + tela Conversas)
npm run eval:search -w @orbi/runtime   # acerto da busca de procedimentos
npm run eval:behavior -w @orbi/runtime [cenário]   # comportamento com o modelo real, sempre Haiku 5.5: desenvolvedor simulado, sites falsos, juiz (gasta tokens; precisa de Chrome)
npm run build             # instalador da plataforma atual (gere na plataforma de destino)
```

Um teste só: `cd apps/runtime && node --import tsx --import ./scripts/register-raw.mjs --test test/<arquivo>.test.ts`
Testes de caso de uso (o Flue real com o modelo roteirizado): `test/flow-*.test.ts`, um processo por arquivo,
com a montagem em `test/support/flow.ts`. Cenário novo = arquivo novo; um cenário que deixa revisão
em segundo plano reserva uma resposta para ela e espera (`waitFor`) que a fila esvazie
(`faux.getPendingResponseCount() === 0`) antes de terminar, senão o cenário seguinte do arquivo
perde a resposta dele.
(o `register-raw` é obrigatório: os prompts são importados com `?raw`).

**Teste nunca gasta com modelo caro.** `npm test` e `npm run e2e` usam o modelo roteirizado (zero
tokens). O único que chama o modelo real é o `eval:behavior`, e ele roda sempre no Haiku 5.5,
seja qual for o `.env`. Qualquer teste ou script novo que chame um modelo real segue a mesma regra.

Antes de dar uma mudança por pronta: `npm test` e, se tocou em navegador, gravação,
cofre ou ponte MCP, `npm run e2e`.

## Regras da arquitetura

- **Toda ação que muda algo passa pelo portão** (`agents/gate.ts`, via `ctx.gated`), com
  uma categoria do contexto `trust` (`policy`). Leitura pode ser ferramenta comum. Nunca crie
  uma ferramenta que escreve, publica ou apaga sem o portão. `aprender` sempre pede aprovação.
  Única exceção: `playbook_resolve` (passo 0) guarda, sem cartão, o fato que uma entrada virou
  numa execução, só de um conceito que já existe e do tipo da entrada, com origem e Desfazer
  (documento 18). Não amplie a exceção: conceito, propriedade e procedimento passam pelo cartão.
- **A funcionalidade mora em `use-cases/`** (documento 27): `contexts/<contexto>/use-cases/<nome>.ts`, uma
  função no nome do domínio, só chamadas — sem SQL, sem `valibot`, sem prompt, sem `ctx.`, sem
  tela. Quem chama (a ferramenta, a rota) faz o schema, a moldagem e o falar com o mundo.
  `test/use-cases.test.ts` acusa. Orquestração de três chamadas ou mais é caso de uso; menos que
  isso fica no handler — **salvo quando atravessa dois módulos do contexto e é pedida de fora**,
  que aí mora no contexto de qualquer jeito (`findScriptOfRun`, duas chamadas). E chamar a mesma
  coisa quatro vezes num handler não são quatro chamadas: é uma.
- **Fronteira de contexto** (documento 26, mapa em `docs/modulos.md`): dentro de um contexto os
  módulos se conhecem; entre contextos só passa id em coluna solta, e o acesso é pelo `index.ts`
  do contexto — nunca um arquivo de dentro, nunca chave estrangeira, nunca JOIN. Cada contexto é
  dono das suas tabelas e as declara no seu próprio `migrations.ts`. O teste de fronteira acusa
  import que atravessa.
- **O código não conhece o domínio do usuário.** Nada de CI, GMUD ou portal específico no
  código: isso é aprendido e guardado no cérebro. O código dá capacidades genéricas.
- **O cérebro começa vazio**, sem tipos. Não reintroduza tipos de fábrica; a demo usa
  `EXAMPLE_TYPES` explicitamente.
- **Dentro de um contexto, a mesma separação**: regras puras num arquivo do módulo, SQL num
  `repo.ts`, orquestração num `service.ts`. O `index.ts` do contexto é a única porta, e o
  O `index.ts` do contexto é a única porta, e `services.ts` tem uma entrada por contexto: uma
  chamada diz para onde vai (`procedures.execution.startRun(…)`), e a `needs` de uma capability
  diz quais contextos ela toca.
- **Capacidade declara o que usa.** `defineCapability({ name, needs: ['brain', …], register(ctx, deps) })`
  e uma linha em `agents/capabilities.ts`. Ferramentas não chamam `services()`; recebem `deps`.
- **Regra nova no prompt vai na parte da situação** (`prompts/orbi/*.md` + `PROMPT_PARTS`), não na base;
  se o runtime consegue checar, cheque no runtime em vez de pedir ao modelo.
- **Chat novo = agente novo.** Um `'use agent'` com a sua lista de capacidades e o seu prompt, rota e
  prefixo de conversa em `app.ts` (`routeConversations`). Não ponha `if` de contexto no Orbi das conversas.
  No app, use `components/chat/ChatPanel` e ponha em volta só o que é da tela.
- **Flue só por `agents/runtime-port.ts`.** Nada de `import … from '@flue/runtime'` fora dele (teste acusa).
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
  ambiente do usuário. A única exceção é o shell do desenvolvedor (`terminal/shell.ts`, Git
  Bash no Windows): `run_shell` (uma linha aprovada; o efeito sai do texto, linha nova sempre
  pede) e, no Windows, os programas `.cmd` (npm, mvn), com cada argumento entre aspas simples.
  Outra: o **servidor MCP por comando** (documento 20), cadastrado pelo desenvolvedor. Roda sem
  shell, só com as variáveis que ele declarou (credencial só por `{{segredo:nome}}`), na pasta
  `dados/mcp/<id>`, e só com o comando aprovado na tela (hash de programa, argumentos e
  ambiente); comando mudado espera nova aprovação e suas ferramentas saem do agente.
- Nunca peça nem cole chaves de API; elas ficam em `apps/runtime/.env` (ignorado pelo git).
- Credencial que o Orbi precisa é pedida com `ask_secret`: o cartão grava direto no cofre
  (`POST /api/inbox/:id/secret`) e o modelo recebe só a referência. Nunca leve um valor
  digitado pelo usuário para a conversa.
- **Agentes de código (MCP)** entram por `/mcp` com token próprio (só o hash fica no banco).
  Eles nunca aprovam, nunca veem credenciais e nunca gravam no cérebro: `orbi_teach` vira
  sugestão, e só o desenvolvedor aceita (`/api/agents/suggestions/:id/accept`). Rodar
  esteiras e pular perguntas de passagem são permissões desligadas por padrão.
- **Autonomia que cresce**: dentro de um procedimento, o portão decide pelo nível (N1–N3,
  o módulo `levels` de `trust`) e pela ação já ser conhecida. Apagar nunca roda sozinho, a não
  ser no N3 posto pelo desenvolvedor com a ação conhecida. Subir e descer é do runtime
  (`settleRun`), nunca do modelo, e sempre avisa (cartão e Pendências, com Manter).
- **Revisão no fim da execução** (`review/review.ts`): o nível só muda quando o turno
  termina (todas as falhas já chegaram, inclusive de chamadas em paralelo). Autonomia antes de
  perfeição: o juiz (módulo `judge` de `improvement`, regras puras) decide o que vira pedido ao modelo:
  mudar só os passos com problema (o `brain_learn` recusa mexer fora do escopo), aprender um
  problema novo, ou propor corrigir o ambiente de um problema recorrente; melhoria que não muda
  resultado nem autonomia vira ideia guardada, sem cartão. O revisor de conhecimento
  (`agents/revisor.ts`) lê as saídas já limpas de credenciais e só propõe fatos, que passam pelo
  cartão de aprendizado (documento 19). Fato que o cérebro já tem não volta (mesmo id ou mesmo
  nome com outro id é recusado no `brain_learn`), aprender soma propriedades em vez de trocar a
  entidade, e o passo que achou o fato muda, no mesmo cartão, para consultar o Cérebro antes
  (documento 22).
- **Diagnóstico** (`diagnosis/`, documento 24): defeito do Orbi e chamada errada do modelo ficam
  fora da revisão do procedimento, e um achado deles nunca vira mudança no procedimento do
  desenvolvedor. A issue para o repositório do Orbi sai só com o clique do desenvolvedor, com o
  texto à vista, e os nomes dele (procedimento, passo, arquivo, site) trocados por apelido:
  nunca mande para fora nada que ele escreveu ou abriu. O cérebro é o que o Orbi sabe do domínio dele; o que o Orbi sabe de si mesmo
  mora em `diagnosis/`.
- **Procedimento provado** (`playbook_proofs`, documento 25): um passo está provado enquanto a
  instrução que rodou ainda é a que ele tem, então mudar o texto do passo tira a prova sozinho.
  Não crie um campo "provado" a marcar à mão, e não bloqueie a execução de um rascunho: o que
  leva o Orbi a provar é a resposta do `brain_learn` e a skill.
- **Registro da execução** (`run_calls`, documento 24): guarda o que cada chamada fez, nunca o
  que ela devolveu. Só tamanho, duração, passo, aprovação, marcas, a primeira linha do erro e um
  resumo curto dos argumentos, que são os que o modelo escreveu (credencial só aparece como
  `{{segredo:nome}}`). Não ponha conteúdo de resposta, de página nem de arquivo nessa tabela.
- **Esteiras**: o motor (módulo `pipelines` de `procedures`) decide ramo, dados e passagem, nunca o
  modelo. Passagem "perguntar" só segue sem o desenvolvedor com destino dado por ele
  ou com a permissão do agente.

## Armadilhas conhecidas

- **Chat por long-poll** (`useFlueAgent({ live: 'long-poll' })` em `ChatPanel`): com SSE, o
  `@durable-streams/client` reconecta sem fechar a conexão velha e o app trava ao esgotar as 6
  conexões do navegador. Não volte para SSE sem rodar o e2e da tela (ele acusa conexão presa).
- **Pi fixado em 1.1.0** (`overrides` na raiz): o Flue 2.3 quebra com o Pi 1.2+. Não atualize
  `@earendil-works/pi-ai` nem `pi-agent-core` sem testar o caso de uso inteiro.
- **`@orbi/contracts` e `@orbi/plugin-sdk` não podem estar nas dependências do runtime**: o
  `@flue/vite` externaliza toda dependência declarada, e o Node não roda `.ts` de
  `node_modules`. Sem declarar, eles entram no bundle.
- **O agente é refeito a cada turno** (Flue): instruções, ferramentas e skills são
  recalculadas. Mudanças no catálogo de skills viram sinais na conversa; mantenha o catálogo
  estável (só os mais usados, em ordem fixa).
- **Semicolons** quebram mensagens em diagramas Mermaid de sequência. Use vírgula.
- O app empacotado só se gera na plataforma de destino (o `.exe` sai do GitHub Actions, `app-windows.yml`).
- **Diferenças de sistema operacional ficam no contexto `platform`** (`contexts/platform/os/`, uma
  implementação por sistema): não teste `process.platform` fora dali.

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
