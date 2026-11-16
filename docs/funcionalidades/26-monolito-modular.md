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

**Fase 3 — `melhoria`.** `diagnosis/` e `code-agents/` já têm `index.ts`; aqui o trabalho é
cortar a dependência de `brain/domain/{types,run-calls}`, que passa pela linguagem compartilhada.

**Fase 4 — `conhecimento`, `procedimentos` e `confianca`.** A parte que dói, e por isso a
última: é o `BrainStore` sendo repartido. Nesta fase os dois repos que atravessam assuntos se
dividem e `brain/domain/types.ts` vira `linguagem/`.

**Fase 5 — `talk`, `tools`, `telemetry`.** Conserta as duas violações que sobram: o JOIN de
`usage` em `conversations` e `conversations.ts` escrevendo em `agent_requests`.

**Fase 6 — contrato com o desktop.** `packages/contracts/src/api.ts` tem 439 linhas e é o
acoplamento mais caro: cada funcionalidade nova mexe nele e no `apps/desktop/src/api.ts`. Duas
saídas, e a escolha fica para depois da fase 5, com informação melhor:

- **conservadora**: quebrar o contrato em um arquivo por contexto, com o `index.ts`
  reexportando. Resolve a legibilidade e mantém o pacote compartilhado;
- **fatia vertical**: o contexto passa a ser dono de `runtime/ + contrato/ + ui/`, e o desktop
  importa a tela de dentro do contexto. Resolve o pedágio das camadas, mas mexe no build do
  Tauri, no bundler e nos 162 arquivos do app.

A recomendação é a conservadora primeiro, e a fatia vertical só se, com dois ou três contextos
migrados, atravessar camada continuar custando caro.
