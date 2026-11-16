# Mapa dos módulos

Este é o mapa que o desenvolvedor e o Claude leem antes de cada funcionalidade nova. Ele diz
quais contextos existem, o que cada módulo faz, qual é a interface pública de cada contexto e
quem é dono de cada tabela. Mudou a estrutura, atualize este arquivo no mesmo commit.

A decisão que gerou este mapa, com as medições e o que cada fase ensinou, está no documento 26
(`funcionalidades/26-monolito-modular.md`). **A migração terminou:** os onze contextos existem,
`src/contexts/` é toda a funcionalidade, e a lista de exceções do teste de fronteira está vazia.

**Nome e caminho.** A convenção do projeto é código e nomes em inglês, documentação em
português. Então cada contexto e cada módulo aparecem aqui com o termo que a gente fala e o
caminho real: *papéis* (`roles`). Na conversa vale o termo em português; no código, o caminho.
O que ainda não virou contexto está marcado com "hoje em".

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

**A funcionalidade de cada contexto está escrita em chamadas** em `contexts/<contexto>/flows/`
(documento 27): um arquivo por funcionalidade, uma função no nome do domínio, que recebe o pedido,
chama os vizinhos pela porta deles e devolve o que aconteceu — sem SQL, sem schema de ferramenta,
sem texto de prompt, e sem falar com a conversa ou com a tela. É esse o código para ler quando a
pergunta é "como funciona X": o índice de cada contexto está na sua seção, abaixo.
`test/flows.test.ts` guarda as regras. Contexto cuja funcionalidade *é* uma chamada não tem a
camada: a regra é "existe fluxo onde existe orquestração".

**A linguagem compartilhada** fica em `src/language/` (fase 4a): as palavras que todo contexto
usa para falar das mesmas coisas — `Entity`, `Playbook`, `PlaybookRun`, `StepStatus`, `Level`,
`Effect`, `Proposal`. Só tipos e constantes, sem estado e sem banco, então qualquer contexto a
importa e ela não importa nenhum. As **regras** que usam essas palavras ficam no contexto a que
pertencem: `decideAction` é de `confiança`, não da linguagem.

## Contextos

### conhecimento (`knowledge`) — o que o Orbi sabe

**Migrado** (fase 4b): `src/contexts/knowledge/`, com `index.ts` e a rota em `http.ts`.
É o contexto folha: **não importa contexto nenhum.**

| Módulo | O que faz |
|---|---|
| `ontologia` (`ontology`) | os tipos que o desenvolvedor ensinou e o que cada um pode se ligar a quê |
| `fatos` (`facts`) | entidades e ligações; decide se um fato novo já existe (veredictos `known`/`update`/`same`/`new`) |
| `busca` (`search`) | índice FTS5 sobre entidades e procedimentos; o mínimo é travado por `eval:search` |
| `problemas` (`problems`) | fatos do tipo problema, casados com o texto de um erro |

Interface pública: `Facts`, `GraphRepo`, `OntologyRepo`, `factsForRun`, `entityProblems`,
`edgeProblems`, `findGaps`, `isTypeName`, `EXAMPLE_TYPES`, `classifyEntity`, `mergeEntity`,
`compact`, `verdictLine`, `ftsQuery`, `sharedStems`, `stem`, `words`, `asKnownProblem`,
`knownProblemsFor`, `errorTail`, `knowledgeSuggestions`, `problemsIn`, `recurrence`,
`brainRoutes`, e os tipos `Candidate`, `FactVerdict`, `FactsForRun`, `KnownProblem`.

**`FactsForRun`** é a porta estreita por onde um procedimento em execução lê fatos e, no passo 0,
grava um (documento 22). Quem executa nunca segura os repositórios deste contexto.

As propostas que esperam aprovação **não são deste contexto**: são do `aprendizado`, porque um
lote atravessa `conhecimento` e `procedimentos` numa transação só.

Tabelas: `types`, `entities`, `edges`.

### procedimentos (`procedures`) — o que ele sabe fazer, e o que está fazendo

**Migrado** (fase 4b): `src/contexts/procedures/`, com `index.ts` e as rotas em
`pipelines-http.ts` e `learnings-http.ts`. É o maior contexto, e o único com seis módulos.

| Módulo | O que faz |
|---|---|
| `definição` (`definition`) | o procedimento, seus passos, scripts, entradas, saídas e variações |
| `ensaio` (`rehearsal`) | a execução de teste que prova o procedimento antes de valer |
| `execução` (`execution`) | a execução de verdade: passos, passo 0 (resolver entradas), registro das chamadas, desvios |
| `provas` (`proofs`) | qual passo já rodou como está escrito; a prova cai quando o texto do passo muda |
| `aprendizados` (`learnings`) | o que cada passo já tentou, e como foi |
| `esteiras` (`pipelines`) | procedimentos em sequência e o motor que decide a próxima etapa |

Interface pública: `Procedures`, `PlaybookRepo`, `Execution`, `RunCallRepo`, `ProofRepo`,
`StepLearningRepo`, `PipelineDefs`, `PipelineRepo`, mais as regras puras de cada módulo
(`playbooks`, `scripts`, `concepts`, `rehearsal`, `run-calls`, `proofs`, `learnings`,
`pipelines`, `config`, `engine`, `runs`) e as rotas `pipelineRoutes`, `pipelineRunRoutes`,
`stepLearningRoutes`.

**Fluxos** (`flows/`, documento 27) — é aqui que se lê como cada funcionalidade funciona:

| Fluxo | O que faz |
|---|---|
| achar parecido (`findSimilarProcedures`) | "já sei algo parecido?": os candidatos ao pedido, com as variações de cada um e o porquê de ele ter vindo |
| iniciar procedimento (`startProcedure`) | acha o procedimento, confere a ordem na esteira, abre a execução, e devolve o passo 0, o que já se tentou e o estado da prova — ou a recusa |

Lê `knowledge` pela porta `FactsForRun` e pede o nível a `trust`; nenhum dos dois alcança aqui.
O motor da esteira recebe a porta `EngineStore`, com as seis operações que usa.

Tabelas: `playbooks`, `playbook_runs`, `run_calls`, `playbook_proofs`, `playbook_learnings`,
`pipelines`, `pipeline_runs`.

### confiança (`trust`) — o que ele pode fazer sozinho

**Migrado** (fase 4a): `src/contexts/trust/`, com `index.ts` e a rota em `http.ts`.

| Módulo | O que faz |
|---|---|
| `níveis` (`levels`) | o nível em que o procedimento está, como ele sobe e desce, e as ações que ele já conhece |
| `política` (`policy`) | o que o desenvolvedor permite por assunto, e o efeito que cada ação tem |

Interface pública: `Autonomy`, `LevelRepo`, `levelState`, `decideAction`, `askReason`,
`settleLevel`, `levelAfterEdit`, `runDeviations`, `activeDeviations`, `workedAround`, `stepUses`,
`isCallError`, `fingerprintWith`, `defaultFingerprint`, `decide`, `effectOfCategory`, `levelOf`,
`parsePolicy`, `commandEffect`, `commandCategory`, `codeFixCategory`, `browserCategory`,
`DEFAULT_POLICY`, `PolicyStore`, `autonomyRoutes`, e os tipos `Category`, `AutonomyLevel`,
`AutonomyPolicy`, `AutonomyEvent`, `KnownAction`, `ProcedureStore`.

O nível é uma coluna do procedimento, então `trust` decide e `procedures` guarda: o serviço
recebe a porta estreita `ProcedureStore` (`get`, `setLevel`, `run`) em vez do `BrainStore`, e a
dependência fica de mão única.

Tabelas: `autonomy_events`, `playbook_known_actions`.

O `portão` **não** é módulo deste contexto: `agents/gate.ts` é capability do Flue e fica na
composição, aplicando estas regras a cada chamada de ferramenta. E `aprovação`
(`inbox/approval.ts`, 23 linhas) é um handler da caixa de entrada: vai para `conversa`.

### melhoria (`improvement`) — como ele fica melhor

**Migrado** (fase 3): `src/contexts/improvement/`, com `index.ts` e a rota em `http.ts`.

| Módulo | O que faz |
|---|---|
| `revisão` (`review`) | olha a execução que acabou, propõe ajuste no procedimento e escreve a retrospectiva |
| `juiz` (`judge`) | separa o que é defeito do procedimento do que é chamada errada do modelo, e o que a execução sugere |
| `diagnóstico` (`diagnosis`) | detectores do que deu errado por culpa do Orbi ou do modelo, em categorias |
| `relatório` (`report`) | o relatório do diagnóstico e a issue no repositório do Orbi |

Interface pública: `sendReview`, `reviewInstruction`, `KnowledgeCandidates`, `deliverKnowledge`,
`matchFacts`, `KNOWLEDGE_PREFIX`, `retrospective`, `judge`, `outOfScope`, `CHANGE_SCOPE_MS`,
`stepClaimProblems`, `inlineScriptSuggestions`, `showSuggestions`, `defaultSuggestions`,
`Diagnoses`, `DiagnosisSettings`, `DEFAULT_SETUP`, `detect`, `countsLine`, `worthTelling`,
`DETECTORS`, `startReport`, `AGENT_PROMPT`, `REPORT_PREFIX`, `reportBrief`, `draftIssue`,
`issueUrl`, `sendIssue`, `diagnosisRoutes`.

Tabelas: `diagnoses`, `diagnosis_reports` e `review_notes` (esta chegou na fase 4b). A classe
`Review` deixou de receber o `BrainStore`: recebe `NotesDeps`, com o seu próprio repositório, o
procedimento de que a nota fala e o fato que ela cita.

`retrospectiva` não virou módulo: são 33 linhas e respondem a mesma pergunta que `revisão`, então
é um arquivo dentro dela. E os agentes `revisor` e `diagnosticador` ficam na composição
(`agents/`): são adaptadores finos que registram o agente no Flue e chamam este contexto.

### aprendizado (`learning`) — o que ainda espera aprovação

**Migrado** (fase 4b): `src/contexts/learning/`, um módulo só, código plano em `src/`.

Dono da tabela `proposals` e, mais importante, **dono da garantia de que um lote cai inteiro ou
não cai** (documento 22). Um lote pode trazer um tipo, um fato, uma ligação, um procedimento e
uma esteira de uma vez, então a transação atravessa `knowledge` e `procedures`: os contextos
compartilham a mesma conexão SQLite, e é aqui que a transação tem nome e lugar.

Interface pública: `Learning`, `ProposalRepo`, `changeFromProposal`, `proposalProblems`,
`pipelineFromPayload`, `credentialProblems`, e os tipos `Change`, `ProposalContext`,
`LearningDeps`.

Tabelas: `proposals`.

### conversa (`talk`) — por onde o desenvolvedor fala

**Migrado** (fase 5): `src/contexts/talk/`, com `index.ts` e cinco rotas.

| Módulo | O que faz |
|---|---|
| `conversas` (`conversations`) | as conversas, seus títulos, o estado, o apagar e a limpeza |
| `caixa` (`inbox`) | os cartões que o desenvolvedor responde: aprovação, pergunta, aviso, segredo |
| `followups` (`followups`) | o Orbi se acordando depois: agendado, entregue, falhou, cancelado |
| `voz` (`voice`) | transcrição local: o modelo, onde ficam os arquivos, o aquecimento |

Interface pública: `Conversations`, `Inbox`, `Followups`, `startFollowups`, `VoiceModel`,
`createStt`, `warmVoice`, `buildNotebook`, `nextLevel`, `conversationState`,
`purgeDeletedTranscripts`, `HANDLERS`, `handlerFor`, `tellAgent`, as cinco rotas, e os tipos
`ConversationInfo`, `DeleteHook`, `InboxItem`, `InboxKind`, `ConversationNotebook`,
`ConversationState`, `TeachingStage`, `VoiceState`, `VoiceStatus`, `SttSlot`, `Transcriber`.

**`DeleteHook`** resolve a violação que sobrava: apagar uma conversa precisava falhar os pedidos
de agente de código, e isso era um `UPDATE agent_requests` dentro deste contexto. Agora quem é
dono da tabela registra um gancho no início, e ele roda na mesma transação.

Tabelas: `conversations`, `deleted_conversations`, `inbox_items`, `followups`.

### ferramentas (`tools`) — com o que ele age no mundo

**Migrado** (fase 5): `src/contexts/tools/`, com `index.ts` e quatro rotas. É o segundo maior.

| Módulo | O que faz |
|---|---|
| `terminal` (`terminal`) | comandos na máquina, os programas permitidos, a limpeza da saída e o caminho do shell |
| `navegador` (`browser`) | o Chrome compartilhado, a gravação da tela e a ponte MCP do devtools |
| `mcp-cliente` (`mcp-client`) | servidores MCP que o desenvolvedor cadastrou e as conexões com eles |
| `agentes-de-código` (`code-agents`) | os agentes de código da máquina, suas tarefas e a cópia descartável |
| `comandos` (`commands`) | o que cada programa conhecido faz (git, gh, aws, build) |

Interface pública: o que cada módulo exporta, mais as rotas `browserRoutes`, `recordingRoutes`,
`codeAgentRoutes` e `mcpServerRoutes`. Rodar um comando recebe a porta `CommandMemory`
(problema conhecido, anotar a tentativa, saber se há execução aberta) em vez do agregado.

Tabelas: `code_agents`, `code_agent_tasks`, `mcp_servers`, `mcp_tools`.

### modelos (`models`) — com o que ele pensa

**Migrado** (fase 1): `src/contexts/models/`, com `index.ts` e a rota em `http.ts`.

| Módulo | O que faz |
|---|---|
| `provedor` (`provider`) | qual provedor está ativo, o adaptador que fala com ele e a ponte com o Flue |
| `plugins` (`plugins`) | adaptadores achados no disco e o teste de que respondem |
| `papéis` (`roles`) | os quatro papéis (conversa, executar, aprender, conhecimento) e o modelo de cada turno |
| `custo` (`cost`) | quão caro é cada modelo, o que o desenvolvedor classificou e o que já vem sabido |
| `configuração` (`setup`) | como o desenvolvedor escolhe, testa e aplica um provedor |

Interface pública: `configureLlm`, `llmChoice`, `llmSettings`, `ADAPTERS`, `ModelRoles`,
`resolveRoles`, `turnRole`, `modelForTurn`, `ModelTiers`, `modelChoices`, `knownTier`,
`CLAUDE_MODELS`, `discoverPlugins`, `pluginDirs`, `describePlugins`,
`modelOptions`, `modelStatus`, `testModel`, `applyModel`, `envFor`, `modelRoutes`.

`configureLlm` **devolve** o provedor do Flue em `ActiveLlm.provider`; quem registra é o
`compose.ts`. Assim a fronteira do contexto só aponta para fora.

Tabelas: nenhuma própria; usa o namespace `models` em `settings`.

`appDataHome` saiu daqui para `platform` na fase 2: é caminho por sistema operacional.
Ainda alcança a estrutura antiga em `terminal/orbi-env.ts` e `observability/` (fase 5); a lista
está em `test/boundary.test.ts`, em `AINDA_FORA`, e só pode encurtar.

### segredos (`secrets`) — o que nunca pode sair

**Migrado** (fase 2): `src/contexts/secrets/`, com `index.ts`, a rota em `http.ts` e, por ser um
módulo só, o código plano em `src/`.

Guarda credenciais no cofre (Keychain ou arquivo cifrado), resolve `{{segredo:nome}}` dentro da
ferramenta e devolve para fora apenas os nomes. O valor nunca chega ao modelo, ao cérebro, à
conversa nem ao log.

Interface pública: `Vault`, `redact`, `secretName`, `secretRef`, `SECRET_REF`, `vaultRoutes`,
e os tipos `SecretInfo` e `VaultBackend`.

Tabelas: nenhuma; arquivo próprio cifrado.

### telemetria (`telemetry`) — o que aconteceu

**Migrado** (fase 5): `src/contexts/telemetry/`, um módulo só, código plano em `src/`.

Uso de modelo e ferramenta por conversa, o log, o resultado da última chamada e as observações
da execução em curso.

Interface pública: `log`, `createLogger`, `logOptionsFromEnv`, `setLogger`, `UsageStore`,
`ToolOutcomes`, `RunObservations`, `handleObservation`, `usageRoutes`, e os tipos `TitleOf`,
`UsageReport`, `Logger`.

**`TitleOf`** resolve a outra violação: o relatório mostrava o nome da conversa com
`usage LEFT JOIN conversations`. Agora pede o nome a `talk` e junta em memória.

Tabelas: `usage`.

### plataforma (`platform`) — onde ele está rodando

**Migrado** (fase 2): `src/contexts/platform/`.

| Módulo | O que faz |
|---|---|
| `so` (`os`) | diferenças de sistema operacional, uma implementação por sistema, e a pasta de dados do app |
| `ambiente` (`env`) | o arquivo `.env` da instalação |
| `preferências` (`preferences`) | o que o desenvolvedor escolheu e fica entre execuções |

Interface pública: `platform`, `platformFor`, `appDataHome`, `setEnvValue`, `withEnvValue`,
`Preferences`, e os tipos `Platform` e `PlatformId`.

Dono da tabela `settings`: **ninguém mais a lê ou escreve em SQL cru.** Quem guardava direto
(`PolicyStore`, `VoiceModel`, `ModelRoles`, `ModelTiers`, `DiagnosisSettings`) passou a receber
`Preferences` no construtor e nenhum deles depende mais do banco.

O `db/` **não** é deste contexto: ele roda as migrações de todos, e isso é composição.



## Composição

A composição (`compose.ts`, `wiring.ts`, `overview.ts`, `agents/`, `http/app.ts`, `mcp/`) pode
usar qualquer contexto.

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
