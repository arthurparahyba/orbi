# 24. Registro da execução e diagnóstico do Orbi

Decidido em 13/11 com o desenvolvedor. **Ainda não implementado.** Protótipo (telas A a F):
https://claude.ai/artifact/AqyyCGi56FKhFZmFdWFQ29

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

Hoje isso está espalhado e em parte só na memória (`tool-outcomes.ts`,
`run-observations.ts`, `deviations` e `actions` da execução). O registro passa a ser uma
tabela (`run_calls`), alimentada pela telemetria das ferramentas e pelo portão. O conteúdo
das respostas **não** é guardado: só tamanho, começo e fim curtos (para mostrar um arquivo
quebrado), já limpos.

### B. Tela "Detalhes da execução"

- Execuções ganha o resumo da semana e filtros: com problema, do Orbi, do procedimento.
- Abrir uma execução mostra a linha do tempo por passo, com o filtro "Problemas", e o detalhe
  da chamada escolhida ao lado.
- **Copiar execução completa**: o registro inteiro, sem cortes, para mandar a quem depura.

### C. Diagnóstico do Orbi

No fim de cada execução, regras do runtime (detectores) procuram defeitos **do Orbi**, à
parte da revisão do procedimento. Cada achado cai em uma de três categorias:

| Categoria | O que é | Para onde vai |
|---|---|---|
| do Orbi | defeito da aplicação | diagnóstico e, se você quiser, issue |
| do procedimento | passo que não cumpre o que promete | revisão, como hoje (documento 19) |
| do modelo | chamada errada (argumento, ferramenta que não existe) | contado à parte; muitos iguais indicam instrução confusa |

Detectores iniciais (um arquivo cada, com impressão digital própria):

- arquivo gravado cortado ou `.json` inválido;
- comando aprovado e depois recusado;
- passo fechado fora de ordem ou ação contada em passo que não a pediu;
- procedimento que perdeu entregas, scripts ou entradas numa correção;
- leitura muito grande indo ao modelo;
- a mesma ferramenta falhando do mesmo jeito em execuções seguidas sem problema conhecido.

Vários desses defeitos foram corrigidos no documento 23; o detector fica como alarme de
regressão.

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

- De um achado "do Orbi", **Preparar issue** monta o texto: resumo, o que aconteceu (com os
  números do registro), causa, efeito, ambiente (versão, sistema), detector e impressão digital.
- **Nada do seu trabalho sai**: nomes de arquivo, site, procedimento e repositório viram
  `<arquivo-1>`, `<site-1>`…; conteúdo de página, texto dos passos, conversa, entradas,
  entregas e o Cérebro não entram. A tela mostra o texto exato e a lista do que foi trocado.
- **Nada sai sem você enviar.** Dois caminhos: abrir a página do GitHub já preenchida (padrão),
  ou enviar pelo `gh` da máquina, que também soma uma ocorrência em issue de mesma impressão
  digital em vez de abrir outra.

## Segurança

- O registro nunca guarda credencial (passa por `redact`) nem o conteúdo das respostas.
- O agente de diagnóstico só lê; nada da cópia do código roda; ele não aprova, não grava no
  Cérebro e não envia issue.
- O registro contém texto de terceiros (páginas): para o agente e para o modelo é dado, nunca
  instrução.
- Enviar a issue é uma ação que publica: sempre com a sua confirmação.

## Fases

1. Registro (`run_calls`) e a tela de detalhes, com "Copiar execução completa".
2. Detectores, as três categorias, o resumo na lista e a linha no fim da conversa.
3. Diagnóstico pelo modelo do Orbi e pelo agente instalado; a configuração.
4. Issue: texto, anonimização, página preenchida; depois o `gh` e a soma de ocorrências.

## Depende de

- Uma tag por versão no repositório (o processo de release precisa criá-la).
- Testes que chamem um modelo real usam sempre o Haiku 5.5 (regra do `CLAUDE.md`).
