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

## Como é aprendido

Por três caminhos, todos terminando num `brain_learn` que você aprova (documento 4):

1. **Fazendo junto, na conversa**: a skill `aprender-procedimento`
   (`prompts/aprender-procedimento.md`) guia o Orbi: procurar o que já sabe,
   descobrir sozinho o que dá (ler o repositório, os workflows), perguntar só o
   que falta, executar junto e guardar.
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
  vale para os passos comuns (documento 3). Um procedimento em "Automático" roda
  inteiro sem cartões.
- **Estados de um passo**: pendente, em andamento, concluído, falhou, esperando
  (CI, aprovação, retorno agendado) e pulado. Qualquer falha marca a execução
  como falha; tudo concluído ou pulado a encerra.
- **Contadores**: cada início soma um uso; cada execução concluída soma um
  sucesso. É o "4 de 4 deram certo" que aparece nos cartões.
- **Falha no meio**: a skill orienta marcar o passo, investigar com o subagente
  `investigador`, corrigir se for seguro (documento 10), guardar o incidente e,
  se não der, perguntar.

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
| `apps/runtime/src/brain/repo/playbooks.ts` | SQL de procedimentos, execuções e busca |
| `apps/runtime/src/skills/aprender-procedimento.ts` + `prompts/aprender-procedimento.md` | Como aprender |
| `apps/desktop/src/components/UiComponents.tsx` | Checklist (`stepper`) e prévia do aprendizado |
| `apps/desktop/src/views/brain/Playbooks.tsx` | Lista, variações, autonomia, execuções |

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

- Não há edição de passos pela tela; ajustes são pedidos na conversa e passam por aprovação.
- Um procedimento roda por vez em cada conversa.

## Testes

- `apps/runtime/test/agent-flow.test.ts`: aprender, aprovar, ver como skill,
  executar com checklist e contar o sucesso.
- `apps/runtime/test/demonstration.test.ts`: parâmetros preenchidos, segredos
  continuam referência.
- `apps/runtime/test/units.test.ts`: catálogo de skills só com os mais usados.
