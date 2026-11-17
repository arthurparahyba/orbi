# 30 · Compartilhar um procedimento

Um procedimento aprendido serve a mais de uma pessoa. Quem aprendeu a publicar a versão no portal
aprendeu uma vez; o time inteiro faz aquilo toda semana. Daí **exportar**: um arquivo que a pessoa
manda, e que no Orbi de quem recebe volta a ser um procedimento.

O que paga a complexidade é o corte, e o corte é uma frase:

> **Vocabulário viaja, dados não.**

## O que viaja

O que o procedimento **é**: os passos com o texto de cada um, as instruções, o gatilho, as
entradas, a entrega, os scripts com o código, e os **conceitos** que as entradas citam. O conceito
viaja porque sem a palavra `Ambiente` o passo que diz `{{ambiente}}` não quer dizer nada — é
vocabulário, não dado: o tipo diz o que é um ambiente, não qual é o seu.

Dos segredos viajam **só os nomes** (`portal/senha`). O valor nunca sai do cofre, e quem recebe não
precisa dele no arquivo: o Orbi pede o segredo na hora de usar (`ask_secret`, e o cartão grava
direto no cofre). Era uma porta já trancada; o pacote não precisa trancá-la de novo.

## O que fica, e por quê

| Fica | Por quê |
|---|---|
| `level`, `levelMax`, `levelBy`, `autonomy` | Autonomia é uma pessoa dando permissão ao Orbi dela. 18 execuções aqui não dizem nada sobre lá: **entra em N1**. |
| `uses`, `successes`, `cleanStreak`, `testedRun` | O histórico é desta máquina. |
| `learnedFrom`, `variationOf`, `updatedAt` | A conversa em que você ensinou e as ligações do seu cérebro só existem aqui. |
| `playbook_proofs` | Prova é "rodou como está escrito, **nesta** máquina". |
| Valor de segredo | Nunca sai do cofre. |

Os fatos são **escolha**, um por um, com o que cada um revela escrito do lado: a decisão só é
informada se o valor aparecer antes dela. O padrão é não mandar nenhum — e é padrão, não conselho.
Os aprendizados dos passos também são opcionais: úteis, mas citam os seus sistemas pelo nome.

## Onde mora

| Peça | O que faz |
|---|---|
| `procedures/definition/src/sharing.ts` | o corte, puro: `SHARED_FIELDS`, `LEFT_BEHIND`, `shareable`, `secretsNamedIn`, `packageOf` |
| `procedures/use-cases/export-procedure.ts` | monta o pacote, só em chamadas |
| `procedures/use-cases/exportable-facts.ts` | os fatos que podem ser escolhidos, com o que cada um revela |
| `knowledge/http.ts` | `GET /api/brain/playbooks/:name/share` (o que vai e o que fica) e `POST` (gera) |
| `overview.ts` → `writeShared` | escreve o arquivo em `config.shareDir`; disco é da composição |
| `views/brain/PlaybookShare.tsx` | o painel, dentro do procedimento aberto |

Na tela: Cérebro › Procedimentos › abrir um › **Exportar…**, ao lado de Editar e Apagar — porque
exportar é sempre **deste** procedimento, não da tela.

## A trava

O risco desta funcionalidade não é um bug, é um vazamento: alguém acrescenta um campo ao
`Playbook` e ele viaja de carona. Por isso as duas listas são explícitas, e
`test/export-procedure.test.ts` cobra que **todo** campo do `Playbook` esteja em uma delas. Um
campo novo não escolhe sozinho de que lado fica: ou vai para `SHARED_FIELDS`, ou vai para
`LEFT_BEHIND` com o porquê escrito — e o porquê é o que a tela mostra à pessoa.

## O que falta

A importação: ler o arquivo (arrastado na janela ou escolhido pelo botão **Importar
procedimento…** no alto da tela), mostrar uma caixinha com o nome, o domínio, a descrição e os
números — `6 passos`, `2 entradas`, `1 entrega`, `3 scripts`, `entra em N1` —, e aplicar. O
formato tem versão (`orbi: 1`) para que quem importa recuse o que não souber ler.
