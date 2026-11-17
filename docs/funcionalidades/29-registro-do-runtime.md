# 29 · O registro do runtime na tela

O Orbi escreve um registro desde sempre — uma linha por evento, com atributos — e ninguém o
enxergava sem abrir um arquivo à mão. Quando ele falhava, a aplicação mostrava um círculo girando
e a resposta estava escrita num `.log`. Foi o que aconteceu com a migração inserida no meio da
lista (`docs/banco.md`): o runtime morria no boot com a mensagem exata do problema, e a tela
calava.

## Onde mora

`contexts/telemetry`, que já era dono do `log`:

| Peça | O que faz |
|---|---|
| `src/log-file.ts` | lê o fim do arquivo, de trás para frente, em blocos |
| `src/log-lines.ts` | uma linha vira registro, e diz se foi reconhecida |
| `use-cases/recent-log.ts` | o caso de uso: achar, ler, limpar, filtrar |
| `http.ts` | `GET /api/logs?level=&text=&limit=` |
| `src/log.ts` | `warn` e `error` avisam quem quiser (ver abaixo) |

Na tela: Autonomia › Acompanhar › **Logs**.

## A fonte é o arquivo, não a memória

Pensei em guardar as últimas N linhas em memória no runtime: mais simples, sem I/O. Descartei por
um motivo decisivo — **o arquivo tem estritamente mais**. O que um plugin escreve com
`console.log` não passa pelo logger do Orbi; uma pilha de erro do Node, uma promessa rejeitada e
a exceção que mata o processo no boot também não. Um buffer na memória não teria mostrado **nada**
do bug da migração, porque o processo morreu antes de existir servidor HTTP.

O caminho vem de `config.logFile` (`ORBI_LOG_FILE`, ou `<appDataHome>/logs/runtime.log`, que é
onde o Tauri redireciona a saída). Com `npm start` o arquivo não existe, e isso **não é defeito**:
a saída vai para o terminal. A tela diz isso em palavras em vez de mostrar um código de erro a
quem está procurando a causa de outra coisa.

## Linha reconhecida e linha crua: lista de permissão

Uma linha é `orbi` quando tem a forma do logger — JSON com `level` e `msg`, ou o formato bonito do
terminal. Todo o resto é `raw`, e **isso é informação, não defeito**: significa que o Orbi não
sabe o que aquela linha contém.

A distinção não é cosmética. Ela é o que vai permitir mandar um pedaço do registro numa issue sem
quebrar a regra do documento 24 (*"a troca é por nome conhecido, nunca por adivinhação: o que não
é reconhecido não é mandado"*): linha crua pode ter host interno, id de requisição, qualquer coisa
que um plugin descuidado imprimiu. Por isso o filtro de nível **esconde** a linha crua — não dá
para afirmar que ela passa — e a tela diz quantas são.

## Credencial

Credencial não deveria estar no registro: é regra do projeto, e o logger do Orbi não escreve
nenhuma. Mas o que um plugin imprime e o que vem numa pilha de erro não passam pelo logger, então
o texto é limpo por `redact` antes de ser interpretado. **Defesa em profundidade, não licença**:
continua proibido registrar segredo. `test/logs.test.ts` guarda isso, com a credencial aparecendo
nos dois tipos de linha.

## A tela não fica perguntando

A convenção do app é não consultar de tempos em tempos (só o health). Então `warn` e `error`
passam a avisar: `onSeriousLog` em `src/log.ts`, ligado em `startBackground` ao tópico novo `log`
do feed. O que importa chega sozinho; `info` e `debug` não avisam ninguém, porque um turno do
modelo escreve dezenas deles e a tela piscaria sem parar. Para o resto, o botão Atualizar.

## Limites

- **Não cobre o runtime que não sobe**, que é justamente o caso do bug da migração: sem runtime
  não há rota para servir o arquivo. Só o lado Tauri alcança o arquivo nessa hora, e hoje não
  existe nenhum comando Tauri (`generate_handler` não está no `main.rs`) — seria o primeiro, mais
  a dependência `@tauri-apps/api` no frontend. Fica como decisão aberta.
- Lê no máximo 2000 linhas, do fim. A primeira pode estar cortada, e a resposta diz (`partial`).
- Sem acompanhar em tempo real linha a linha: o feed avisa que houve aviso ou erro, e a tela
  recarrega o fim do arquivo.
