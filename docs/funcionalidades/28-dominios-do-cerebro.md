# 28 · Domínios do cérebro

O cérebro era um só. Receita de bolo, deploy na AWS e compra de Natal entravam do mesmo jeito, no
mesmo lugar, e se houvesse correlação entre duas delas ele correlacionava. Na prática existem
assuntos diferentes: playbooks de infraestrutura na AWS, playbooks de front-end em React,
playbooks de preencher GMUD no ServiceNow. Um domínio é esse assunto.

## A palavra

**Domínio**, não "contexto": contexto já são os doze contextos da arquitetura (documento 26), e
confundir os dois estragaria o vocabulário que o documento 26 existe para firmar. No código,
`domain`.

## Por que não é só apresentação

O passo 0 de um procedimento transforma o que o desenvolvedor digitou num fato do cérebro. A linha
que decide, em `procedures/definition/src/concepts.ts`:

```ts
const matches = facts.named(input.concept, value);
if (matches.length === 1) resolved[input.name] = { value, entity: matches[0].id, learned: 'known' };
```

Um resultado e ele resolve **em silêncio**. Com dois assuntos no mesmo cérebro, um `Ambiente`
chamado "producao" de um projeto antigo casa sozinho e o procedimento roda com o fato errado — sem
perguntar nada, porque do ponto de vista dele a resposta foi única. Hoje isso não acontece por
sorte: o cérebro ainda é pequeno. Domínio é escopo de busca, e escopo de busca aqui é correção.

Onde mais o escopo entra: `brain_query` com texto, `playbook_similar`, e a leitura dos tipos que já
existem antes de criar um tipo novo (ler 9 tipos do domínio em vez de 30 do cérebro faz duplicar
menos).

## O que foi descartado

- **Domínio declarado à mão.** Trabalho manual sem retorno imediato não é feito; apodrece em duas
  semanas.
- **Domínio inferido do grafo** (agrupamento por proximidade). Zero trabalho, mas o nome e os
  limites mudam a cada fato novo, e não se conversa sobre algo cujo nome muda sozinho.

## O mecanismo: o domínio é o rastro do trabalho

Nem declarado, nem calculado: **herdado**. A cadeia está em
`knowledge/use-cases/suggest-domain.ts`, em ordem de precedência:

1. **O tipo tem domínio?** → esse. Um fato herda o domínio do tipo dele, não o de quem o achou.
2. **O tipo já tem fato em dois ou mais domínios?** → `comum`. Um tipo espalhado é de todos.
3. **Tem execução rodando?** → o domínio do playbook que está rodando.
4. **A conversa olhou fatos de um domínio só?** → esse. Empate não decide nada: cai na regra
   seguinte, melhor do que escolher por ordem alfabética.
5. **Nada aponta?** → propõe criar um domínio, com nome vindo do que a conversa usou (um endereço,
   um programa), ou fica `comum`.

A regra que sustenta tudo: **o modelo nunca escolhe o domínio.** Ele herda e diz por quê, e o
desenvolvedor corrige no cartão que ele já aprova hoje. Um modelo livre para nomear domínios
inventa `aws`, `infra-aws` e `AWS` em três turnos — e aí morre justamente o vocabulário que o
domínio existe para salvar. Criar domínio é proposta no portão, como qualquer aprendizado.

**O playbook também é do domínio**, e nos dois sentidos: ele nasce no domínio dos fatos que
descobriu, e os fatos que ele descobre nascem no dele. É um mecanismo só.

## Casa e pontes: domínio não é parede

Uma partição rígida briga com a realidade. `conta-aws-prod` importa para o deploy **e** para a GMUD
no ServiceNow. Exclusivo, o playbook da GMUD não vê a conta; etiqueta livre, a separação some.

Um fato tem **uma casa** (onde nasceu, singular, nunca muda em silêncio) e **empréstimos**. O
alcance de um domínio é: ele + `comum` + o que ele já emprestou antes. Um domínio novo vê só a si
mesmo e cresce as pontes pelo uso.

A ponte **não tem tabela**: é uma relação cujas pontas têm domínios diferentes, derivada do grafo
que já existe. Relação com `comum` não é ponte — `comum` já está no alcance de todo mundo, então
atravessar para lá não atravessa nada (`test/domains.test.ts` guarda essa regra, e ela falha de
verdade se a consulta for escrita com `COALESCE`).

Ponte muito usada é sinal: ou o fato é de verdade `comum`, ou os dois domínios são um só. O Orbi
sugere, o desenvolvedor decide.

## `comum` é nulo no banco

Quem não tem domínio é `comum`, e o banco guarda nulo em vez de uma linha chamada comum. Duas
consequências boas: a migração não precisou adivinhar nada sobre os fatos que já existiam, e apagar
um domínio devolve o que era dele para `comum` sem apagar conhecimento.

## As fases

- **A** — feita. O domínio existe, é sugerido e herdado, e a tela mostra. Nenhuma busca mudou.
- **B** — feita. O escopo entra no passo 0 e, com cuidado diferente, nas outras duas buscas.
- **C** — feita. Procedência estruturada de cada dado (abaixo).
- **D** — feita. O procedimento que atualiza um dado (abaixo).

## O que a fase A2/A3 ensinou

**Não existe "fato sem domínio" para arrumar.** Desenhando a tela eu pus um aviso "3 fatos sem
domínio" com um botão "marcar como comum" — e o botão não fazia nada, porque `comum` **é** nulo.
Com nulo significando comum, não há como distinguir "ainda não decidi" de "comum de propósito", e
não precisa haver: o que vale revisar é o **desacordo** — fato comum cujo tipo é de um domínio,
contra a regra 1. Esses são os de antes dos domínios, e pôr cada um no domínio do tipo é aplicar a
regra 1 para trás. É a migração dos fatos que já existiam, e ela é um clique.

**O upsert reconstruía o objeto campo por campo e deixava o `domain` cair.** `Facts.upsertType`
monta um objeto novo (`name`, `description`, `relations`, `requires`, `props`, `knows`) e o
`domain` não estava na lista: um tipo criado com domínio nascia sem. O banco estava protegido
(`COALESCE(excluded.domain, types.domain)` preserva o que já existe), mas a inserção de um tipo
novo não — e é justamente o caso que importa. O teste de rota pegou. Mesma classe de erro da fase
4b, quando a porta `FactsForRun` deixou o `ftsQuery` para trás: **quando um campo novo entra num
tipo, todo lugar que reconstrói aquele tipo campo por campo é um lugar onde ele cai.** Ficou
corrigido nos dois (`upsertType` e `mergeEntity`), e nos dois a regra é a mesma: quem já tem
domínio não o perde por um aprendizado que não fala dele.

## C e D · A procedência e a atualização de cada dado

A segunda metade do problema não é o conceito, é **o dado abaixo do conceito**. Ensinando um
playbook de acessar a AWS, muita coisa vai para o cérebro de uma vez: `Conta`, `Ambiente`,
`Cluster`, `Servico`, `LoadBalancer` como conceitos, e abaixo deles o número da conta, o nome do
cluster, o ARN do load balancer. Uma vez no cérebro, aquilo **vira verdade e ninguém atualiza** —
nem se sabe como atualizaria.

### O que já existe, e que isso aproveita

`types.knows` (`Record<string, string>`: nome → como) já diz, em prosa, como se sabe cada coisa de
um tipo, e **já é usado**: `knows.achar` é lido pelo passo 0 (`concepts.ts:199`,
`execution/src/service.ts:202`, que o entrega como `howToFind`). Então a camada pedida não é um
eixo novo: é promover `knows` de prosa para procedimento, e dar fonte ao dado.

`run_calls` já registra toda chamada de uma execução — ferramenta, resumo dos argumentos, passo,
quando — e de propósito **não guarda o conteúdo da resposta**. Quem produziu a informação é
conhecido no momento em que ela é aprendida.

### A decisão que isso torna possível

**A fonte não é escolhida pelo modelo: é derivada da chamada que produziu o dado.** O
`run_command` sabe o programa, os argumentos e o perfil; o `browser_read` sabe o endereço; o cofre
sabe o nome do segredo. Quando o `brain_learn` acontece dentro de uma execução, a proposta carrega
a fonte vinda da última chamada que gerou aquele texto. É o mesmo princípio do domínio — herdado,
não inventado —, e é por isso que funciona para o que a LLM **não** tem como saber: qual página da
documentação interna da empresa disse que é assim.

Fonte estruturada, em vez do `source` em texto livre que existe hoje (`"cartao:<conversa>"`,
`"execucao:<run>"`, `"tela"`):

| Tipo de fonte | O que guarda |
|---|---|
| `cli` | programa, argumentos, perfil ou variável de ambiente |
| `page` | o endereço, e quando foi visto |
| `file` | o caminho, no repositório ou na máquina |
| `person` | quem disse, e em qual conversa |
| `screen` | o desenvolvedor digitou |

Mais `checkedAt`: quando aquele valor foi conferido pela última vez. A tela do Cérebro passa a
poder dizer "veio desta página, vista em 12/08" e "não é conferido há 3 meses".

### O mini playbook: o que ele é, e o que ele não é

**É um playbook normal**, com um parâmetro do conceito. `atualizar-conta-aws(conta: Conta)` roda
`aws sts get-caller-identity --profile <perfil>`, compara com o que está no cérebro e propõe a
atualização pelo portão de sempre. Nada de maquinaria nova: o passo 0 já resolve uma entidade como
entrada, o portão já aprova mudança de fato, e a prova de passo já existe.

**Fica no tipo, não no fato.** `conta-aws-dev`, `conta-aws-hom` e `conta-aws-prod` se atualizam
todas do mesmo jeito, mudando o perfil. Receita por fato duplicaria por três e envelheceria em
três lugares. Então: `types.knows.atualizar` aponta para o nome de um playbook, e o fato carrega
só os parâmetros e o `checkedAt`.

**Não é obrigatório.** Exigir receita para todo fato explodiria o custo de aprender, e a maioria
viria vazia ou errada. Um tipo ganha receita quando merece: quando um fato dele causou uma falha,
ou quando o desenvolvedor pede.

### O caso que paga a complexidade

"Foi acessar o log de um serviço do cluster da aplicação X e o log group não existe mais." Hoje
isso é uma falha e ponto. Com C e D, o caminho é mecânico:

1. o diagnóstico (que já existe: `diagnoses`, `knownProblemsFor`) vê que o passo falhou;
2. pergunta quais fatos aquele passo usou — e isso o `run_calls` mais as citações do passo já
   dizem;
3. desses fatos, quais têm tipo com `knows.atualizar`;
4. roda a receita, compara, e propõe a atualização pelo portão;
5. tenta o passo de novo, uma vez.

É um procedimento que conserta o próprio insumo, e é o motivo de C e D valerem a complexidade que
o próprio pedido reconheceu ter.

### O que a fase C ensinou

**O carimbo tem de apagar, não só substituir.** Minha primeira versão punha a procedência só
quando havia o que pôr (`...(by.foundIn ? { foundIn, checkedAt } : {})`). Quando a chamada não
trazia procedência nenhuma, o que o **modelo** tinha escrito no campo sobrevivia — exatamente o
caso que a regra existe para impedir: o modelo dizendo de onde veio uma informação que ele não foi
buscar. O teste ponta a ponta pegou, porque ele escreve de propósito uma procedência falsa
(`{ kind: 'person', ref: 'eu lembro de cabeça' }`) e confere que ela some. Agora o carimbo
sobrescreve sempre, inclusive com nada.

**Procedência é do fim da chamada, não do começo.** Eu carimbava em `recordCallStart`, onde os
argumentos estão. Mas uma chamada que pediu aprovação e ficou esperando, ou que foi recusada, não
trouxe informação nenhuma do mundo: não é fonte de nada. Agora a procedência fica guardada **com**
a chamada em `startCall` e só passa a valer em `recordCallEnd`, se ela executou. E a promoção
acontece antes do retorno antecipado que existe para chamadas fora de execução — senão a
procedência só funcionaria dentro de uma execução, e ensinar acontece fora dela, que é justamente
onde se aprende mais.

**Nada guardado é uma resposta.** Uma chamada que não traz informação nova do mundo — tirar uma
foto da página que já está aberta, pedir a lista de playbooks — deixa valendo a procedência
anterior da conversa. A foto é daquela página mesmo. Por isso `foundInOf` devolve `undefined` em
vez de um registro vazio, e o store só sobrescreve quando há algo.

**`ask_secret` está de propósito fora.** Nem o nome de um segredo vira rastro.

**O que ficou impreciso, e eu prefiro dizer:** um comando que executou mas terminou com erro
(`cat` num arquivo que não existe) conta como procedência, porque o Orbi distingue "a chamada da
ferramenta falhou" de "o programa saiu com código diferente de zero". Na prática o modelo não
deveria aprender fato de um comando que falhou; se isso aparecer, o lugar de arrumar é aqui.

### O que a fase D ensinou

**A receita ganhou campo próprio, e não a chave `knows.atualizar`.** Eu havia proposto pendurá-la
em `knows` (`Record<string, string>`, nome → como, em prosa). Escrevendo, ficou claro que um leitor
não distinguiria prosa de referência: `knows.achar` é uma frase, `knows.atualizar` seria um nome de
procedimento. São coisas diferentes e agora têm campos diferentes: `OntologyType.refresh` é o nome
do procedimento, e `knows` continua sendo prosa.

**A receita apontando para procedimento que não existe tem de ser dita, não calada.** `howToRefresh`
recusa com `receita-nao-existe` e diz para onde o tipo aponta. Um tipo que diz saber se conferir e
não sabe é pior do que um tipo que não diz nada, porque promete.

**O laço é um campo no resultado de uma ferramenta, não um mecanismo novo.** Quando um passo é dado
como `failed`, o `reportStep` devolve `canRefresh`: os fatos daquela execução cujo tipo tem receita.
Os fatos que o passo usou já estavam ali — são as entradas resolvidas da execução, guardadas desde
o passo 0. A ferramenta `playbook_step` passa a lista ao modelo com uma dica dizendo o que fazer:
rodar o procedimento pelo `playbook_start`, que já passa pelo portão, e nunca mudar o fato por
conta própria. Nenhum caso de uso executa procedimento nem fala com a conversa.

**O que não foi feito de propósito:** nada roda sozinho. O Orbi não reconfere, não repete o passo e
não atualiza o fato sem passar pelo cartão. A autonomia disso é decisão para depois de o laço
existir e ser visto funcionando — e é o tipo de coisa que, posta cedo, faz o Orbi insistir em
caminhos errados com confiança.

### O que a fase B ensinou

**O alcance tem direção.** O alcance de um domínio é ele, `comum`, e os domínios para os quais os
fatos **dele** já apontaram. Um vizinho que usa um fato meu não me dá acesso ao dele: sem essa
assimetria, duas pontes encadeadas devolveriam o cérebro inteiro em dois saltos, que é exatamente o
que o escopo existe para impedir. `reach(null)` é só `[null]`: quem não é de assunto nenhum não
enxerga assunto nenhum em particular.

**O passo 0 foi o único lugar onde filtrar é seguro.** Lá, mostrar demais é erro silencioso: com um
resultado só, a entrada é resolvida sem perguntar nada. Nos outros dois lugares, esconder é pior do
que mostrar demais, e eles foram tratados diferente:

- **`brain_query` por texto** filtra **só quando há procedimento rodando** (pelo domínio dele) e
  responde `foraDoAlcance: N` quando deixou algo de fora. Nunca esconde em silêncio: quem recebe
  fica sabendo que há mais cérebro e pode pedir.
- **`playbook_similar` não filtra nada.** Reaproveitar um procedimento de outro assunto é decisão,
  não erro — mas é decisão que precisa ser vista, então cada candidato passou a levar o domínio.
  Filtrar ali quebraria o caso que mais importa: ensinar um procedimento novo, quando ainda não
  existe domínio para comparar.

**Um procedimento sem domínio continua lendo o cérebro todo.** `lookupIn(undefined)` mantém o
comportamento antigo. É a diferença entre uma mudança que acrescenta e uma que quebra: os
procedimentos que existiam antes dos domínios não perderam nada, e ganham escopo quando alguém os
situa.

### A ordem recomendada

**C antes de D, e C antes de B.** C é quase de graça (a fonte já é conhecida no momento da
escrita, só não é guardada estruturada) e dá valor sozinha: saber de onde veio um dado é útil mesmo
sem receita nenhuma. D depende de C para saber o que atualizar, e vale primeiro só para os tipos
que já causaram falha.
