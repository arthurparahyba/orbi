# Mapa dos módulos

Este é o mapa que o desenvolvedor e o Claude leem antes de cada funcionalidade nova. Ele diz
quais contextos existem, o que cada módulo faz, qual é a interface pública de cada contexto e
quem é dono de cada tabela. Mudou a estrutura, atualize este arquivo no mesmo commit.

A decisão que gerou este mapa, com as medições e o que cada fase ensinou, está no documento 26
(`funcionalidades/26-monolito-modular.md`). **A migração terminou:** os doze contextos existem,
`src/contexts/` é toda a funcionalidade, e a lista de exceções do teste de fronteira está vazia.

**Nome e caminho.** A convenção do projeto é código e nomes em inglês, documentação em
português — e **toda referência a código aqui usa o nome como ele está escrito no código**:
`procedures`, `roles`, `startProcedure`. A explicação em volta é em português; o nome, não.

## A regra

A aplicação é um monolito modular em dois níveis: **contexto** (uma pergunta que a aplicação
responde) e **módulo** (uma parte da resposta).

- **Dentro de um contexto** os módulos se conhecem: compartilham tabelas, podem ter chave
  estrangeira entre elas e fazer JOIN.
- **Entre contextos** só passa id em coluna solta. Nunca chave estrangeira, nunca JOIN, nunca
  ler a tabela do outro. Precisa de dado do vizinho, pede pelo `index.ts` dele.
- **O `index.ts` é do contexto, não do módulo.** Quem está fora enxerga o contexto e nada mais;
  nem um módulo irmão de outro contexto alcança o de dentro.
- **Cada contexto é dono das suas tabelas**, e isso responde "onde isso é guardado" sem busca.
  O `migrations.ts` do contexto vale **de agora em diante**: o runner conta as migrações por
  índice (`PRAGMA user_version`), então `db/migrations.ts` continua sendo a cadeia histórica
  congelada, e as novas de cada contexto são concatenadas no fim, numa ordem de contextos
  declarada em um lugar só. Esse mecanismo entra junto com o primeiro contexto que precisar de
  tabela nova.

Os três identificadores que circulam entre contextos são `conversation_id`, `run_id` e
`playbook`. Carregar o id é livre; amarrar com chave estrangeira não.

**Cada uma das 28 tabelas tem um dono só**, e `test/boundary.test.ts` falha se duas pastas
tocarem a mesma. Quando um contexto precisa de algo do vizinho, ele recebe uma **porta**: um
`interface` com as poucas operações que usa, declarado do lado de quem precisa e implementado por
quem é dono. As que existem hoje: `FactsForRun` (`knowledge` → quem executa, para o passo 0),
`ProcedureStore` (`trust` → `procedures`, para o nível), `CommandMemory` (`tools` → o que sabe de
problemas conhecidos), `EngineStore` (o motor da esteira), `DeleteHook` (`talk` → quem referencia
uma conversa), `TitleOf` (`telemetry` → `talk`) e `NotesDeps` (`improvement`).

**A funcionalidade de cada contexto está escrita em chamadas** em
`contexts/<contexto>/use-cases/` (documento 27): um arquivo por funcionalidade, uma função que
recebe o pedido, chama os vizinhos pela porta deles e devolve o que aconteceu — sem SQL, sem
schema de ferramenta, sem texto de prompt, e sem falar com a conversa ou com a tela. É esse o
código para ler quando a pergunta é "como funciona X": o índice de cada contexto está na sua
seção, abaixo. `test/use-cases.test.ts` guarda as cinco regras (a quinta: a pasta não exporta
ajudante — tudo que ela exporta tem o nome no `index.ts`). Contexto cuja funcionalidade *é* uma
chamada não tem a camada: a regra é "existe caso de uso onde existe orquestração".

**A linguagem compartilhada** fica em `src/language/` (fase 4a): as palavras que todo contexto
usa para falar das mesmas coisas — `Entity`, `Playbook`, `PlaybookRun`, `StepStatus`, `Level`,
`Effect`, `Proposal`. Só tipos e constantes, sem estado e sem banco, então qualquer contexto a
importa e ela não importa nenhum. As **regras** que usam essas palavras ficam no contexto a que
pertencem: `decideAction` é de `confiança`, não da linguagem.

## Contextos

### `knowledge` — o que o Orbi sabe

**Migrado** (fase 4b): `src/contexts/knowledge/`, com `index.ts` e a rota em `http.ts`.
É o contexto folha: **não importa contexto nenhum.**

| Módulo | O que faz |
|---|---|
| `domains` | o assunto em que cada coisa foi aprendida, e as pontes entre domínios (documento 28) |
| `ontology` | os tipos que o desenvolvedor ensinou e o que cada um pode se ligar a quê |
| `facts` | entidades e ligações; decide se um fato novo já existe (veredictos `known`/`update`/`same`/`new`) |
| `search` | índice FTS5 sobre entidades e procedimentos; o mínimo é travado por `eval:search` |
| `problems` | fatos do tipo problema, casados com o texto de um erro |

Interface pública: `Facts`, `GraphRepo`, `OntologyRepo`, `factsForRun`, `entityProblems`,
`edgeProblems`, `findGaps`, `isTypeName`, `EXAMPLE_TYPES`, `classifyEntity`, `mergeEntity`,
`compact`, `verdictLine`, `ftsQuery`, `sharedStems`, `stem`, `words`, `asKnownProblem`,
`knownProblemsFor`, `errorTail`, `knowledgeSuggestions`, `problemsIn`, `recurrence`,
`brainRoutes`, e os tipos `Candidate`, `FactVerdict`, `FactsForRun`, `KnownProblem`.

**`FactsForRun`** é a porta estreita por onde um procedimento em execução lê fatos e, no passo 0,
grava um (documento 22). Quem executa nunca segura os repositórios deste contexto.

As propostas que esperam aprovação **não são deste contexto**: são do `aprendizado`, porque um
lote atravessa `conhecimento` e `procedimentos` numa transação só.

**Casos de uso** (`use-cases/`, documento 27):

| Caso de uso | O que faz |
|---|---|
| `entityPanel` | o painel de uma entidade: ela, com quem se liga, o que está a dois passos, e quem depende dela |
| `suggestDomain` | para qual domínio vai o que está sendo aprendido, e por quê: o tipo ganha da execução, tipo espalhado é comum, empate não decide |
| `domainOverview` | a primeira tela do Cérebro: os domínios, o tamanho de cada um, quem empresta para quem, e o que ficou sem domínio |
| `domainDetail` | um domínio aberto: vocabulário, fatos, playbooks que nasceram nele, e as pontes |
| `howToRefresh` | como conferir um fato na fonte: qual procedimento roda, e desde quando ninguém confere |

O resto da tela do Cérebro é uma checagem e uma chamada (editar, apagar, buscar). As quatro
funcionalidades de procedimento que a tela usa moram em `procedures` e `trust`, não aqui: a rota
`brainRoutes` é só quem atende por HTTP.

Tabelas: `types`, `entities`, `edges`, `domains`. As colunas `domain` de `entities` e de
`types` são deste contexto; a de `playbooks` é de `procedures`, e `knowledge` só a alcança pela
porta `ProceduresByDomain` (documento 28).

### `procedures` — o que ele sabe fazer, e o que está fazendo

**Migrado** (fase 4b): `src/contexts/procedures/`, com `index.ts` e as rotas em
`pipelines-http.ts` e `learnings-http.ts`. É o maior contexto, e o único com seis módulos.

| Módulo | O que faz |
|---|---|
| `definition` | o procedimento, seus passos, scripts, entradas, saídas e variações |
| `rehearsal` | a execução de teste que prova o procedimento antes de valer |
| `execution` | a execução de verdade: passos, passo 0 (resolver entradas), registro das chamadas, desvios |
| `proofs` | qual passo já rodou como está escrito; a prova cai quando o texto do passo muda |
| `learnings` | o que cada passo já tentou, e como foi |
| `pipelines` | procedimentos em sequência e o motor que decide a próxima etapa |

Interface pública: `Procedures`, `PlaybookRepo`, `Execution`, `RunCallRepo`, `ProofRepo`,
`StepLearningRepo`, `PipelineDefs`, `PipelineRepo`, mais as regras puras de cada módulo
(`playbooks`, `scripts`, `concepts`, `rehearsal`, `run-calls`, `proofs`, `learnings`,
`pipelines`, `config`, `engine`, `runs`) e as rotas `pipelineRoutes`, `pipelineRunRoutes`,
`stepLearningRoutes`.

**Casos de uso** (`use-cases/`, documento 27) — é aqui que se lê como cada funcionalidade funciona:

| Caso de uso | O que faz |
|---|---|
| `findSimilarProcedures` | "já sei algo parecido?": os candidatos ao pedido, com as variações de cada um e o porquê de ele ter vindo |
| `startProcedure` | acha o procedimento, confere a ordem na esteira, abre a execução, e devolve o passo 0, o que já se tentou e o estado da prova — ou a recusa |
| `resolveStepInput` | passo 0: registra o que uma entrada acabou sendo, preenche as citações dos passos e diz o que ainda falta resolver |
| `reportStep` | o andamento de um passo; recusa o passo dado como feito cuja ferramenta falhou, e o "esperando" sem nada esperando |
| `findScriptOfRun` | o script do procedimento que está rodando nesta conversa, pelo nome |
| `startPipeline` | começa uma esteira; na recusa, devolve as entradas que ela declara, para o modelo saber o que perguntar |
| `pipelineFixBrief` | o briefing para o Orbi revisar uma esteira cuja configuração impede o dado de andar |
| `setProcedureAutonomy` | muda se o procedimento observa ou age, e em que nível (atravessa `trust`) |
| `procedureProofs` / `procedureProofState` | onde cada procedimento está em termos de prova, com a linha que a tela mostra |
| `waiveStepProof` / `unwaiveStepProof` | "não provar este passo agora" (um deploy em produção), e o desfazer |
| `runTranscript` | o que uma execução fez, chamada por chamada, como texto corrido |
| `staleInputsOfRun` | os fatos que esta execução usou e que sabem se conferir na fonte — o que um passo que falhou pode reconferir |

`startPipeline` serve a ferramenta do chat **e** a rota `POST /api/pipelines/:name/start` — é o
retorno concreto da camada: um caminho só, não dois.

O mesmo corte vale fora do runtime: `packages/contracts/src/api/<contexto>.ts` tem os tipos que a
tela lê de cada contexto, e `apps/desktop/src/api/<contexto>.ts` os métodos que ela chama. Uma
funcionalidade nova mexe nos três arquivos do mesmo contexto, e em nenhum arquivo de outro.

Quatro contextos não têm `use-cases/`, e não é falta: `learning` tem a garantia da transação como
razão de existir (`Learning.learn` é o fluxo, e é um só), `secrets`, `telemetry` e `platform`
respondem cada rota com uma chamada — abrir uma pasta de casos de uso ali seria uma camada vazia.

Lê `knowledge` pela porta `FactsForRun` e pede o nível a `trust`; nenhum dos dois alcança aqui.
O motor da esteira recebe a porta `EngineStore`, com as seis operações que usa.

Tabelas: `playbooks`, `playbook_runs`, `run_calls`, `playbook_proofs`, `playbook_learnings`,
`pipelines`, `pipeline_runs`.

### `trust` — o que ele pode fazer sozinho

**Migrado** (fase 4a): `src/contexts/trust/`, com `index.ts` e a rota em `http.ts`.

| Módulo | O que faz |
|---|---|
| `levels` | o nível em que o procedimento está, como ele sobe e desce, e as ações que ele já conhece |
| `policy` | o que o desenvolvedor permite por assunto, e o efeito que cada ação tem |

Interface pública: `Autonomy`, `LevelRepo`, `levelState`, `decideAction`, `askReason`,
`settleLevel`, `levelAfterEdit`, `runDeviations`, `activeDeviations`, `workedAround`, `stepUses`,
`isCallError`, `fingerprintWith`, `defaultFingerprint`, `decide`, `effectOfCategory`, `levelOf`,
`parsePolicy`, `commandEffect`, `commandCategory`, `codeFixCategory`, `browserCategory`,
`DEFAULT_POLICY`, `PolicyStore`, `autonomyRoutes`, e os tipos `Category`, `AutonomyLevel`,
`AutonomyPolicy`, `AutonomyEvent`, `KnownAction`, `ProcedureStore`.

O nível é uma coluna do procedimento, então `trust` decide e `procedures` guarda: o serviço
recebe a porta estreita `ProcedureStore` (`get`, `setLevel`, `run`) em vez do `BrainStore`, e a
dependência fica de mão única.

**Casos de uso** (`use-cases/`, documento 27):

| Caso de uso | O que faz |
|---|---|
| `procedureAutonomy` | o painel de autonomia de um procedimento: o que ele já fez e foi aprovado, como o nível mudou, quanto falta para o N3 |

Tabelas: `autonomy_events`, `playbook_known_actions`.

O `portão` **não** é módulo deste contexto: `agents/gate.ts` é capability do Flue e fica na
composição, aplicando estas regras a cada chamada de ferramenta. E `aprovação`
(`inbox/approval.ts`, 23 linhas) é um handler da caixa de entrada: vai para `conversa`.

### `improvement` — como ele fica melhor

**Migrado** (fase 3): `src/contexts/improvement/`, com `index.ts` e a rota em `http.ts`.

| Módulo | O que faz |
|---|---|
| `review` | olha a execução que acabou, propõe ajuste no procedimento e escreve a retrospectiva |
| `judge` | separa o que é defeito do procedimento do que é chamada errada do modelo, e o que a execução sugere |
| `diagnosis` | detectores do que deu errado por culpa do Orbi ou do modelo, em categorias |
| `report` | o relatório do diagnóstico e a issue no repositório do Orbi |

Interface pública: `sendReview`, `reviewInstruction`, `KnowledgeCandidates`, `deliverKnowledge`,
`matchFacts`, `KNOWLEDGE_PREFIX`, `retrospective`, `judge`, `outOfScope`, `CHANGE_SCOPE_MS`,
`stepClaimProblems`, `inlineScriptSuggestions`, `showSuggestions`, `defaultSuggestions`,
`Diagnoses`, `DiagnosisSettings`, `DEFAULT_SETUP`, `detect`, `countsLine`, `worthTelling`,
`DETECTORS`, `startReport`, `AGENT_PROMPT`, `REPORT_PREFIX`, `reportBrief`, `draftIssue`,
`issueUrl`, `sendIssue`, `diagnosisRoutes`.

**Casos de uso** (`use-cases/`, documento 27):

| Caso de uso | O que faz |
|---|---|
| `issueDraft` | o texto exato da issue de um diagnóstico, já sem nada do trabalho do desenvolvedor |

`reviewConversation` (a revisão de fim de execução) já tinha a forma da camada desde antes do
documento 27, em `review/`, e fica lá. Diagnóstico tem o fluxo em `diagnosis/start.ts`.

Tabelas: `diagnoses`, `diagnosis_reports` e `review_notes` (esta chegou na fase 4b). A classe
`Review` deixou de receber o `BrainStore`: recebe `NotesDeps`, com o seu próprio repositório, o
procedimento de que a nota fala e o fato que ela cita.

`retrospectiva` não virou módulo: são 33 linhas e respondem a mesma pergunta que `revisão`, então
é um arquivo dentro dela. E os agentes `revisor` e `diagnosticador` ficam na composição
(`agents/`): são adaptadores finos que registram o agente no Flue e chamam este contexto.

### `learning` — o que ainda espera aprovação

**Migrado** (fase 4b): `src/contexts/learning/`, um módulo só, código plano em `src/`.

Dono da tabela `proposals` e, mais importante, **dono da garantia de que um lote cai inteiro ou
não cai** (documento 22). Um lote pode trazer um tipo, um fato, uma ligação, um procedimento e
uma esteira de uma vez, então a transação atravessa `knowledge` e `procedures`: os contextos
compartilham a mesma conexão SQLite, e é aqui que a transação tem nome e lugar.

Interface pública: `Learning`, `ProposalRepo`, `changeFromProposal`, `proposalProblems`,
`pipelineFromPayload`, `credentialProblems`, e os tipos `Change`, `ProposalContext`,
`LearningDeps`.

Tabelas: `proposals`.

### `talk` — por onde o desenvolvedor fala

**Migrado** (fase 5): `src/contexts/talk/`, com `index.ts` e cinco rotas.

| Módulo | O que faz |
|---|---|
| `conversations` | as conversas, seus títulos, o estado, o apagar e a limpeza |
| `inbox` | os cartões que o desenvolvedor responde: aprovação, pergunta, aviso, segredo |
| `followups` | o Orbi se acordando depois: agendado, entregue, falhou, cancelado |
| `voice` | transcrição local: o modelo, onde ficam os arquivos, o aquecimento |

Interface pública: `Conversations`, `Inbox`, `Followups`, `startFollowups`, `VoiceModel`,
`createStt`, `warmVoice`, `buildNotebook`, `nextLevel`, `conversationState`,
`purgeDeletedTranscripts`, `HANDLERS`, `handlerFor`, `tellAgent`, as cinco rotas, e os tipos
`ConversationInfo`, `DeleteHook`, `InboxItem`, `InboxKind`, `ConversationNotebook`,
`ConversationState`, `TeachingStage`, `VoiceState`, `VoiceStatus`, `SttSlot`, `Transcriber`.

**`DeleteHook`** resolve a violação que sobrava: apagar uma conversa precisava falhar os pedidos
de agente de código, e isso era um `UPDATE agent_requests` dentro deste contexto. Agora quem é
dono da tabela registra um gancho no início, e ele roda na mesma transação.

**Casos de uso** (`use-cases/`, documento 27):

| Caso de uso | O que faz |
|---|---|
| `listConversations` | a lista da barra lateral: as conversas, onde cada uma está, e quem pediu quando foi um agente de código |
| `conversationNotebook` | o caderno ao lado da conversa: estado, passos do procedimento em andamento, o que já está resolvido, entidades |
| `chooseConversationModel` | troca o modelo da conversa; recusa um nome que o provedor ativo não oferece (atravessa `models`) |
| `chooseVoiceModel` / `prepareVoiceModel` | o modelo de transcrição: escolher, esvaziar o slot e carregar na memória antes do primeiro ditado |
| `conversationStateReader` | onde está cada conversa, lido do cérebro; os dois primeiros usam este mesmo leitor |

O inbox não tem casos de uso aqui porque já tem a camada em outra forma: um handler por tipo de
item em `inbox/src/`, e a rota não conhece tipo de item nenhum. `POST /api/transcribe` e os
retornos (`followups`) são uma chamada com limites de HTTP em volta.

Tabelas: `conversations`, `deleted_conversations`, `inbox_items`, `followups`.

### `tools` — com o que ele age no mundo

**Migrado** (fase 5): `src/contexts/tools/`, com `index.ts` e quatro rotas. É o segundo maior.

| Módulo | O que faz |
|---|---|
| `terminal` | comandos na máquina, os programas permitidos, a limpeza da saída e o caminho do shell |
| `browser` | o Chrome compartilhado, a gravação da tela e a ponte MCP do devtools |
| `mcp-client` | servidores MCP que o desenvolvedor cadastrou e as conexões com eles |
| `code-agents` | os agentes de código da máquina, suas tarefas e a cópia descartável |
| `commands` | o que cada programa conhecido faz (git, gh, aws, build) |

Interface pública: o que cada módulo exporta, mais as rotas `browserRoutes`, `recordingRoutes`,
`codeAgentRoutes` e `mcpServerRoutes`. Rodar um comando recebe a porta `CommandMemory`
(problema conhecido, anotar a tentativa, saber se há execução aberta) em vez do agregado.

**Casos de uso** (`use-cases/`, documento 27):

| Caso de uso | O que faz |
|---|---|
| `testCodeAgent` | manda um pedido curto a um agente cadastrado para saber se ele está instalado, logado e roda de uma vez; guarda o resultado, menos o do agente que veio do ambiente |
| `startDemonstration` | começa uma gravação no navegador e, se a conversa ainda não tem nome, dá nome a ela |

`testCodeAgent` serve a ferramenta `code_agent_test` **e** a rota `POST /api/code-agents/:id/test`
— as três linhas estavam escritas nos dois lugares.

Dos onze candidatos que a contagem grossa apontou aqui, só estes dois eram caso de uso. Os outros
são uma chamada só com argumentos de infraestrutura montados em volta (`run_command` monta pastas,
timeout, programas permitidos e entrega a `runAndReport`), ou um portão (`browser_read` recusa
escrita e repassa), ou a mesma chamada repetida num laço (`code_agents_register` salva cada agente
e atribui cada tarefa: duas chamadas, não cinco), ou falam com a conversa (`POST
/api/recordings/:id/stop` entrega a linha do tempo ao agente quando a transcrição termina, e isso
não pode morar num caso de uso). Ficam onde estão.

Tabelas: `code_agents`, `code_agent_tasks`, `mcp_servers`, `mcp_tools`.

### `models` — com o que ele pensa

**Migrado** (fase 1): `src/contexts/models/`, com `index.ts` e a rota em `http.ts`.

| Módulo | O que faz |
|---|---|
| `provider` | qual provedor está ativo, o adaptador que fala com ele e a ponte com o Flue |
| `plugins` | adaptadores achados no disco e o teste de que respondem |
| `roles` | os quatro papéis (conversa, executar, aprender, conhecimento) e o modelo de cada turno |
| `cost` | quão caro é cada modelo, o que o desenvolvedor classificou e o que já vem sabido |
| `setup` | como o desenvolvedor escolhe, testa e aplica um provedor |

Interface pública: `configureLlm`, `llmChoice`, `llmSettings`, `ADAPTERS`, `ModelRoles`,
`resolveRoles`, `turnRole`, `modelForTurn`, `ModelTiers`, `modelChoices`, `knownTier`,
`CLAUDE_MODELS`, `discoverPlugins`, `pluginDirs`, `describePlugins`,
`modelOptions`, `modelStatus`, `testModel`, `applyModel`, `envFor`, `modelRoutes`.

`configureLlm` **devolve** o provedor do Flue em `ActiveLlm.provider`; quem registra é o
`compose.ts`. Assim a fronteira do contexto só aponta para fora.

**Casos de uso** (`use-cases/`, documento 27):

| Caso de uso | O que faz |
|---|---|
| `rescanPlugins` | reprocura os plugins de modelo nas pastas conhecidas, sem reiniciar |

Trocar de modelo já tinha a camada: `applyModel` em `setup/` é o fluxo, e a rota só traduz o
resultado em 200 ou 422. Papéis e faixas são uma gravação e uma leitura.

Tabelas: nenhuma própria; usa o namespace `models` em `settings`.

`appDataHome` saiu daqui para `platform` na fase 2: é caminho por sistema operacional.
Ainda alcança a estrutura antiga em `terminal/orbi-env.ts` e `observability/` (fase 5); a lista
está em `test/boundary.test.ts`, em `AINDA_FORA`, e só pode encurtar.

### `secrets` — o que nunca pode sair

**Migrado** (fase 2): `src/contexts/secrets/`, com `index.ts`, a rota em `http.ts` e, por ser um
módulo só, o código plano em `src/`.

Guarda credenciais no cofre (Keychain ou arquivo cifrado), resolve `{{segredo:nome}}` dentro da
ferramenta e devolve para fora apenas os nomes. O valor nunca chega ao modelo, ao cérebro, à
conversa nem ao log.

Interface pública: `Vault`, `redact`, `secretName`, `secretRef`, `SECRET_REF`, `vaultRoutes`,
e os tipos `SecretInfo` e `VaultBackend`.

Tabelas: nenhuma; arquivo próprio cifrado.

### `telemetry` — o que aconteceu

**Migrado** (fase 5): `src/contexts/telemetry/`, um módulo só, código plano em `src/`.

Uso de modelo e ferramenta por conversa, o log, o resultado da última chamada e as observações
da execução em curso.

Interface pública: `log`, `createLogger`, `logOptionsFromEnv`, `setLogger`, `UsageStore`,
`ToolOutcomes`, `RunObservations`, `handleObservation`, `usageRoutes`, e os tipos `TitleOf`,
`UsageReport`, `Logger`.

**`TitleOf`** resolve a outra violação: o relatório mostrava o nome da conversa com
`usage LEFT JOIN conversations`. Agora pede o nome a `talk` e junta em memória.

Tabelas: `usage`.

### `platform` — onde ele está rodando

**Migrado** (fase 2): `src/contexts/platform/`.

| Módulo | O que faz |
|---|---|
| `os` | diferenças de sistema operacional, uma implementação por sistema, e a pasta de dados do app |
| `env` | o arquivo `.env` da instalação |
| `preferences` | o que o desenvolvedor escolheu e fica entre execuções |

Interface pública: `platform`, `platformFor`, `appDataHome`, `setEnvValue`, `withEnvValue`,
`Preferences`, e os tipos `Platform` e `PlatformId`.

Dono da tabela `settings`: **ninguém mais a lê ou escreve em SQL cru.** Quem guardava direto
(`PolicyStore`, `VoiceModel`, `ModelRoles`, `ModelTiers`, `DiagnosisSettings`) passou a receber
`Preferences` no construtor e nenhum deles depende mais do banco.

O `db/` **não** é deste contexto: ele roda as migrações de todos, e isso é composição.


### `agents` — quem chama o Orbi de fora

**Migrado** (fase 7): `src/contexts/agents/`.

Claude Code, Codex e afins, na máquina do desenvolvedor, falando com o Orbi pelo servidor MCP.
Responde a uma pergunta só: **o que vem de fora, e de quem.**

Dois vizinhos têm nome parecido e não são isto:

- `contexts/tools` guarda os agentes de código que **o Orbi chama** (a tabela `code_agents`) — é a
  direção contrária desta;
- `src/agents/` é o runtime dos agentes **do próprio Orbi** (o do chat, o configurador, o revisor,
  o diagnosticador). Não é contexto: é composição.

| Módulo | O que faz |
|---|---|
| `clients` | quem pode chamar, e o que cada um pode (delegar, ensinar, rodar esteira); guarda só o hash do token |
| `requests` | o que foi delegado: quem pediu, para quê, e o resultado curto que o Orbi devolveu |
| `suggestions` | o procedimento que um agente sugeriu (`orbi_teach`), esperando o desenvolvedor aceitar |
| `server` | a porta MCP: as ferramentas `orbi_*`, o que cada cliente vê, e o estado que elas respondem |

**Casos de uso** (`use-cases/`, documento 27):

| Caso de uso | O que faz |
|---|---|
| `delegateTask` | o agente delega uma tarefa: abre a conversa que o desenvolvedor vê, guarda quem pediu, devolve o sinal a entregar |
| `runPipelineForAgent` | o agente manda rodar uma esteira; se ela recusar, a conversa aberta é desfeita |
| `requestProgress` | onde está o pedido — e o id de outro cliente é tratado como pedido que não existe |

Os dois primeiros **não** falam com a conversa: devolvem o sinal, e quem chama entrega. É o que
mantém a regra do documento 27 de pé num contexto cuja razão de existir é avisar o Orbi.

Interface pública: os três casos de uso, `AgentClients`, `AgentRequests`, `AgentSuggestions`,
`handleMcp`, `requestStatus`, `toolsFor`, `procedureName`, `agentRoutes` e `mcpRoutes`.

Dono das tabelas `agent_clients`, `agent_requests` e `agent_suggestions`.

Um agente nunca aprova nada, nunca vê credencial e nunca escreve no cérebro.

O prompt do servidor MCP (`instructions.md`) mora dentro do módulo `server`, e é o primeiro a sair
de `src/prompts/`: um prompt com um leitor só é do contexto desse leitor. Os que ficaram em
`src/prompts/` são dos agentes do próprio Orbi, que são composição.


## Composição

A composição (`compose.ts`, `wiring.ts`, `overview.ts`, `src/agents/`, `http/app.ts`) pode usar
qualquer contexto. O `src/mcp/` não existe mais: virou o contexto `agents`.

**O agregado `brain.ts` não existe mais** (a dívida da fase 4b foi paga). No lugar dele:

- `src/wiring.ts` liga os contextos que compartilham o banco, e só isso: cada um recebe os
  próprios repositórios e, do vizinho, a porta que o vizinho abriu. Nada ali decide nada.
- `src/overview.ts` tem as duas leituras que atravessam contexto de propósito: `stats`, a linha
  de situação que entra em cada turno, e `exportBrain`, a exportação do cérebro em Markdown.
  Cada contexto conta o que é dele; a composição soma.
- `services.ts` tem **uma entrada por contexto**. Uma chamada passou a dizer para onde vai:
  `procedures.execution.startRun(…)` em vez de `brain.startRun(…)`.

E as capabilities declaram a verdade. Antes, dez delas diziam `needs: ['brain']`; agora dizem o
que usam — `['procedures', 'inbox']`, `['codeFixer', 'codeAgents', 'config', 'inbox', 'knowledge']`,
e a mais sensível de todas, a que escreve conhecimento, diz
`['knowledge', 'learning', 'notes', 'procedures', 'config']`. Lendo a declaração, dá para saber
o que a capability toca sem abrir o arquivo. É onde vivem o agente Orbi (que monta o turno), a
API HTTP (que só monta as rotas que cada contexto exporta), o servidor MCP e o `compose.ts`.
Nenhum contexto importa a composição.
