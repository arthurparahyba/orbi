# 31 · O navegador deixa de vir embarcado

Até aqui a aplicação trazia o navegador dentro dela: o pacote `chrome-devtools-mcp` ia no
instalador, e no boot o runtime subia uma ponte stdio→HTTP com token na frente dele, porque o Flue
conecta MCP por HTTP e aquele servidor fala stdio.

Dava problema demais. Era uma versão do Chrome, um perfil, uma porta, um token e um processo filho
a mais para dar errado — dentro de um instalador, numa máquina onde a pessoa não escolheu nada
disso. Quando falhava, falhava no meio de um passo de procedimento.

**Agora quem escolhe é o desenvolvedor.** Ele cadastra o servidor MCP de navegador que quiser
(documento 20, por comando — `npx chrome-devtools-mcp`, ou outro) e marca **"é o navegador do
Orbi"**. A aplicação é instalada **sem servidor nenhum**.

## O que isso muda

| Antes | Agora |
|---|---|
| A ponte subia no boot | Nada sobe: o hub conecta os servidores que você cadastrou |
| Leitura aparecia como `mcp__chrome__*`, fixa | Aparece como `mcp__<servidor>__*`, com autonomia **por ferramenta** |
| `browser_act` falava com a ponte | Fala com o servidor marcado, pelo hub |
| Sem navegador, o passo falhava | Sem navegador, recusa com a frase que diz o que fazer |
| A barra tinha a bolinha do Chrome | Saiu: o que importa é se há um servidor marcado (Capacidades mostra) |

O que **não** mudou é o que dá valor: `browser_act` continua atrás do portão de autonomia,
continua trocando `{{segredo:nome}}` pelo valor do cofre **dentro da ferramenta**, continua
limpando o valor de qualquer saída, e o `saveTo` continua gravando a resposta inteira num arquivo
em vez de o modelo copiar à mão. Nada disso dependia da ponte.

O **gravador** do "Ensinar pelo navegador" (documento 6) também não mudou: ele fala CDP direto com
o Chrome que o Orbi abre, com perfil próprio, e nunca passou por MCP. Os ajustes dele continuam
onde estavam, agora chamados pelo que são: **Chrome do gravador**.

## Um só é o navegador

A marca é uma coluna em `mcp_servers` (`is_browser`), e marcar um **desmarca** o outro: não existe
"dois navegadores". Um servidor desligado deixa de ser o navegador na hora, porque o Orbi não
tenta falar com o que está desligado.

Marcar não é adivinhar. Eu considerei detectar o navegador pelos nomes das ferramentas
(`take_snapshot`, `navigate_page`) e descartei pelo mesmo motivo que vale no resto do Orbi: a
troca é por nome conhecido, nunca por adivinhação. Quem sabe qual servidor é o navegador é quem o
cadastrou.

## Onde mora

| Peça | O que faz |
|---|---|
| `contexts/tools/browser/src/mcp/chrome-devtools.ts` | Acha o servidor marcado, chama nele, e a frase `NO_BROWSER` |
| `contexts/tools/mcp-client/src/store.ts` | `setBrowser` e `browser()`: a marca, uma só |
| `contexts/tools/mcp-servers-http.ts` | `PUT /api/mcp-servers/:id/browser` |
| `contexts/tools/mcp-client/src/hub.ts` | `call(..., { full })`: a resposta inteira para o `saveTo` |
| `views/autonomy/mcp/ServerPage.tsx` | O botão "É o navegador do Orbi" e o aviso |
| `views/autonomy/mcp/ServerList.tsx` | A marca na lista, e o aviso quando não há nenhum |

Saíram: `browser/src/mcp/bridge.ts` e `bridge-cli.ts`, a dependência `chrome-devtools-mcp`, os
scripts `bridge:chrome`, `e2e:chrome` e `e2e:chrome-settings`, as variáveis `CHROME_MCP_PORT`,
`CHROME_MCP_TOKEN` e `CHROME_MCP_AUTOSTART`, e a bolinha do Chrome na barra.

## Testes

`apps/runtime/test/browser-server.test.ts`: sem marcado recusa dizendo o comando a digitar; marcar
outro desmarca o primeiro; desligar o servidor tira o navegador; a marca aparece na lista e na
página. E `npm run e2e:demo -w @orbi/runtime`, que passou a **cadastrar** o servidor por comando e
marcá-lo — o script virou o primeiro usuário do caminho novo.

## Limites conhecidos

Os procedimentos já aprendidos dizem `browser_act` com os nomes de ferramenta do
chrome-devtools-mcp (`take_snapshot`, `fill`, `click`). Se você cadastrar um servidor de navegador
com outros nomes, esses passos não casam, e `browserCategory` trata nome desconhecido como
**escrita** — ou seja, pede aprovação, que é o lado seguro de errar.
