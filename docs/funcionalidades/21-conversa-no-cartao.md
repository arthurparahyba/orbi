# 21. Conversa dentro do cartão

Telas no canvas "Orbi · Conversa dentro do cartão" (boards A a D; a escolhida é a B, com o
ajuste do board D).

## O problema

Uma revisão ou um ensino costuma trazer dois cartões seguidos (corrigir um procedimento,
guardar um conhecimento). O Orbi explicava os dois num texto só, **embaixo** dos dois, e quanto
mais a conversa seguia, mais a explicação se afastava do cartão de que falava. Perguntar "no
primeiro…" ficava ambíguo.

## Onde aparece

- **O porquê vai dentro do cartão.** O cartão de aprendizado mostra **Por quê**, uma frase do
  Orbi (`why` do `brain_learn`). Fora dos cartões, o Orbi escreve uma linha, sem explicar cada
  um de novo.
- **Perguntar sobre este cartão.** Embaixo do porquê, o cartão tem a sua conversa: as perguntas
  feitas nele, as respostas do Orbi e um campo para escrever. A caixa de mensagem de baixo
  continua lá, para o resto da conversa.
- **Ajuste no lugar.** Pedir uma mudança na conversa do cartão muda **o próprio cartão**: ele
  ganha "atualizado na conversa · versão N" e **ver como era** (a versão anterior). Nenhum
  cartão novo aparece. A aprovação continua sendo sua, sobre a versão que está na tela.
- **Depois de decidir**, a conversa do cartão dobra numa linha ("3 mensagens sobre este cartão").
- Têm conversa: os cartões de **aprendizado** (procedimento novo, correção, conhecimento) e o
  cartão da **revisão da execução** (problemas, correção de ambiente). Aprovação de um comando
  simples não tem.

## Como funciona

1. **A mensagem do cartão é um sinal na mesma conversa** (`type: 'card'`), com o cartão nos
   atributos (`card`, `title`, `text`). O Orbi tem o histórico inteiro e recebe junto o que o
   cartão mostra agora, então não depende de você dizer qual é. A rota é
   `POST /api/conversations/:id/card-message`.
2. **A tela agrupa** (`components/chat/cardThreads.ts`, sem React): o sinal do cartão e as
   respostas do Orbi a ele (até a próxima mensagem sua ou o próximo sinal) saem do fluxo
   principal e aparecem dentro do cartão.
3. **O prompt** ganha a parte `cartao.md` quando o turno começa por um sinal de cartão:
   responder curto e só sobre ele; para mudar a proposta, chamar `brain_learn` de novo com tudo.
4. **Ajuste no lugar, decidido pelo runtime** (não pelo modelo): um `brain_learn` num turno que
   começou por um sinal de cartão de aprendizado ainda pendente **atualiza a pendência**: o
   portão troca os argumentos guardados da chamada pendente, a pendência ganha uma versão nova
   (`inbox_items.version`; as anteriores em `inbox_items.versions`) e nenhum cartão novo é
   criado. O cartão lê a versão atual do banco (pelo feed de eventos) e mostra "ver como era".
   Aprovar executa a versão que está na tela.

## Peças

| Arquivo | Papel |
| --- | --- |
| `contracts`: `ui.ts` (`approval.why`), `requests.ts` (`CardMessage`), `api.ts` (`InboxItem.version`, `versions`) | Formatos |
| `http/routes/conversations.ts` | `POST /:id/card-message`: monta o sinal e entrega |
| `agents/gate.ts` | `why` no cartão; atualizar no lugar a pendência do cartão |
| `conversations/inbox.ts`, migração 24 | `revise(id, title, detail)`: versão nova, anteriores guardadas |
| `prompts/orbi/cartao.md` | Como responder dentro do cartão |
| `desktop/components/chat/cardThreads.ts`, `CardThread.tsx` | Agrupar e mostrar a conversa do cartão |
| `ApprovalCard.tsx`, `ReviewCard.tsx` | O porquê, a conversa e a versão atual |

## Limites

- A conversa do cartão é um agrupamento na tela: para o modelo, é a mesma conversa.
- Só um cartão de aprendizado **pendente** muda no lugar. Depois de aprovado ou negado, um pedido
  de mudança vira um aprendizado novo, com o seu cartão.

## Testes

- `apps/desktop/test/cardThreads.test.ts`: o que entra na conversa de cada cartão e o que sai do
  fluxo principal.
- `apps/runtime/test/flow-card-chat.test.ts`: a mensagem do cartão chega ao Orbi com o contexto;
  `brain_learn` pedido no cartão atualiza a pendência (versão 2, sem cartão novo) e aprovar
  aplica a versão nova.
- O e2e da tela pergunta num cartão e confere a resposta dentro dele.
