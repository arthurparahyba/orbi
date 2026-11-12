# 22. Fatos sem repetição e passos que consultam o Cérebro

Decidido em 12/11 com o desenvolvedor. Complementa o documento 19 (revisão de conhecimento).

## O problema

1. **Fatos repetidos ou apagados.** No fim de uma execução, o revisor de conhecimento propunha
   fatos sem saber direito o que o Cérebro já tinha: só via os fatos das entradas resolvidas no
   passo 0, e evitar repetição dependia do modelo. Com um id diferente para a mesma coisa
   (`pagamentos` e `pagamentos-api`), o fato duplicava. Com o mesmo id, aprovar **trocava o fato
   inteiro**: as propriedades e os apelidos que ele tinha sumiam, sem aparecer no cartão.
2. **Investigar de novo o que já sabe.** Um passo como "consultar no GitHub o repositório da
   aplicação" rodava toda vez, mesmo depois de o Cérebro ter guardado a resposta.

## Como fica

### Cada fato proposto é comparado com o Cérebro (pelo runtime)

| O revisor propõe | O runtime vê | O que acontece |
|---|---|---|
| `pagamentos-api` · banco = `pag-db` | O fato existe e não tem banco | **Acrescenta** banco; o resto continua |
| `pagamentos` · banco = `pag-db` | Outra Aplicação com esse nome ou apelido, ou com o mesmo valor | **É o mesmo que `pagamentos-api`**: vira acréscimo nele, com `pagamentos` como apelido |
| `pagamentos-api` · repositório = o mesmo de hoje | Igual ao guardado | **Já sei**: sai da proposta |
| `pagamentos-api` · repositório = outro | Valor diferente | **Muda**: `org/pagamentos-api` → `org/pagamentos-v2` |
| algo que não existe | — | **Novo** |

- Regras puras em `brain/domain/fact-match.ts` (`classifyEntity`, `mergeEntity`).
- **Aprender acrescenta, não substitui**: ao aplicar um fato aprendido, as propriedades se somam
  (as do aprendizado ganham), os apelidos se juntam e o texto antigo fica se o novo vier vazio.
  Editar na tela do Cérebro continua substituindo (é você quem edita).
- A mesma checagem vale para o `brain_learn` do Orbi: propor como fato novo algo que **é o mesmo**
  que um fato existente volta ao modelo antes do cartão ("use o id `pagamentos-api` e ponha
  `pagamentos` em `aliases`").
- O revisor passa a ver os fatos que o Cérebro já tem dos conceitos (não só os tocados) e os
  passos do procedimento.
- No cartão, cada fato que já existe diz o que muda nele ("acrescenta banco = pag-db",
  "muda repositório: a → b").

### O passo que achou o fato passa a consultar o Cérebro primeiro

O revisor diz de qual passo veio cada fato (as saídas que ele lê já vêm marcadas com o passo).
Quando um fato veio de um passo que ainda não consulta o Cérebro, a mesma revisão propõe, **no
mesmo cartão**, mudar esse passo:

- Hoje: "Consultar no GitHub o repositório da aplicação informada."
- Depois: "Consultar no Cérebro o repositório da aplicação informada. Se não houver, consultar no
  GitHub."

Um sem o outro não resolve: guardar sem mudar o passo deixa o GitHub sendo consultado; mudar o
passo sem guardar não acha nada. Por isso é um cartão só.

- Só os passos de onde vieram fatos podem mudar: o runtime registra esse escopo
  (`brain.review.scopeChange`) e o `brain_learn` recusa mexer em outros, como na revisão do fim.
- Um passo já "consulta o Cérebro" quando o `how` cita o Cérebro (`cérebro`, `brain_query`): aí
  não se propõe de novo.
- Fato que já está guardado, num passo que ainda vai direto à fonte (procedimento antigo): só a
  mudança do passo é proposta.
- Na próxima execução, o passo manda consultar o Cérebro (`brain_query`); se houver resposta, a
  fonte não é consultada.

## Peças

| Arquivo | Papel |
|---|---|
| `brain/domain/fact-match.ts` | Comparar um fato proposto com o Cérebro e juntar os dois |
| `brain/store.ts` (`apply`) | Fato aprendido acrescenta em vez de substituir |
| `agents/revisor.ts`, `review/knowledge.ts` | Passo de origem, classificação, o que o Cérebro já sabe, escopo e instrução |
| `agents/tools/brain.ts` | `brain_learn` recusa fato que é o mesmo que um existente |
| `desktop/components/ui/LearningParts.tsx` | O cartão diz o que muda num fato existente |

## Testes

- `apps/runtime/test/fact-match.test.ts`: novo, acrescenta, muda, já sei, é o mesmo (por nome,
  apelido ou valor); juntar sem perder propriedades nem apelidos.
- `apps/runtime/test/flow-knowledge-steps.test.ts`: execução que consulta a fonte; o revisor
  acha o repositório no passo 1; o cartão traz o fato e o passo 1 mudado; aprovar não apaga o
  que o fato tinha; a próxima revisão não propõe de novo.
