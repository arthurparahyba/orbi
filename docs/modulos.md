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
- **O `migrations.ts` é do contexto.** Uma tabela aparece em um `migrations.ts` só, e isso
  responde "onde isso é guardado" sem busca.

Os três identificadores que circulam entre contextos são `conversation_id`, `run_id` e
`playbook`. Carregar o id é livre; amarrar com chave estrangeira não.

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

Hoje em `autonomy/`, `agents/gate.ts`, `brain/repo/levels.ts`, `inbox/approval.ts`.

| Módulo | O que faz |
|---|---|
| `níveis` (`levels`) | o nível de autonomia por assunto e como ele sobe e desce |
| `portão` (`gate`) | toda ação que muda algo passa aqui, com a categoria; decide pedir ou seguir |
| `aprovação` (`approval`) | o cartão que o desenvolvedor responde e o que acontece depois do sim e do não |

Interface pública: `decidir`, `nivel`, `subir`, `pedirAprovacao`, `categoria`.

Tabelas: `autonomy_events`, `playbook_known_actions`.

### melhoria (`improvement`) — como ele fica melhor

Hoje em `review/`, `diagnosis/`, `agents/{revisor,diagnosticador}.ts`.

| Módulo | O que faz |
|---|---|
| `revisão` (`review`) | olha a execução que acabou e propõe ajuste no procedimento |
| `juiz` (`judge`) | separa o que é defeito do procedimento do que é chamada errada do modelo |
| `retrospectiva` (`retrospective`) | o resumo do que aconteceu na execução, para o desenvolvedor ler |
| `diagnóstico` (`diagnosis`) | detectores do que deu errado por culpa do Orbi ou do modelo, em categorias |
| `relatório` (`report`) | o relatório do diagnóstico e a issue no repositório do Orbi |

Interface pública: `revisar`, `retrospectiva`, `candidatos`, `diagnosticar`, `relatar`,
`enviarIssue`.

Tabelas: `review_notes`, `diagnoses`, `diagnosis_reports`.

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
`CLAUDE_MODELS`, `discoverPlugins`, `pluginDirs`, `describePlugins`, `appDataHome`,
`modelOptions`, `modelStatus`, `testModel`, `applyModel`, `envFor`, `modelRoutes`.

`configureLlm` **devolve** o provedor do Flue em `ActiveLlm.provider`; quem registra é o
`compose.ts`. Assim a fronteira do contexto só aponta para fora.

Tabelas: nenhuma própria; usa o namespace `models` em `settings`.

Ainda alcança a estrutura antiga em `platform/`, `settings/env-file.ts` e `terminal/orbi-env.ts`
(fases 2 e 5). A lista está em `test/boundary.test.ts`, em `AINDA_FORA`, e só pode encurtar.

### segredos (`secrets`) — o que nunca pode sair

Hoje em `vault/`.

Um módulo só. Guarda credenciais no cofre, resolve `{{segredo:nome}}` dentro da ferramenta e
devolve para fora apenas os nomes. O valor nunca chega ao modelo, ao cérebro, à conversa nem ao log.

Interface pública: `nomes`, `guardar`, `resolverNaFerramenta`, `limpar`.

Tabelas: nenhuma; arquivo próprio cifrado.

### telemetria (`telemetry`) — o que aconteceu

Hoje em `observability/`.

Um módulo só. Uso de modelo e ferramenta por conversa, o log, o resultado da última chamada e
as observações da execução em curso.

Interface pública: `log`, `uso`, `resultados`, `observacoes`.

Tabelas: `usage`.

### plataforma (`platform`) — onde ele está rodando

Hoje em `platform/`, `settings/`, `db/`.

Um módulo só. Caminhos por sistema operacional, o shell, o arquivo de ambiente, o banco e as
preferências guardadas. Dono de `settings`, que serve a todos por namespace: ninguém mais
escreve nessa tabela em SQL cru.

Interface pública: `caminhos`, `shell`, `preferencias(namespace)`, `banco`.

Tabelas: `settings`.

## Composição

A composição (`compose.ts`, `agents/`, `http/app.ts`, `mcp/`) pode usar qualquer contexto. É onde vivem o agente Orbi (que monta o turno), a
API HTTP (que só monta as rotas que cada contexto exporta), o servidor MCP e o `compose.ts`.
Nenhum contexto importa a composição.
