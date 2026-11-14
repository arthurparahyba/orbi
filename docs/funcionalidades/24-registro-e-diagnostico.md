# 24. Registro da execução e diagnóstico do Orbi

Decidido em 13/11 com o desenvolvedor. Protótipo (telas A a F):
https://claude.ai/artifact/AqyyCGi56FKhFZmFdWFQ29

**Feito (fases 1, 2 e 4):** o registro da execução, a tela de detalhes com "Copiar execução
completa", a marca de leitura cara, os detectores, as três categorias e a issue (pelo `gh`, com a
página do GitHub como reserva). **Ainda não implementado:** o diagnóstico escrito pelo modelo ou
pelo agente instalado (fase 3).

## O problema

Quando uma execução dá trabalho, não há onde ver o que aconteceu. A tela de Execuções mostra o
status e uma bolinha por passo. Para achar os defeitos do documento 23 foi preciso copiar a
conversa (que corta os trechos longos) e ler o código. E a revisão do fim olha só o
procedimento: um defeito do Orbi vira, por engano, pedido de mudança no procedimento.

## Como fica

Três camadas, cada uma útil sozinha.

### A. Registro da execução

Cada chamada de ferramenta feita dentro de uma execução fica guardada, limpa de credenciais:

| Campo | Exemplo |
|---|---|
| ferramenta e resumo dos argumentos | `browser_act evaluate_script → saida/p.json` |
| passo em que contou | `extrair` |
| duração, resultado | 2,4 s · ok / erro (primeira linha) |
| tamanho da resposta e quanto foi ao modelo | 81.204 · 300 |
| aprovação | pedida, aprovada, negada, sozinha |
| marcas | cortado, recusado depois de aprovado, chamada errada, recuperado |

Antes isso estava espalhado e em parte só na memória (`tool-outcomes.ts`, `run-observations.ts`,
`deviations` e `actions` da execução). O registro é a tabela `run_calls`, escrita pela telemetria
das ferramentas (`tool_start` e `tool`) e pelo portão. O **conteúdo** das respostas não é
guardado: só o tamanho, o resumo dos argumentos (uma linha curta) e a primeira linha do erro.

A linha é escrita quando a chamada **começa**, então um turno que morre no meio deixa o rastro.
A chamada que abre a execução (`playbook_start`) ainda não tem execução quando começa: a linha
dela é escrita quando ela termina, na execução que criou. O passo de uma chamada é o que estava
aberto quando ela **começou**, não o de agora: `playbook_step` fecha um passo, e a linha dela
pertence ao passo que fechou (foi assim que o cartão mostrava o passo errado, documento 23).

As marcas de uma chamada são `caro` (voltou ao modelo 20 mil caracteres ou mais), `cortado` (a
resposta não cabia e a ferramenta cortou), `chamada` (o modelo chamou errado: argumento inválido
ou ferramenta que não existe) e `recusado-depois` (aprovado e recusado na hora de rodar). Uma
chamada guarda também se foi `sozinha`, `pedida`, `aprovada` ou `negada`.

São guardadas as chamadas **dentro de uma execução**, no máximo 400 por execução (as mais novas).

### B. Tela "Detalhes da execução"

- **Ver detalhes**, em cada execução da lista, abre a linha do tempo por passo: cada chamada com
  o que foi chamado, como terminou, quanto durou e quanto fez o modelo ler, mais as marcas.
- No alto, o que a execução custou: chamadas, caracteres ao modelo, aprovações, falhas e leituras
  caras.
- **Só problemas** deixa à vista o que falhou, o que tem marca e o que você decidiu.
- **Copiar execução completa** põe o registro inteiro como texto na área de transferência
  (`GET /api/brain/runs/:id/transcript`), por passo, com os desvios: é o que se manda a quem vai
  depurar, no lugar de copiar a conversa (que corta os trechos longos).

Ainda não feito desta tela: o resumo da semana e os filtros por categoria na lista de execuções
(dependem dos detectores), e o detalhe da chamada escolhida ao lado (começo e fim do que foi
gravado).

### C. Diagnóstico do Orbi

No fim de cada execução, regras do runtime (detectores) procuram defeitos **do Orbi**, à
parte da revisão do procedimento. Cada achado cai em uma de três categorias:

| Categoria | O que é | Para onde vai |
|---|---|---|
| do Orbi | defeito da aplicação | diagnóstico e, se você quiser, issue |
| do procedimento | passo que não cumpre o que promete | revisão, como hoje (documento 19) |
| do modelo | chamada errada (argumento, ferramenta que não existe) | contado à parte; muitos iguais indicam instrução confusa |

Detectores (`diagnosis/detectors.ts`, regras puras; um detector novo é uma entrada ali com o
seu teste). Cada achado tem uma **impressão digital**: o mesmo defeito em outra execução é
contado ("2a vez"), e é por ela que a issue vai somar ocorrências em vez de abrir outra.

| Detector | Categoria | Quando |
|---|---|---|
| `arquivo-cortado` | do Orbi | uma chamada que gravou arquivo (`saveTo`) veio com a resposta cortada |
| `recusado-depois` | do Orbi | você aprovou e o Orbi recusou na hora de rodar |
| `chamada-errada` | do modelo | ferramenta que não existe ou argumento que não valida, agrupado por ferramenta |
| `passo-fora-de-ordem` | do modelo | tentou fechar um passo antes do anterior (o runtime recusou) |
| `passo-sem-ferramenta` | do modelo | passo cuja instrução nomeia uma ferramenta foi dado como feito sem nenhuma chamada |

Os dois primeiros foram corrigidos no documento 23: ficam como alarme de regressão. O último
é novo e só existe por causa do registro: sem ele não havia como saber que um passo não teve
chamada nenhuma.

**O que não interrompe.** Um deslize que o modelo corrigiu na hora (chamou errado e acertou
em seguida) fica guardado e aparece na execução, marcado como menor, mas não acorda a
conversa: ele só importa somado (muitos iguais significam descrição confusa).

**Onde aparece.** Na lista de Execuções, cada linha diz "2 do Orbi, 1 do modelo"; em "Ver
detalhes", a seção "Diagnóstico: não é do procedimento" traz, para cada achado, o que
aconteceu com os números do registro, onde olhar no código (quando o detector sabe), quantas
vezes já aconteceu e **Dispensar**. No fim da execução, se houver algo que mereça, a revisão
manda o Orbi dizer **uma linha** na conversa ("houve 1 problema do modelo nesta execução;
não é do seu procedimento") e proíbe propor mudança no procedimento por causa disso.

Ainda fora: "a mesma ferramenta falhando do mesmo jeito em execuções seguidas" (precisaria
decidir o que é do Orbi e o que é do ambiente, e erraria a categoria) e "procedimento que
perdeu entregas" (o documento 23 tirou a causa, e não há sinal confiável no registro).

**Quem explica e confirma** (Configurações › Diagnóstico do Orbi):

| Opção | O que faz | Custo |
|---|---|---|
| Só regras | lista o que os detectores acharam | nenhum |
| Modelo do Orbi | escreve o relatório; não lê o código | chave da API |
| Agente instalado | lê o código do Orbi e confirma a causa, com arquivo e linha | a assinatura do agente |

O agente instalado reusa os agentes de código (documento 17), com uma terceira tarefa,
`diagnosticar`: roda numa pasta com a cópia do código do Orbi **na versão instalada** (tag do
repositório), o registro da execução e os achados das regras; só lê; escreve `relatorio.md`
num formato fixo. Roda quando as regras acham algo, ou quando você pede "Analisar esta
execução". Achado que o agente não confirma no código sai como **hipótese**.

### Issue no repositório do Orbi

**Como funciona** (decisão de 14/11): **Reportar no Orbi**, num achado do Orbi, monta o texto
e mostra antes de enviar. Enviar tenta o `gh` desta máquina, que é quem já está logado:

- se já existe issue com a mesma impressão digital, entra como **ocorrência nela**
  (`gh issue comment`) em vez de abrir outra;
- se não existe, abre uma (`gh issue create`);
- **sem o `gh`, ou se ele falhar** (não instalado, não logado, erro), volta a página do GitHub
  já preenchida, dizendo o motivo, para você conferir e enviar. Nunca fica sem caminho.

O corpo traz o que aconteceu, onde olhar no código (quando o detector sabe), as chamadas do
passo em que aconteceu, a versão, o sistema, o detector e a impressão digital.

**Nada do seu trabalho sai.** Os nomes que são seus — procedimento, passos, arquivos, sites —
são trocados por `<procedimento-1>`, `<passo-2>`, `<arquivo-1>`, `<site-1>`, e a troca é por
nome conhecido, nunca por adivinhação. A tela mostra o texto exato e a lista do que foi
trocado. O conteúdo das respostas nunca entra, porque o registro não o guarda.

`ORBI_ISSUES_REPO` diz para onde vai (padrão `arthurparahyba/orbi`).

**Não usamos o Playwright** para isso: o que falta no caminho de reserva não é automatizar o
navegador, é você conferir e clicar. E o navegador que importa é o seu, com o login do GitHub
que você já tem; um navegador limpo teria de fazer login. Quem quiser o Playwright num
procedimento pode cadastrá-lo como servidor MCP por comando (documento 20), sem embutir.


### Alerta de gasto

Algumas chamadas custam muito mais que as outras: captura de imagem pelo MCP do navegador,
leitura da página inteira, saída grande de um comando. O registro guarda, por chamada, quanto
foi ao modelo. Com isso:

- na linha do tempo, a chamada cara aparece marcada, com o tamanho;
- no fim da execução, se elas pesaram, a conversa mostra uma linha: "3 leituras caras nesta
  execução (cerca de N mil tokens): ver";
- a execução e a tela de Consumo mostram quanto do gasto veio dessas chamadas;
- quando a mesma leitura cara se repete num passo, a revisão sugere trocá-la (um
  `evaluate_script` pequeno, `saveTo` num arquivo) e guarda como ideia do procedimento.

**Feito:** cada chamada cara aparece marcada na linha do tempo, com o tamanho, e o alto da tela
soma as leituras caras da execução. Quando uma execução passa de 60 mil caracteres em leituras
caras, o analisador `leituras-caras` guarda uma ideia no procedimento dizendo em qual passo e com
qual ferramenta (ela aparece no Cérebro, sem cartão e sem gastar turno de modelo). Há também a
regra no prompt (`prompts/orbi/procedimento.md`): preferir uma leitura pequena a imagem ou
página inteira.

**Falta:** a linha no fim da conversa e o quanto do gasto veio dessas chamadas na tela de
Consumo. A linha na conversa pede um turno de modelo só para avisar de gasto, o que seria
contraditório: ela deve pegar carona no cartão da revisão, quando ele já vai acontecer.

## Segurança

- O registro nunca guarda credencial (passa por `redact`) nem o conteúdo das respostas.
- O agente de diagnóstico só lê; nada da cópia do código roda; ele não aprova, não grava no
  Cérebro e não envia issue.
- O registro contém texto de terceiros (páginas): para o agente e para o modelo é dado, nunca
  instrução.
- Enviar a issue é uma ação que publica: sempre com a sua confirmação.

## Fases

1. ~~Registro (`run_calls`) e a tela de detalhes, com "Copiar execução completa".~~ Feito.
2. ~~Detectores, as três categorias, o resumo na lista e a linha no fim da conversa.~~ Feito.
3. Diagnóstico pelo modelo do Orbi e pelo agente instalado; a configuração.
4. ~~Issue: texto, anonimização, `gh` com soma de ocorrências e a página preenchida como reserva.~~ Feito.

## Peças

Regras puras em `brain/domain/run-calls.ts` (marcas, resumo da chamada, a execução como texto),
tabela em `brain/repo/run-calls.ts`, escrita em `compose.ts` (`recordCallStart`, `recordCallEnd`)
e em `agents/gate.ts` (a decisão do desenvolvedor cai na mesma linha), rotas em
`http/routes/brain.ts`, tela em `views/brain/RunDetail.tsx` com as regras em
`views/brain/runCalls.ts`, analisador em `review/analyzers/reads.ts`.

O diagnóstico fica em `diagnosis/` (detectores puros e a tabela `diagnoses`), fora do cérebro:
o cérebro é o que o Orbi sabe do domínio do desenvolvedor, não o que ele sabe de si. A revisão
(`review/review.ts`) roda os detectores quando a execução termina e nunca transforma um achado
deles em mudança de procedimento. Rotas em `http/routes/diagnoses.ts`; tela em
`views/brain/RunDiagnosis.tsx` e a contagem por execução em `views/brain/runCalls.ts`.

A issue fica em `diagnosis/issue.ts` (o texto e a troca de nomes, regras puras) e
`diagnosis/send.ts` (o `gh`, trocável no teste).

Testes: `run-calls.test.ts`, `flow-run-calls.test.ts`, `review.test.ts` (leituras caras),
`diagnosis.test.ts`, `issue.test.ts`, `flow-diagnosis.test.ts`, `flow-learn-run.test.ts` (passo
sem ferramenta), `runCalls.test.ts` (app).

## Depende de

- Uma tag por versão no repositório (o processo de release precisa criá-la).
- Testes que chamem um modelo real usam sempre o Haiku 5.5 (regra do `CLAUDE.md`).
