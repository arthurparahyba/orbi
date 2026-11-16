# Mapa dos módulos

Este é o mapa que o desenvolvedor e o Claude leem antes de cada funcionalidade nova. Ele diz
quais contextos existem, o que cada módulo faz, qual é a interface pública de cada contexto e
quem é dono de cada tabela. Mudou a estrutura, atualize este arquivo no mesmo commit.

A decisão que gerou este mapa, com as medições e o plano de migração, está no
documento 26 (`funcionalidades/26-monolito-modular.md`).

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

**A linguagem compartilhada** fica em `src/language/` (fase 4a): as palavras que todo contexto
usa para falar das mesmas coisas — `Entity`, `Playbook`, `PlaybookRun`, `StepStatus`, `Level`,
`Effect`, `Proposal`. Só tipos e constantes, sem estado e sem banco, então qualquer contexto a
importa e ela não importa nenhum. As **regras** que usam essas palavras ficam no contexto a que
pertencem: `decideAction` é de `confiança`, não da linguagem.

## Contextos

### conhecimento (`knowledge`) — o que o Orbi sabe

Hoje em `brain/{domain,repo,services}` (ontologia, grafo, fatos, propostas).

| Módulo | O que faz |
|---|---|
| `ontologia` (`ontology`) | os tipos que o desenvolvedor ensinou e o que cada um pode se ligar a quê |
| `fatos` (`facts`) | entidades e ligações; decide se um fato novo já existe (veredictos `known`/`update`/`same`/`new`) |
| `busca` (`search`) | índice FTS5 sobre entidades e procedimentos; o mínimo é travado por `eval:search` |
| `propostas` (`proposals`) | o lote que espera aprovação no cartão e a aplicação tudo ou nada |

Interface pública: `tipos`, `fato`, `fatos`, `buscar`, `classificar`, `propor`, `aplicar`,
`rejeitar`, `estatisticas`.

Tabelas: `types`, `entities`, `edges`, `proposals`.

### procedimentos (`procedures`) — o que ele sabe fazer, e o que está fazendo

Hoje em `brain/{domain,repo,services}` (playbooks, execução, provas, aprendizados) e `pipelines/`.

| Módulo | O que faz |
|---|---|
| `definição` (`definition`) | o procedimento, seus passos, scripts, entradas, saídas e variações |
| `ensaio` (`rehearsal`) | a execução de teste que prova o procedimento antes de valer |
| `execução` (`execution`) | a execução de verdade: passos, passo 0 (resolver entradas), registro das chamadas, desvios |
| `provas` (`proofs`) | qual passo já rodou como está escrito; a prova cai quando o texto do passo muda |
| `esteiras` (`pipelines`) | procedimentos em sequência e o motor que decide a próxima etapa |

Interface pública: `obter`, `semelhantes`, `iniciar`, `passo`, `resolverEntrada`,
`registrarChamada`, `provas`, `aprendizados`, `esteiras`.

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

Tabelas: `diagnoses`, `diagnosis_reports`. **`review_notes` ainda é do cérebro**: a classe
`Review` recebe o próprio `BrainStore` e é exposta como `brain.review`; ela vem na fase 4, com a
repartição do cérebro.

`retrospectiva` não virou módulo: são 33 linhas e respondem a mesma pergunta que `revisão`, então
é um arquivo dentro dela. E os agentes `revisor` e `diagnosticador` ficam na composição
(`agents/`): são adaptadores finos que registram o agente no Flue e chamam este contexto.

### conversa (`talk`) — por onde o desenvolvedor fala

Hoje em `conversations/`, `inbox/`, `followups/`, `voice/`.

| Módulo | O que faz |
|---|---|
| `conversas` (`conversations`) | as conversas, seus títulos, o apagar e a limpeza |
| `caixa` (`inbox`) | a caixa de entrada: cartões, aprovações, avisos, perguntas |
| `followups` | o Orbi se acordando depois: agendado, entregue, falhou, cancelado |
| `voz` (`voice`) | transcrição local: o modelo, onde ficam os arquivos, o aquecimento |

Interface pública: `conversas`, `caixa`, `followups`, `transcrever`, `tituloDe`.

Tabelas: `conversations`, `deleted_conversations`, `inbox_items`, `followups`.

### ferramentas (`tools`) — com o que ele age no mundo

Hoje em `terminal/`, `browser/`, `mcp-client/`, `code-agents/`, `commands/`.

| Módulo | O que faz |
|---|---|
| `terminal` (`terminal`) | comandos na máquina, com os programas permitidos e a limpeza da saída |
| `navegador` (`browser`) | o Chrome compartilhado, a gravação da tela e a ponte MCP do devtools |
| `mcp-cliente` (`mcp-client`) | servidores MCP que o desenvolvedor cadastrou e as conexões com eles |
| `agentes-de-código` (`code-agents`) | os agentes de código da máquina, suas tarefas e a cópia descartável |
| `comandos` (`commands`) | o que cada programa conhecido faz (git, gh, aws, build) |

Interface pública: `rodar`, `navegador`, `servidores`, `agentes`, `programaConhecido`.

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

Hoje em `observability/`.

Um módulo só. Uso de modelo e ferramenta por conversa, o log, o resultado da última chamada e
as observações da execução em curso.

Interface pública: `log`, `uso`, `resultados`, `observacoes`.

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

A composição (`compose.ts`, `agents/`, `http/app.ts`, `mcp/`) pode usar qualquer contexto. É onde vivem o agente Orbi (que monta o turno), a
API HTTP (que só monta as rotas que cada contexto exporta), o servidor MCP e o `compose.ts`.
Nenhum contexto importa a composição.
