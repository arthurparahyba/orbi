# 27 · Camada de casos de uso: a funcionalidade escrita em chamadas

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

`contexts/<contexto>/use-cases/`, um arquivo por funcionalidade, uma função exportada, no nome do
domínio. O que ela faz: recebe o pedido, chama os vizinhos pela porta deles, devolve o que
aconteceu.

As regras, e `test/use-cases.test.ts` guarda todas:

1. **Não importa implementação.** Nada de `node:sqlite` ou `db/` (isso é de um repositório), nada
   de `valibot` ou texto de prompt (isso é do handler), nada de `@flue/` ou `runtime-port` (isso é
   do handler), nada de `agents/` e nenhum `repo.ts` (o caso de uso pede ao serviço).
2. **Não fala com o mundo.** Nenhum `ctx.`, nenhum `.ui(`, nenhum `tellAgent(`. O caso de uso devolve o
   que aconteceu; quem chama avisa a conversa, desenha a tela e responde ao modelo. É isso que
   deixa o mesmo caso de uso servir a ferramenta e a rota.
3. **É curto.** Passou de 25 linhas de corpo, ou tem comportamento escondido dentro, ou são duas
   funcionalidades.
4. **É exportado pelo `index.ts` do contexto**, senão ninguém de fora o alcança.

Onde **não** há camada: `trust`, `secrets`, `telemetry` e `platform` não têm nenhum handler com
três chamadas — as funcionalidades deles *são* uma chamada. Um `flows/guardar-segredo.ts` com uma
linha dentro seria pior do que não ter. **A regra é "existe caso de uso onde existe orquestração"**, não
"todo contexto ganha uma pasta".

## Como isto responde "como funciona X?"

O índice de casos de uso de cada contexto está em `docs/modulos.md`. A pergunta se responde em
dois passos: achar o nome na lista do contexto, abrir um arquivo de 15 linhas. Não é que a busca
ficou mais rápida — é que a lista existe.

A resposta tem quatro partes, e a regra está no `CLAUDE.md`, seção "Quando o desenvolvedor
pergunta como algo funciona": onde mora, um diagrama de sequência simplificado, o código do caso
de uso inteiro, e as chamadas que ele faz.

O diagrama existe para acrescentar o que o código não mostra: **onde aquele código roda**. Cada
raia leva o módulo embaixo do nome, uma raia é um salto de módulo (dois arquivos do mesmo módulo
são uma raia só), e o teto é cinco raias — os módulos que o caso de uso chama por dentro vão numa
caixa abaixo, na ordem.

A exceção à regra do salto de módulo é o **ponto de decisão**: quando entre dois participantes
não há código e sim o modelo escolhendo, eles ficam em raias separadas mesmo sendo do mesmo
módulo. No `startProcedure`, `orbi` e `playbook_start` são os dois composição e mesmo assim têm
raias próprias, porque o salto entre elas é o modelo decidindo — e é o mais importante do desenho.

Esse mesmo desenho mostra duas coisas que o código esconde: que **três das quatro raias são
composição**, e que o primeiro contexto só aparece no quarto salto. Não é acidente — é a decisão
das fases 3 e 4a do documento 26, adaptador fino do Flue fica na composição. E muda como se lê o
`Refused`: a recusa vai para o modelo, que lê e tenta outra coisa, não para uma tela de erro.

**O diagrama é montado das declarações, não do código.** As raias saem de
`agents/capabilities.ts`, do `needs` de cada capability, do índice de casos de uso em
`docs/modulos.md` e da linha de entrada em `http/app.ts`. O único arquivo de implementação que se
abre é o caso de uso que a resposta vai mostrar de todo jeito — e dele sai a caixa de baixo com
os módulos chamados.

Isso é uma propriedade da arquitetura, não um conselho: **se o `needs` mentir, o diagrama mente.**
Era o caso até a limpeza do agregado (documento 26), quando dez capabilities declaravam
`needs: ['brain']` — com aquilo, um diagrama de módulos era impossível sem ler implementação. Se
montar um diagrama exigir ler implementação, uma declaração está errada: conserte a declaração.

**E o diagrama não fica guardado em documento.** Diagrama guardado apodrece em três
funcionalidades e nenhum teste pega. O que fica guardado é o índice, as declarações e a regra —
os três são verificáveis.

E no combinado (CLAUDE.md), antes de implementar uma funcionalidade nova, entra um item:
**mostrar a função de caso de uso**, assinatura e corpo em chamadas. É esse o código que o
desenvolvedor quer revisar, e ele é curto o bastante para caber num combinado.

## Amostra (feita)

Dois casos de uso em `procedures`, os do exemplo que motivou o documento:

- **`findSimilarProcedures`** (`use-cases/find-similar.ts`) — "já sei algo parecido?". Busca os
  candidatos, acha as variações de cada um no conjunto e devolve o que a decisão precisa. Lista
  vazia quer dizer "nada parecido: siga normalmente".
- **`startProcedure`** (`use-cases/start-procedure.ts`) — começar a rodar um procedimento. Acha o
  procedimento, confere a ordem na esteira, abre a execução, avisa a esteira, e devolve o passo 0,
  o que já se tentou e o estado da prova. Ou a recusa, com o motivo.

Os dois handlers viraram o que deviam ser: schema, descrição, **uma chamada** e a moldagem do que
o modelo lê — e a moldagem ficou marcada com um comentário, para não voltar a se misturar.

A segurança desta refatoração não vem do compilador: vem dos **24 arquivos de teste de caso de uso, 39
cenários de ponta a ponta** que exercitam esses handlers pelo provedor falso, sem saber nada da
estrutura interna.

## A fazer

| Contexto | Casos de uso |
|---|---|
| `tools` | 11 |
| `procedures` | 9 (2 feitos) |
| `talk` | 4 |
| `knowledge` + `learning` | 2 |
| `models` | 1 |
| rotas da composição | ~4 |
