# 5. Procedimentos (playbooks)

## Para que serve

Um procedimento é algo que o Orbi aprendeu a fazer: "subir para dev",
"atualizar a versão do MFE no portal", "abrir a GMUD". Tem gatilho, passos,
parâmetros e um nível de autonomia próprio. É o que transforma o trabalho
repetitivo depois do commit em algo que o Orbi faz sozinho.

## Onde aparece

- **Na conversa**, quando um procedimento roda: um **checklist ao vivo** (um passo
  por linha, com estado e nota) que avança no lugar.
- **No cartão de aprovação**, quando ele é aprendido: os passos numerados, o
  gatilho, a quem se aplica, os parâmetros e as credenciais (só os nomes).
- **Cérebro → Playbooks**: todos os procedimentos, quantas vezes deram certo, o
  nível de autonomia e as variações, cada uma logo abaixo da base.
- **Cérebro → Execuções**: o histórico de cada vez que rodou.
- **Editar e apagar**: ao abrir um procedimento em Cérebro → Playbooks:
  - **Editar** muda para que serve, quando usar, a classe, as instruções e os
    passos (renomear, reordenar, incluir, tirar). O nome, a autonomia, a base e os
    contadores ficam. Passos existentes mantêm o `id`, então um passo renomeado
    continua sendo o mesmo para o histórico e para as variações; passos novos
    ganham um `id` a partir do nome.
  - **Apagar** pede confirmação e diz o que acontece: o Orbi deixa de saber fazer
    aquilo, as variações continuam (sem a ligação) e as execuções passadas
    continuam em Execuções.

## Anatomia de um procedimento

```json
{
  "name": "atualizar-versao-mfe",
  "description": "Troca a versão do MFE no portal interno depois do deploy.",
  "trigger": "deploy do MFE concluído em dev",
  "appliesTo": "MicroFrontend",
  "autonomy": "ask",
  "variationOf": null,
  "steps": [
    { "id": "abrir",  "label": "Abrir o portal",       "how": "navigate_page em https://portal.interno/admin" },
    { "id": "salvar", "label": "Trocar para {{versao}}", "how": "browser_act fill no campo 'Versão' da aba Configuração; Salvar" },
    { "id": "conferir", "label": "Conferir no menu",   "how": "take_snapshot mostra {{versao}}" }
  ],
  "instructions": "Login com {{segredo:portal.interno/usuario}} e {{segredo:portal.interno/senha}}."
}
```

- **`description` e `trigger`** dizem quando usar. É por eles que a busca acha
  o procedimento (documento 8).
- **`how`** descreve o passo pelo sentido ("o campo rotulado Versão"), não por
  posição na página, para continuar funcionando quando a página muda um pouco.
- **`{{parametro}}`** é o que muda a cada vez (a versão, o nome do MFE).
  **`{{segredo:…}}`** é uma credencial do cofre: nunca é preenchida no texto,
  só dentro da ferramenta que usa (documento 9).
- **`appliesTo`** prende o procedimento a uma classe ("todo MicroFrontend") em
  vez de um repositório específico.
- **`variationOf`**: de qual procedimento este foi derivado (documento 8).
- **`outputs`** (opcional): o que o procedimento **entrega** ao terminar, como
  `versao` ou `numero_gmud` (nome em `snake_case` e descrição). O Orbi registra os
  valores no último `playbook_step`; nomes não declarados são recusados e valores
  do cofre são limpos. É assim que uma esteira passa dados de uma etapa para a
  próxima (documento 16). Na tela: **Recebe** (os parâmetros) e **Entrega**.
- **`scripts`** (opcional): os scripts Python **do procedimento**, cada um com
  nome (`gerar_html.py`: minúsculas, números, `_` ou `-`), uma linha do que faz e
  dos argumentos, o código (até 50 KB, sem `{{segredo:…}}`) e o efeito (`local`,
  o padrão, ou `publica`). Você aprova o código uma vez, no cartão de aprendizado
  (cada script aberto para ler; numa correção, marcado como novo, muda ou sai). Na
  execução o Orbi chama `run_script` com o nome e os argumentos (os dados, de
  `sys.argv`): é sempre o mesmo código, então vira **ação conhecida** e roda
  sozinho conforme o nível, em vez de um `python3 -c` reescrito a cada vez, que
  pede aprovação sempre. Mudou o código, muda a versão (hash) e a ação é nova:
  pede de novo. Uma mudança que não traz `scripts` mantém os que existem; um passo
  que cita `run_script x.py` sem esse script é recusado. Na tela: **Scripts**.

### Procedimento sobre conceitos (entradas tipadas)

Um procedimento pode declarar o que recebe com o conceito de cada entrada, em vez
de parâmetros soltos (documento 18):

```json
{
  "name": "atualizar-versao-mfe",
  "intent": "Publicar uma Versao de um MicroFrontend em um Ambiente",
  "inputs": [{ "name": "mfe", "concept": "MicroFrontend" }, { "name": "versao" }, { "name": "ambiente" }],
  "steps": [
    { "id": "abrir", "label": "Abrir o portal de {{mfe}}", "how": "navegador em {{mfe.publicadoPor.endereco}}" }
  ]
}
```

- **Citações conferidas**: `{{mfe.publicadoPor.endereco}}` segue as ligações do
  conceito e termina numa propriedade declarada no tipo. Citação que o conceito não
  tem, entrada que não existe e conceito que não existe voltam ao modelo antes do
  cartão (`brain/domain/concepts.ts`), como as outras verificações.
- **Nada específico nos passos**: o nome de uma entidade conhecida dos conceitos
  das entradas escrito num passo ("checkout-mfe") é recusado com a pergunta "é fato
  ou entrada?". Vale para o que o Orbi aprende e para o que você edita na tela.
- **Cartão**: mostra a intenção, os conceitos (novo ou ampliado, com propriedades e
  saberes), os fatos (com os outros nomes), o procedimento com **Recebe** e, por
  fim, **Ficou fora do procedimento**: para onde foi cada valor específico da
  explicação (`leftOut` no `brain_learn`).
- Procedimentos sem `inputs` continuam como antes, com `{{parâmetros}}` livres.

### Passo 0: resolver as entradas

Ao começar um procedimento com `inputs`, o runtime procura cada entrada de
conceito entre os fatos, pelo id ou por outro nome, sem acento nem maiúscula:

- **Conhecida**: as citações dela já vêm preenchidas nos passos
  (`navegador em http://portal.local/apps`). As credenciais continuam referência
  do cofre (`{{segredo:portal-deploy}}`).
- **Desconhecida**: o `playbook_start` devolve `passo0` com `toResolve` (o valor
  dado, o conceito, os candidatos e o `achar` do conceito), `unknown` (citações que
  os fatos ainda não respondem) e as regras (`prompts/orbi/passo-zero.md`). O Orbi
  investiga; com um candidato claro segue, com vários ou nenhum pergunta; e registra
  com **`playbook_resolve`**: o fato novo (com o nome dado como outro nome) ou o
  outro nome de um fato que existe, marcados com a origem
  `execucao:<execução>`. Os passos são preenchidos de novo.
- **No fim**: o cartão **Aprendi executando** lista o que a execução aprendeu
  sozinha, cada item com **Desfazer** (`POST
  /api/brain/runs/:id/resolved/:input/undo`): tira o fato criado, ou só o outro nome.
- **Limite**: o `playbook_resolve` só guarda fatos de um conceito que já existe, do
  tipo da entrada. Conceito novo, propriedade nova ou mudança no procedimento vão
  pelo `brain_learn` e pelo cartão. É a única escrita no cérebro sem cartão, e por
  isso ela é estreita e desfazível.

## Como é aprendido

Por três caminhos, todos terminando num `brain_learn` que você aprova (documento 4):

1. **Ensaiando, na conversa**: a skill `aprender-procedimento`
   (`prompts/aprender-procedimento.md`) guia o Orbi em quatro fases: **entender**
   (o que já sabe, o que descobre sozinho), **ensaiar** (tenta fazer o que foi
   explicado, com você), **combinar** (início, entradas, fim, o que fica de fora e o
   que o ensaio corrigiu) e só então o **cartão** (detalhes abaixo).
2. **Pelo navegador**: você mostra e explica; ele monta os passos (documento 6).
3. **Como variação** de um que já existe (documento 8).

## Como é executado

```mermaid
sequenceDiagram
  actor Voce as Você
  participant Modelo
  participant Start as playbook_start
  participant Step as playbook_step
  participant Store as Cérebro
  participant App

  Voce->>Modelo: "atualiza a versão do checkout para 2.5.0"
  Modelo->>Modelo: acha o procedimento (catálogo de skills ou busca)
  Modelo->>Start: name, params {versao: 2.5.0}
  Start->>Store: nova execução, parâmetros preenchidos nos passos
  Start-->>App: checklist com todos os passos pendentes
  loop cada passo
    Modelo->>Step: passo em andamento
    Modelo->>Modelo: faz o passo (navegador, terminal…), pelo portão
    Modelo->>Step: passo concluído, com nota
    Step->>Store: avança a execução
    Step-->>App: checklist atualizado no lugar
  end
  Store->>Store: tudo concluído: conta um sucesso
```

- **Autonomia durante a execução**: enquanto um procedimento roda, o nível dele
  (N1, N2, N3) e se a ação já é conhecida decidem o que pede aprovação
  (documento 3). O portão registra na execução cada ação que rodou e cada desvio
  (ferramenta que falhou, ação negada).
- **Passo esquecido**: marcar o último passo com outro ainda aberto devolve na hora
  `pendentes` e o pedido de fechá-los (feito ou pulado). O procedimento só termina
  quando todos fecham; numa esteira, só então ela segue.
- **Passo com ferramenta falhada não fecha**: `playbook_step` com `done` logo
  depois de uma ferramenta que falhou é recusado; o Orbi corrige ou marca o passo
  como falhou ou pulado (`observability/tool-outcomes.ts`).
- **Revisão no fim da execução** (`review/review.ts`): quando o turno da conversa
  termina, o runtime revisa as execuções que acabaram nele. Esperar o fim do turno
  garante que todas as falhas já chegaram, inclusive de ferramentas chamadas na
  mesma leva do passo que encerrou a execução (o modelo faz isso). Para cada uma:
  - os problemas: ferramenta que falhou, ação negada, passo que falhou ou foi
    pulado, e **passo dado como feito cuja ferramenta falhou**;
  - o nível, acertado com base nisso (execução com problema não sobe);
  - numa esteira, a configuração dela (documento 16);
  - o que pode melhorar: passo que rodou Python escrito na hora (`python3 -c`)
    vira a sugestão de guardar o código como script do procedimento, e passo que
    copiou à mão a saída de um script para o `show_ui` (e o `show_ui` falhou) vira a
    sugestão de o script imprimir o componente e rodar com `show: true` ("Pode
    melhorar" no cartão); o Orbi propõe isso no mesmo `brain_learn`.
  Uma ferramenta que falhou e **deu certo logo depois, no mesmo passo**, foi
  corrigida na hora: fica no histórico marcada (`recovered`), mas não é problema,
  não impede subir de nível e não pede correção. Antes, cada escorregão desses
  virava uma "correção" do procedimento que não mudava nada.
  Se há algo a mostrar (problema ou mudança de nível), um sinal `review` leva à
  conversa o cartão **Revisão da execução** e, havendo problema, pede ao Orbi as
  correções num único `brain_learn` (o cartão de aprendizado espera você). Execução
  limpa sem mudança de nível passa em silêncio. Cada execução é revisada uma vez
  (`playbook_runs.reviewed_at`). Numa esteira, a revisão espera a entrega terminar,
  ser encerrada ou parar numa decisão sua; não acontece a cada aprovação no caminho.
  Procedimento que ficou aberto quando a entrega terminou aparece como "ficou aberto".
- **Cartão da correção**: quando o Orbi corrige procedimentos que já existem, o
  título é "Corrigir N procedimentos: …" e o cartão mostra **só o que muda**: cada
  campo ou passo alterado com **Hoje** e **Depois da correção** lado a lado, passo
  novo e passo que sai; os passos iguais ficam dobrados numa linha
  (`CorrectionPreview.tsx`, `correctionView` em `stepDiff.ts`). Variação de um
  procedimento continua mostrando todos os passos marcados contra a base. Aprender não leva "por que pede" nem o passo do
  procedimento que estiver rodando, e não entra no histórico da execução.
- **Passo que pergunta algo que já veio**: quando o valor chegou como parâmetro
  (da esteira, do padrão), o Orbi usa e não pergunta (regra no prompt).
- **Estados de um passo**: pendente, em andamento, concluído, falhou, esperando
  (CI, aprovação, retorno agendado) e pulado. **Esperando** só é aceito quando há
  algo de fato esperando na conversa (um cartão aberto em Pendências ou um retorno
  agendado): dizer "aguardando aprovação" antes de chamar a ferramenta deixava você
  sem botão. O Orbi é mandado chamar a ferramenta, e o portão pede se precisar. Qualquer falha marca a execução
  como falha; tudo concluído ou pulado a encerra.
- **Contadores**: cada início soma um uso; cada execução concluída soma um
  sucesso. É o "4 de 4 deram certo" que aparece nos cartões.
- **Falha no meio**: a skill orienta marcar o passo, investigar com o subagente
  `investigador`, corrigir se for seguro (documento 10), guardar o incidente e,
  se não der, perguntar.

### Sei / não sei

Antes de rodar um procedimento com `inputs`, o runtime confere no cérebro tudo de
que ele precisa e mostra o cartão **O que eu sei** (`readiness`), atualizado a cada
`playbook_resolve`:

- cada entrada (conhecida, ou "não conheço esse MicroFrontend");
- cada citação (`{{ambiente.profile}}` com o valor, ou "o cérebro não tem esse dado");
- **cada item de uma ligação percorrida**: `{{ambiente.recurso[].de_pe}}` passa por
  todos os recursos do ambiente e usa o saber `de_pe` do conceito de cada um
  ("pag-api-svc (ServicoECS): running = desired"). Um recurso cujo conceito não sabe
  aparece como "não sei" e o passo não é preenchido pela metade; o Orbi pergunta só
  sobre ele, e a resposta vira saber do conceito (pelo cartão de aprendizado), valendo
  para todo recurso daquele tipo.

A lista sai do grafo, não da opinião do modelo. O que pede aprovação continua sendo
decidido pelo nível (documento 3).

**Erro que nunca vi**: dentro de um procedimento, um comando que falha sem nenhum
problema conhecido parecido volta com `nuncaVi` (`terminal/runner.ts`). O Orbi não
improvisa uma correção: tenta de novo só se for passageiro; senão diz "nunca vi isso",
com o trecho do erro, e pergunta se investiga com você (`prompts/orbi/falhas.md`).
Resolvido, a revisão do fim pede para guardar o problema conhecido, e da próxima vez
ele vem em `knownProblems`.

### O ensaio

A explicação é o ponto de partida, não o procedimento (documento 18):

- **`rehearsal_start`** abre uma execução `kind = 'rehearsal'`, sem procedimento
  (o nome guardado é `ensaio`), e mostra o checklist **Ensaio: …**, que cresce a
  cada **`rehearsal_step`** (passo novo pelo nome ou atualizado pelo id, com a nota
  do que o Orbi achou). As ações em si vão pelas ferramentas de sempre e pelo
  portão, e ficam no histórico do ensaio.
- **O que publica ou apaga sempre pede** durante o ensaio, mesmo com a categoria
  em automático (`agents/gate.ts`).
- **`rehearsal_finish`** fecha o ensaio com o acordo (começa quando, recebe, termina
  quando, fica de fora, o que foi corrigido na explicação), guardado em
  `outputs.acordo`. A conversa mostra o cartão **Combinando início e fim**, com
  **Está certo** e **Ajustar**, e o turno termina.
- **O cartão de aprendizado** leva `testedRun` = o ensaio. O runtime confere: tem
  que ser um ensaio terminado com o acordo, ou uma execução daquele procedimento que
  deu certo. O cartão mostra "ensaiado em …" e as correções; procedimento novo sem
  ensaio aparece como **Não foi ensaiado**.
- **O ensaio não conta** como uso do procedimento e não passa pela revisão do fim
  (não há nível para acertar).
- Se você disser que é só para guardar, o Orbi guarda sem ensaio. A demonstração
  pelo navegador (documento 6) conta como ensaio: ele abre o ensaio, marca as partes
  mostradas e vai para o combinar.

### Como o modelo encontra o procedimento

Os 15 mais usados entram como **skills** do Flue: uma linha de catálogo cada
(nome e descrição) nas instruções do modelo, e os passos só são lidos quando ele
ativa a skill. Os demais ele acha com `playbook_similar`, que devolve passos e
instruções, e roda pelo nome. Assim as instruções não crescem com o número de
procedimentos.

## Peças

| Onde | O quê |
| --- | --- |
| `apps/runtime/src/agents/tools/playbooks.ts` | Catálogo de skills, `playbook_start`, `playbook_step`, checklist |
| `apps/runtime/src/brain/domain/playbooks.ts` | Validação, parâmetros, avanço de uma execução |
| `apps/runtime/src/brain/domain/concepts.ts` | Entradas tipadas, citações `{{entrada.x.y}}`, nomes específicos nos passos, passo 0 |
| `apps/runtime/src/prompts/orbi/passo-zero.md` | O que o Orbi faz com as entradas que não conhece (vai na saída do `playbook_start`) |
| `apps/desktop/src/components/ui/LearnedFacts.tsx` | "Aprendi executando", com Desfazer |
| `apps/runtime/src/brain/domain/rehearsal.ts` + `agents/tools/rehearsal.ts` | O ensaio: passos que crescem, acordo, o que prova que um procedimento funciona (`testedRun`) |
| `apps/desktop/src/components/ui/Readiness.tsx` | "O que eu sei" antes de executar |
| `apps/desktop/src/components/ui/Agreement.tsx`, `LearnTested.tsx` | "Combinando início e fim" e o "ensaiado em" no cartão |
| `apps/desktop/src/components/ui/LearningParts.tsx` | Intenção, conceitos e "Ficou fora" no cartão de aprendizado |
| `apps/runtime/src/review/analyzers/` | As verificações da revisão, uma por arquivo (`RunAnalyzer`): o que cada uma acha vira um achado do seu tipo (problema, melhoria, aprender) e diz como corrigir. Verificação nova = arquivo novo + uma linha em `index.ts` |
| `apps/runtime/src/brain/domain/scripts.ts` | Regras dos scripts do procedimento (nome, tamanho, credenciais, versão) |
| `apps/runtime/src/agents/tools/scripts.ts` | `run_script` (portão): roda o script do procedimento em andamento |
| `apps/desktop/src/components/ScriptsPreview.tsx` | Scripts no cartão de aprendizado, contra a versão atual |
| `apps/runtime/src/brain/repo/playbooks.ts` | SQL de procedimentos, execuções e busca |
| `apps/runtime/src/skills/aprender-procedimento.ts` + `prompts/aprender-procedimento.md` | Como aprender |
| `apps/desktop/src/components/UiComponents.tsx` | Checklist (`stepper`) e prévia do aprendizado |
| `apps/desktop/src/views/brain/Playbooks.tsx` | Lista, variações, autonomia, execuções, apagar |
| `apps/desktop/src/views/brain/PlaybookEditor.tsx` | Editor de procedimento |
| `apps/runtime/src/http/routes/brain.ts` | `PUT` e `DELETE /api/brain/playbooks/:name` |

## Tecnologias

- **Skills do Flue** (`defineSkill`/`useSkill`): catálogo enxuto e instruções
  carregadas só quando usadas.
- **Estado persistente do Flue** (`usePersistentState`): qual execução está
  ativa na conversa, entre um turno e outro.

## Dados

| O quê | Onde |
| --- | --- |
| Procedimentos | tabela `playbooks` |
| Execuções e o estado de cada passo | tabela `playbook_runs` |
| Execução ativa na conversa | estado `activeRun` no `data/flue.db` |

## Configuração

| Variável | Para quê |
| --- | --- |
| `ORBI_SKILL_CATALOG_SIZE` | Quantos procedimentos entram como skills (padrão 15) |

## Limites conhecidos

- Um procedimento roda por vez em cada conversa.
- A correção sugerida depende do modelo propor bem; o runtime garante que ele é
  avisado do que falhou e que nada muda no cérebro sem você.
- A revisão chega depois da última mensagem do Orbi naquele turno, como uma nova
  mensagem: conta como mais um turno do modelo.
- Editar um procedimento não muda uma execução já em andamento: ela segue com os
  passos que tinha quando começou.
- Pela tela não dá para renomear um procedimento; peça na conversa.

## Testes

- `apps/runtime/test/flow-*.test.ts`: aprender, aprovar, ver como skill,
  executar com checklist e contar o sucesso.
- `apps/runtime/test/concepts.test.ts`: citações válidas e inválidas, nome
  específico recusado, tipo ampliado sem perder ligações, passo 0 (preencher,
  resolver, outro nome, desfazer, só fatos do conceito da entrada).
- `apps/runtime/test/flow-concepts.test.ts`: aprender com entradas e "Ficou fora";
  MFE desconhecido investigado, "Aprendi" e Desfazer; MFE conhecido pelo outro nome
  vai direto.
- `apps/runtime/test/concepts.test.ts` ("sei / não sei"): ligação percorrida com o
  saber de cada conceito, recurso sem saber vira "não sei", saber ensinado vale para
  todos; erro nunca visto dentro de um procedimento volta com `nuncaVi`.
- `apps/runtime/test/rehearsal.test.ts` e `flow-rehearsal.test.ts`: o ensaio
  cresce passo a passo, termina com o acordo, o cartão leva o ensaio (um inventado
  é recusado) e o clique que publica pede mesmo com a categoria em automático.
- `apps/runtime/test/demonstration.test.ts`: parâmetros preenchidos, segredos
  continuam referência.
- `apps/runtime/test/units.test.ts`: catálogo de skills só com os mais usados.
- `apps/runtime/test/flow-*.test.ts` ("script do procedimento"): fora de um
  procedimento é recusado; a primeira vez pede, aprovado roda o código guardado;
  com outros dados, no N2, roda sozinho.
- `apps/runtime/test/review.test.ts` ("scripts do procedimento"): validação,
  scripts mantidos numa correção só de passos, sugestão para `python3 -c`.
