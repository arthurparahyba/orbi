# 27 · Camada de fluxos: a funcionalidade escrita em chamadas

## O problema

Quando o desenvolvedor pergunta como uma funcionalidade funciona, o que ele quer ler é o
algoritmo: o método que recebe o pedido e faz chamadas, uma depois da outra, no nível mais
abstrato. Não o SQL, não a chamada de biblioteca, não a montagem do JSON — a **orquestração**.

Esse código existia, e estava no lugar errado.

A medição: de **110 handlers** (ferramentas e rotas), só **31 fazem três ou mais chamadas de
serviço** — esses são os que têm orquestração de verdade. E ela morava dentro do handler da
ferramenta, em `agents/tools/` (1.694 linhas em 16 arquivos), onde cada arquivo é quatro coisas ao
mesmo tempo: o adaptador do Flue, o schema da ferramenta, o texto do prompt e o algoritmo.

O `playbook_start` era o exemplo exato: nove chamadas em ordem, legíveis — entre 30 linhas de
schema e descrição, e seguidas de um construtor de JSON com seis `...(cond ? x : {})`.

E um contexto já tinha resolvido isso sozinho: `reviewConversation`, em
`contexts/improvement/review/src/review.ts`, é uma função livre que recebe o que precisa, faz só
chamadas e tem o nome do domínio. A aplicação chegou no formato na sua funcionalidade mais
complicada; o que faltava era **nome, lugar e regra**.

## A camada

`contexts/<contexto>/flows/`, um arquivo por funcionalidade, uma função exportada, no nome do
domínio. O que ela faz: recebe o pedido, chama os vizinhos pela porta deles, devolve o que
aconteceu.

As regras, e `test/flows.test.ts` guarda todas:

1. **Não importa implementação.** Nada de `node:sqlite` ou `db/` (isso é de um repositório), nada
   de `valibot` ou texto de prompt (isso é do handler), nada de `@flue/` ou `runtime-port` (isso é
   do handler), nada de `agents/` e nenhum `repo.ts` (o fluxo pede ao serviço).
2. **Não fala com o mundo.** Nenhum `ctx.`, nenhum `.ui(`, nenhum `tellAgent(`. O fluxo devolve o
   que aconteceu; quem chama avisa a conversa, desenha a tela e responde ao modelo. É isso que
   deixa o mesmo fluxo servir a ferramenta e a rota.
3. **É curto.** Passou de 25 linhas de corpo, ou tem comportamento escondido dentro, ou são duas
   funcionalidades.
4. **É exportado pelo `index.ts` do contexto**, senão ninguém de fora o alcança.

Onde **não** há camada: `trust`, `secrets`, `telemetry` e `platform` não têm nenhum handler com
três chamadas — as funcionalidades deles *são* uma chamada. Um `flows/guardar-segredo.ts` com uma
linha dentro seria pior do que não ter. **A regra é "existe fluxo onde existe orquestração"**, não
"todo contexto ganha uma pasta".

## Como isto responde "como funciona X?"

O índice de fluxos de cada contexto está em `docs/modulos.md`. A pergunta se responde em dois
passos: achar o nome na lista do contexto, abrir um arquivo de 15 linhas. Não é que a busca ficou
mais rápida — é que a lista existe.

E no combinado (CLAUDE.md), antes de implementar uma funcionalidade nova, entra um item: **mostrar
a função de fluxo**, assinatura e corpo em chamadas. É esse o código que o desenvolvedor quer
revisar, e ele é curto o bastante para caber num combinado.

## Amostra (feita)

Dois fluxos em `procedures`, os do exemplo que motivou o documento:

- **`findSimilarProcedures`** (`flows/find-similar.ts`) — "já sei algo parecido?". Busca os
  candidatos, acha as variações de cada um no conjunto e devolve o que a decisão precisa. Lista
  vazia quer dizer "nada parecido: siga normalmente".
- **`startProcedure`** (`flows/start-procedure.ts`) — começar a rodar um procedimento. Acha o
  procedimento, confere a ordem na esteira, abre a execução, avisa a esteira, e devolve o passo 0,
  o que já se tentou e o estado da prova. Ou a recusa, com o motivo.

Os dois handlers viraram o que deviam ser: schema, descrição, **uma chamada** e a moldagem do que
o modelo lê — e a moldagem ficou marcada com um comentário, para não voltar a se misturar.

A segurança desta refatoração não vem do compilador: vem dos **24 arquivos de teste de fluxo, 39
cenários de ponta a ponta** que exercitam esses handlers pelo provedor falso, sem saber nada da
estrutura interna.

## A fazer

| Contexto | Fluxos |
|---|---|
| `tools` | 11 |
| `procedures` | 9 (2 feitos) |
| `talk` | 4 |
| `knowledge` + `learning` | 2 |
| `models` | 1 |
| rotas da composição | ~4 |
