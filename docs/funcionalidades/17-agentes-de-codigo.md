# 17. Agentes de código desta máquina

## Para que serve

Quando uma esteira ou um procedimento quebra por causa de código (um teste, a
cobertura, a compilação), o Orbi pede a um **agente de código instalado na
máquina** (Claude Code, Cursor, Devin…) para investigar ou corrigir. O agente
trabalha numa **cópia descartável** do repositório; quem aplica a correção é o
Orbi, pelas regras de autonomia.

Cada **tarefa** tem o seu agente e o seu modelo:

| Tarefa | Quando | Exemplo |
| --- | --- | --- |
| **Investigar** | Erro que o Orbi não conhece (nenhum problema conhecido serve) | Claude Code · `claude-haiku-5-5` |
| **Corrigir** | Erro conhecido: o cérebro já sabe a solução | Cursor · GPT Luna |

Não confundir com o documento 15: lá são os agentes que **pedem coisas ao Orbi**
pelo MCP. Aqui são os agentes que **o Orbi chama** para mexer em código.

## Onde aparece

- **Autonomia → Agentes de código**: as duas tarefas com agente e modelo, a lista
  "Nesta máquina" (comando, modelos, situação do último teste, Testar, Editar,
  Remover) e botões para começar por um agente conhecido.
- **Autonomia → Capacidades**: a linha "Agente de código" resume quem faz cada
  tarefa (`GET /api/health` → `codeAgent`).

## Como funciona

### Cadastro

Um agente é um **comando de uso único** que roda no terminal do desenvolvedor
(Git Bash no Windows), sem janela, dentro da cópia:

```
claude -p --model {modelo} -- {prompt}
```

- `{prompt}` é onde entra o pedido; sem ele, o pedido vai no fim.
- `{modelo}` é onde entra o modelo da tarefa. Sem modelo escolhido, a opção que
  o carrega (`--model {modelo}`) sai da linha e o agente usa o padrão dele.
- O comando roda **um programa só**: `;`, `&&`, `|` e `$(…)` fora de aspas são
  recusados ao salvar (`code-agents/command.ts`).

O **catálogo** (`code-agents/catalog.ts`) traz os agentes que o Orbi já sabe
chamar (Claude Code, Cursor, Devin). É dado, não código: aparece como sugestão
("Adicionar Devin") e só vale depois de cadastrado.

**Testar** manda um pedido curto ("responda só ok") numa pasta vazia e guarda o
resultado: confirma instalação, login e que o agente não fica esperando uma
tecla. Gasta um pedido da conta do agente, por isso só roda quando você clica.

### `ORBI_CODE_AGENT` (o jeito antigo)

Continua valendo enquanto nenhuma tarefa tiver agente cadastrado: aparece na
lista como "(do .env)" e faz as duas tarefas.

### O executor

`code-agents/fixer.ts` cria uma git worktree descartável da branch, roda o
agente da tarefa com o pedido de **investigar** ou de **corrigir** e devolve os
arquivos alterados, o diff e o resumo do agente, com quem fez e com qual
modelo. O agente não faz commit nem push; não vê credenciais; não grava no
cérebro. Subir é outro passo, pelo portão (`code_agent_push_fix`), e descartar
remove a cópia.

## Peças

| Peça | Arquivo |
| --- | --- |
| Tipos, catálogo, linha de comando | `apps/runtime/src/code-agents/{types,catalog,command}.ts` |
| Cadastro e tarefas | `apps/runtime/src/code-agents/registry.ts` (`CodeAgents`) |
| Teste do agente | `apps/runtime/src/code-agents/tester.ts` |
| Executor na cópia | `apps/runtime/src/code-agents/fixer.ts` |
| Ferramentas do Orbi | `apps/runtime/src/agents/tools/code.ts` |
| API | `apps/runtime/src/http/routes/code-agents.ts` |
| Tela | `apps/desktop/src/views/autonomy/codeAgents/` |
| Tabelas | `code_agents`, `code_agent_tasks` (migração 16, `docs/banco.md`) |

## API

| Rota | O que faz |
| --- | --- |
| `GET /api/code-agents` | Agentes, tarefas e catálogo |
| `PUT /api/code-agents/:id` | Cadastra ou muda um agente (`SaveCodeAgent`) |
| `DELETE /api/code-agents/:id` | Remove (e tira das tarefas) |
| `PUT /api/code-agents/tasks/:task` | Agente e modelo da tarefa (`agent: null` limpa) |
| `POST /api/code-agents/:id/test` | Pedido curto ao agente; guarda o resultado |

Mudanças viram o evento `code-agents`.

## Limites

- O agente precisa ter um modo de uso único (responde e sai). Um agente que só
  funciona interativo fica esperando até o limite de tempo.
- Nem todo agente deixa escolher o modelo pela linha de comando; nesse caso a
  lista de modelos fica vazia e vale o padrão dele.

## Testes

- `apps/runtime/test/code-agents.test.ts`: linha de comando com pedido e modelo,
  validação do comando, catálogo, cadastro e tarefas, o `.env` como reserva, a
  API e um agente de verdade (um script) corrigindo numa cópia.
- `apps/desktop/test/codeAgents.test.ts`: situação, tarefas, catálogo e modelos.
