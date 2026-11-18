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

## A chegada

Dois caminhos, uma caixinha: **arrastar o arquivo para cima da janela**, em qualquer tela, ou o
botão **Importar procedimento…** no alto da tela de Procedimentos — que fica ali, e não dentro de
um procedimento, porque é um arquivo chegando de fora e não daquele ali.

A caixinha mostra o nome, o domínio, a descrição e os números: `6 passos`, `2 entradas`,
`1 entrega`, `3 scripts`, `entra em N1`. Os números abrem ao clicar, um de cada vez — em especial
os scripts, que são código de outra pessoa que vai rodar nesta máquina, e que dá para ler antes.
Não há caixinha de "eu confio" nem pedido de segredo: o N1 pergunta antes de cada passo, e o
segredo o Orbi pede na hora de usar.

Três recusas fazem a importação ser segura, e todas estão em `apply-package.ts`:

| Recusa | Por quê |
|---|---|
| Não vai em cima de um procedimento que já existe | Conflito de nome é decisão da pessoa, não do Orbi: a caixinha diz, o botão desliga |
| Não toca em conceito nem fato que esta máquina já tem | A descrição de quem mandou não manda na sua; o valor que vale aqui é o seu |
| Entra em N1, sempre | `arriving()` força `autonomy: 'ask'`: autonomia é uma pessoa dando permissão ao Orbi dela |

O pacote é a **única entrada do Orbi que não foi escrita aqui nem pelo modelo**: vem de um
arquivo. Por isso o esquema (`ProcedurePackage`, em `@orbi/contracts`) é `strictObject`: um pacote
que traz `level`, `uses` ou prova foi mexido à mão e é **recusado**, não aceito e limpado em
silêncio — a pessoa precisa saber que o arquivo não é o que diz ser. Os campos que faltam ganham
valor vazio ali mesmo, para nada ser remontado campo a campo depois: remontar campo a campo é onde
campo se perde.

| Peça | O que faz |
|---|---|
| `definition/src/sharing.ts` → `readPackage`, `arriving` | a leitura do pacote contra esta máquina, e como ele nasce aqui |
| `use-cases/see-package.ts` | a caixinha: o que é e o que vai entrar, sem aplicar |
| `use-cases/apply-package.ts` | aplica, com as três recusas |
| `components/ui/importFile.ts` | abre o arquivo e recusa o que não é pacote, sem ida ao runtime |
| `components/ImportProcedure.tsx` | a caixinha |
| `App.tsx` | o arrastar na janela, que vale em qualquer tela |

## O que falta

Conflito de nome hoje é parede: a pessoa renomeia ou apaga o dela antes. Importar **como variação**
do que já existe seria o caminho natural, e precisa de uma decisão que não é técnica — qual dos dois
é a base.
