# 26 · Monolito modular: contextos com interface própria

## O problema

Entender ou mudar uma funcionalidade custa muita leitura de código. A hipótese era falta de
modularização. A medição mostrou outra coisa.

`apps/runtime/src` tem cerca de 15 mil linhas em 26 pastas, já organizadas por assunto. O
`services.ts` tem 26 entradas, cada uma uma classe de uma pasta, e o `compose.ts` é a raiz de
composição: a aplicação **já tem a forma** de um monolito modular. O que falta é fronteira
declarada. Só 6 das 26 pastas têm `index.ts`, e por isso "onde isso é usado" se responde com
busca em arquivo profundo em vez de leitura de uma interface.

E a travessia tem um padrão claro. Onde existe fachada, ela se sustenta: `brain/repo` e
`brain/services` não têm **nenhum** import de fora de `brain/`. Todo o vazamento é por
`brain/domain`, e nele `levels.ts` é importado por 7 pastas, `run-calls.ts` por 5 e `types.ts`
por 4 (só tipo) — os outros 11 arquivos têm de um a três consumidores, isto é, já pertencem a
um dono só.

A segunda parte do custo não é falta de módulo: é a fatia vertical. A funcionalidade de
diagnóstico, escrita de propósito como uma pasta, toca 31 arquivos em 5 camadas e 2 apps,
porque toda funcionalidade paga o mesmo pedágio: migração, repo, domínio, serviço, ferramenta,
rota, contrato, tela.

## A decisão

Dois níveis, não um:

- **Contexto** — uma pergunta que a aplicação responde. Tem `index.ts`, `migrations.ts` e é
  dono das suas tabelas.
- **Módulo** — uma parte da resposta, dentro de um contexto, com `src/` próprio.

A regra de independência vale **entre contextos**, não entre módulos:

- dentro de um contexto, os módulos compartilham tabelas, podem ter chave estrangeira entre
  elas e fazer JOIN;
- entre contextos, só passa id em coluna solta — nunca chave estrangeira, nunca JOIN, nunca ler
  a tabela do vizinho. Precisa do dado, pede pelo `index.ts`;
- o `index.ts` é do contexto: nem um módulo irmão de outro contexto alcança o de dentro;
- uma tabela aparece em um `migrations.ts` só.

O mapa dos contextos, com o que cada módulo faz e a interface pública de cada um, fica em
`docs/modulos.md` e é atualizado no mesmo commit de qualquer mudança de estrutura.

### Por que id atravessando é aceitável

Três identificadores circulam entre contextos: `conversation_id` (em 11 tabelas), `run_id`
(em 6) e `playbook` (em 6). Guardar `run_id TEXT` é como guardar um id que veio de uma API;
guardar `run_id REFERENCES playbook_runs(id)` é o banco obrigando os dois a existirem juntos.
O primeiro é a identidade pública do contexto, o segundo é o acoplamento que a regra proíbe.

### O schema já está quase limpo

Chave estrangeira declarada entre tabelas: **uma só**, `entities.type REFERENCES types(name)`,
e as duas são do mesmo contexto. JOIN: cinco, dos quais três são FTS com a própria tabela e um
é entre duas tabelas do mesmo contexto. Sobram três violações de verdade:

| Violação | Onde | Conserto |
|---|---|---|
| `usage` faz JOIN em `conversations` só para o título | `observability/usage.ts:92` | guardar o título ou pedir pela fachada de `conversa` |
| `conversations.ts` lê e escreve `agent_requests`, `followups` e `inbox_items` | `conversations/conversations.ts` | pedir por id a quem é dono |
| ~~`settings` é escrita por 5 módulos em SQL cru~~ **resolvida na fase 2** | `autonomy/policy`, `diagnosis/settings`, `models/cost`, `models/roles`, `voice/model` | `platform` virou dona; os cinco recebem `Preferences` |

E dois repos atravessam dois assuntos hoje: `brain/repo/playbooks.ts` (dono de `playbooks` e
`playbook_runs`) e `brain/repo/levels.ts` (tabelas da autonomia morando dentro do cérebro).

### Decisões que a medição resolveu

- **`procedimentos` e `execucao` são o mesmo contexto.** O mesmo repo já é dono das duas
  tabelas e `run_id` com `playbook` cruzam o tempo todo. São dois módulos lado a lado.
- **`confianca` é contexto separado.** Suas tabelas (`autonomy_events`,
  `playbook_known_actions`) têm a coluna `playbook`, mas só como id: nenhuma leitura de
  procedimento. Sai de dentro do cérebro.
- **`melhoria` junta revisão e diagnóstico.** As duas respondem "o que deu errado e como
  melhora", e `review_notes` com `diagnoses` têm as mesmas colunas de referência.
- **`voz` fica em `conversa`.** É um canal de entrada do desenvolvedor; o modelo local de
  transcrição é detalhe de implementação dela.
- **`appDataHome` sai de `llm/plugins.ts` para `platform`.** É caminho por sistema operacional,
  não assunto de modelo. `pluginDirs` fica em `models`: onde os plugins de modelo moram é
  assunto dele, e ele pede o caminho a `platform`.
- **`modeloDoTurno` fica em `modelos`.** O que varia é o modelo, e quem sabe o custo é esse
  contexto.

## O que mantém a fronteira de pé

Um teste de fronteira, no espírito do `contract-check.ts` e do teste que afirma quem lê
`services()`: ele varre os imports e falha quando um contexto alcança arquivo interno de outro,
quando uma migração declara tabela de outro contexto, e quando um `index.ts` reexporta um
arquivo de dentro de outro contexto. Sem esse teste, a pasta nova vaza em três sessões — e com
ele, a regra fica legível no próprio código, inclusive para o Orbi lendo a si mesmo.

## O combinado

A estrutura só continua útil se o desenvolvedor continuar fluente nela. Então, antes de cada
funcionalidade nova, vem o combinado — onde entra, o que muda na interface pública, o que muda
nos dados, e se os módulos precisam ser repensados. A regra está no `CLAUDE.md`, seção
"Combinado antes de cada funcionalidade", e usa a árvore de `docs/modulos.md`.

Isso tem um efeito de projeto, não só de comunicação: a pergunta "precisa repensar os módulos?"
feita a cada funcionalidade é o que faz a divisão evoluir junto com a aplicação, em vez de
envelhecer.

## Migração

Incremental, um contexto por vez, com o teste de fronteira entrando na fase 1 e apertando a
cada fase. Nada de mover tudo de uma vez.

**Fase 1 — piloto: `models`. Feita.** Era o contexto mais limpo que existia: 989 linhas e 18
imports de fora, todos de composição, rota ou agente, e nenhuma funcionalidade dependendo das
entranhas dele. `llm/` virou `src/contexts/models/` com cinco módulos — `provider`, `plugins`,
`roles`, `cost`, `setup` —, `index.ts` como única porta, `http/routes/model.ts` virou
`contexts/models/http.ts` e `test/boundary.test.ts` passou a guardar a fronteira.

Três coisas que a fase 1 ensinou e que valem para as próximas:

- **Apareceu um módulo que o mapa não previa.** `llm/setup.ts` responde "como o desenvolvedor
  escolhe, testa e aplica um provedor", que é outra pergunta que a de `provider` ("qual provedor
  está ativo"). Virou `setup`. É o critério do combinado funcionando na primeira vez que foi usado.
- **A fronteira obrigou uma inversão.** `configureLlm` chamava `setProvider` de
  `agents/runtime-port.ts` — o contexto chamando a composição. Agora devolve o provedor em
  `ActiveLlm.provider` e o `compose.ts` registra.
- **O teste de fronteira precisa de uma lista de exceções, e ela é o placar.** `models` ainda
  alcança `platform/`, `settings/` e `terminal/`, que só viram contexto nas fases 2 e 5.
  A lista `AINDA_FORA` em `test/boundary.test.ts` declara isso por contexto e só pode encurtar.

Sobre profundidade: o nível `modules/` que o esboço tinha foi cortado. Um módulo é
`contexts/<contexto>/<modulo>/src/`, e os arquivos do contexto (`index.ts`, `http.ts`,
`migrations.ts`) ficam na raiz dele — o que já distingue os dois níveis sem uma pasta a mais.

**Fase 2 — `platform` e `secrets`. Feita.** `platform/` e `settings/` viraram
`src/contexts/platform/` com três módulos — `os`, `env` e `preferences` —, e `vault/` virou
`src/contexts/secrets/` (um módulo só, código plano em `src/`, rota em `http.ts`).

`platform` é dona da tabela `settings`, e a violação dos cinco módulos escrevendo nela em SQL
cru acabou: `PolicyStore`, `VoiceModel`, `ModelRoles`, `ModelTiers` e `DiagnosisSettings`
recebem `Preferences` no construtor e nenhum deles depende mais do banco. `appDataHome` saiu de
`models/plugins` para `platform/os`, que é onde mora caminho por sistema operacional.

O que a fase 2 ensinou:

- **O teste de fronteira precisava de duas listas, não uma.** `services.ts` e `http/errors.ts`
  não são estrutura antiga: são o contrato da composição com que toda rota de contexto conversa.
  Viraram `SEMPRE_PERMITIDO`, separado de `AINDA_FORA`, e essa lista não cresce sem discussão.
  E entrou um teste a mais: todo contexto migrado tem de estar declarado em `AINDA_FORA`, mesmo
  com lista vazia — assim um contexto novo não entra sem declarar o que ainda alcança.
- **`db/` não é de `platform`.** O mapa dizia que era, e estava errado: `db/` roda as migrações
  de todos os contextos, e quem faz isso é composição. `platform` ficou com sistema operacional,
  `.env` e `settings`.
- **A promessa do `migrations.ts` por contexto ganhou ressalva.** O runner conta por índice
  (`PRAGMA user_version`), então mover uma migração que já rodou quebra o banco de quem já
  atualizou. `db/migrations.ts` fica como cadeia congelada e o arquivo do contexto vale de agora
  em diante. O mecanismo de concatenação entra com o primeiro contexto que precisar de tabela
  nova — máquina sem usuário é dívida.

**Fase 3 — `improvement`. Feita.** `review/` e `diagnosis/` viraram
`src/contexts/improvement/` com quatro módulos — `review`, `judge`, `diagnosis` e `report` —,
`index.ts` como única porta e `http/routes/diagnoses.ts` como `http.ts` do contexto.

Três decisões de escopo, cada uma com o seu motivo:

- **`review_notes` fica no cérebro até a fase 4.** A classe `Review` recebe o próprio
  `BrainStore` no construtor e é exposta como `brain.review`, usada por `agents/tools/brain.ts`
  e por uma rota. Arrancar isso agora seria a repartição do cérebro antecipada e mal feita.
  `improvement` nasce dono de `diagnoses` e `diagnosis_reports`.
- **`brain/domain/review.ts` se dividiu.** `pipelineConfigProblems` e `asksAlways` são validação
  de esteira, usadas por `brain/store.ts` e `brain/services/pipelineDefs.ts`, e ficaram no
  cérebro. `stepClaimProblems`, `inlineScriptSuggestions`, `showSuggestions` e
  `defaultSuggestions` só a revisão usa, e foram para `judge/src/suggestions.ts`.
- **`retrospectiva` não virou módulo.** São 33 linhas e respondem a mesma pergunta que `review`,
  então viraram um arquivo dentro dela. O mapa dizia cinco módulos; são quatro.

Mais uma correção no mapa: **os agentes `revisor` e `diagnosticador` ficam na composição.** São
adaptadores finos (54 e 34 linhas) que registram o agente no Flue e chamam o contexto, e a regra
"chat novo = agente novo" já os coloca em `agents/`.

E um detalhe sobre teste: um teste de unidade pode alcançar o arquivo do módulo direto
(`improvement/report/src/issue.ts` para testar `anonymize`), porque o teste de fronteira guarda
`src/`, não `test/`. Assim a interface pública não precisa crescer para acomodar teste.

**Fase 4a — `language/` e `trust`. Feita.** A base da repartição do cérebro.

`brain/domain/types.ts` virou `src/language/types.ts` e o vocabulário de autonomia
(`Level`, `LevelBy`, `Effect`, `LEVEL_NAMES`, `RunAction`, `Deviation`, `LevelState`,
`LevelChange`) saiu de `brain/domain/levels.ts` para `src/language/levels.ts`. A linguagem tem
só tipos e constantes, sem estado e sem banco: qualquer contexto a importa e ela não importa
nenhum, e por isso entrou em `SEMPRE_PERMITIDO` no teste de fronteira.

As **regras** que usam esse vocabulário ficaram no contexto a que pertencem:
`src/contexts/trust/` com dois módulos, `levels` (regras puras, repo e serviço) e `policy`
(o que o desenvolvedor permite por assunto), mais a rota `/api/autonomy` em `http.ts`.

O que a fase 4a ensinou:

- **O `AutonomyService` criaria um ciclo, e a porta estreita resolveu.** O nível é uma coluna do
  procedimento: `trust` decide, `procedures` guarda. Ele recebia o `BrainStore` inteiro — e
  **nem usava**: só precisava de três operações. Agora recebe `ProcedureStore`
  (`get`, `setLevel`, `run`), e a dependência é de mão única. Medir antes de mover mostrou que a
  dependência declarada era maior que a real.
- **Nem toda função pura vai para a linguagem.** `decideAction`, `settleLevel`, `isCallError` e
  `fingerprintWith` são puras, mas são **política** — ficam em `trust`. A linguagem leva a
  palavra, não a regra. Senão `language/` vira o novo depósito, com outro nome.
- **Mais duas correções no mapa.** O `portão` (`agents/gate.ts`) não é módulo de `trust`: é
  capability do Flue, adaptador fino como os agentes da fase 3, e fica na composição. E
  `aprovação` (`inbox/approval.ts`, 23 linhas) é handler da caixa de entrada, e vai para
  `conversa` na fase 5. `trust` tem dois módulos, não quatro.

**Fase 4b — `knowledge`, `procedures` e `learning`. Feita.** A pasta `brain/` não existe mais.

`knowledge` é o **contexto folha**: quatro módulos (`ontology`, `facts`, `search`, `problems`),
dono de `types`, `entities` e `edges`, e **não importa contexto nenhum**. `procedures` é o maior,
com seis módulos (`definition`, `rehearsal`, `execution`, `proofs`, `learnings`, `pipelines`) e
sete tabelas. `learning` é o contexto 11, aprovado fora do mapa original: dono de `proposals` e
da garantia do lote. `improvement` ganhou `review_notes`, a dívida que a fase 3 deixou.

**O dono da transação.** `learn()` grava tipo, fato, ligação, esteira e procedimento numa
transação só, tudo ou nada (documento 22), e isso atravessa dois contextos. Agora `learning`
recebe portas dos dois vizinhos e envolve as cinco operações numa transação: a garantia tem
nome e lugar, em vez de estar implícita no `BrainStore`.

**O agregado, que é dívida declarada.** Medi antes de decidir: são cerca de **400 chamadas
`brain.x` em 74 arquivos**. Trocar todas num commit é irrevisável, então o `BrainStore` não
morreu — virou `src/brain.ts`, um agregado da composição que liga os contextos, guarda as duas
leituras que atravessam contexto de propósito (`stats` e `exportMarkdown`) e oferece atalhos de
uma linha. Os atalhos vão sendo trocados pela chamada ao contexto conforme cada arquivo é tocado
por outro motivo. Código novo pede ao contexto. Isso está escrito no docblock da classe, em
`docs/modulos.md` e aqui, porque dívida sem nome vira arquitetura por acidente.

O que a fase 4b ensinou:

- **O grafo de dependências é um DAG, e isso só apareceu medindo.** A leitura de cada serviço
  mostrou que `knowledge` não precisa de ninguém, que só `trust → procedures` precisava de porta
  (feita na 4a) e que o resto é de mão única. Pelas assinaturas, parecia tudo entrelaçado.
- **Porta estreita para a exceção do passo 0.** A execução grava um fato no `knowledge`
  (documento 22). Em vez de entregar `GraphRepo` para `procedures`, `knowledge` abriu
  `FactsForRun`: oito operações, com o motivo escrito. A permissão ficou nomeada e limitada, em
  vez de ser um repositório solto atravessando a fronteira.
- **A porta escondeu um padrão, e o teste pegou.** `Facts.search` aplica `ftsQuery` antes de
  chamar o repositório, e a primeira versão de `FactsForRun.search` chamava o repositório direto:
  o texto cru de um erro com a palavra `fts5` virou `no such column: fts5` e sete testes de fluxo
  caíram. A lição: ao extrair uma porta, o padrão que o serviço aplicava tem de ir com ela.
- **Dois `inputProblems` no mesmo contexto.** Um de esteira, outro de procedimento — o `export *`
  do `index.ts` acusou a ambiguidade, e o de esteira virou `pipelineInputProblems`. A fronteira
  encontrou um nome ruim que a estrutura antiga escondia.
- **O motor da esteira importava o agregado.** `pipelines/engine.ts` recebia o `BrainStore`
  inteiro; agora recebe a porta `EngineStore`, com as seis operações que usa.
- **A lista `SEMPRE_PERMITIDO` cresceu uma vez, com motivo**: entraram `db/database.ts`,
  `db/rows.ts` e `http/routes/types.ts`. São a conexão, os ajudantes de linha e o formato da API
  — encanamento que todo contexto usa, não funcionalidade de um vizinho.

**Fase 5 — `talk`, `tools`, `telemetry`. Feita. A migração terminou.** `src/contexts/` passou a
ser toda a funcionalidade, e a lista `AINDA_FORA` do teste de fronteira **está vazia**: nenhum
contexto alcança a estrutura antiga, porque não há mais estrutura antiga.

`talk` com quatro módulos (`conversations`, `inbox`, `followups`, `voice`), `tools` com cinco
(`terminal`, `browser`, `mcp-client`, `code-agents`, `commands`) e `telemetry` com um só.

**As duas violações de schema que sobravam, consertadas:**

- `conversations.delete` fazia `UPDATE agent_requests`, tabela do servidor MCP. Agora
  `Conversations` aceita ganchos `DeleteHook`, e a composição registra o de quem é dono: o gancho
  roda dentro da mesma transação, então o comportamento não mudou e a fronteira fechou.
- O relatório de uso fazia `usage LEFT JOIN conversations` só para mostrar o título. `UsageStore`
  recebe a porta `TitleOf` e junta em memória. Custa N buscas no lugar de um join, e N é o
  tamanho de uma lista na tela.

Mais três violações que só apareceram quando a fronteira fechou:

- **Dois contextos importavam o agregado `brain.ts`.** O agendador de followups (que só queria o
  nome do procedimento de uma execução) e o executor de comandos (que queria problema conhecido,
  anotar a tentativa e saber se há execução aberta). Viraram as portas `RunLookup` e
  `CommandMemory`.
- **Uma rota importava o `compose.ts`** para o tipo `Background`, de que usava um método. Virou
  uma `interface` local de uma linha.
- **`agents/tools/shell-setup.ts` era usado pela caixa de entrada.** O caminho do shell é assunto
  de `tools`, não um utilitário de agente: virou `tools/terminal/src/shell-path.ts`, e tanto o
  agente quanto a caixa pedem pelo `index.ts`.

**O teste de fronteira ficou com sete verificações**, e a última é nova: **cada uma das 28 tabelas
tem um dono só**. Ele falha se duas pastas tocarem a mesma tabela. Isso transforma a regra de
schema deste documento em algo executável, em vez de uma combinação que alguém precisa lembrar.

**A lista `SEMPRE_PERMITIDO` ficou com onze itens, cada um com o motivo escrito ao lado**:
`language/`, `services.ts`, `config.ts`, `version.ts`, `events.ts`, `db/database.ts`,
`db/rows.ts`, `http/errors.ts`, `http/routes/types.ts`, `agents/runtime-port.ts` e
`agents/directory.ts`. São contrato e encanamento — nada que um contexto possa chamar de seu.

## Onde isto termina, e o que fica aberto

Onze contextos, cada um com `index.ts` e dono das suas tabelas. Fica aberto, de propósito:

- **Os atalhos do `src/brain.ts`**: cerca de 400 chamadas `brain.x` em 74 arquivos, trocadas
  conforme cada arquivo é tocado. Código novo pede ao contexto.
- **A fase 6, o contrato com o desktop**, que continua sendo a escolha entre quebrar
  `packages/contracts/src/api.ts` por contexto e levar a fatia vertical até a tela. Agora há
  informação para decidir: a fronteira do runtime fechou sem precisar mexer no app.

**Fase 6 — contrato com o desktop.** Não feita. `packages/contracts/src/api.ts` tem 439 linhas e
é o acoplamento mais caro: cada funcionalidade nova mexe nele e no `apps/desktop/src/api.ts`.
Duas saídas:

- **conservadora**: quebrar o contrato em um arquivo por contexto, com o `index.ts`
  reexportando. Resolve a legibilidade e mantém o pacote compartilhado;
- **fatia vertical**: o contexto passa a ser dono de `runtime/ + contrato/ + ui/`, e o desktop
  importa a tela de dentro do contexto. Resolve o pedágio das camadas, mas mexe no build do
  Tauri, no bundler e nos 162 arquivos do app.

A recomendação é a conservadora primeiro, e a fatia vertical só se, com dois ou três contextos
migrados, atravessar camada continuar custando caro.
