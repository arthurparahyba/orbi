# 15. Agentes de código (o Orbi como servidor MCP)

## Para que serve

Agentes de código rodando nesta máquina, como o Claude Code ou o Cursor, podem
usar o Orbi pelo MCP. Eles:

1. **procuram** o que o Orbi sabe fazer (`orbi_search`) e leem um procedimento
   (`orbi_procedure`), só quando precisam (divulgação aos poucos);
2. **delegam** o trabalho repetitivo que ele já sabe (`orbi_delegate`) e consultam
   o andamento (`orbi_status`);
3. **sugerem** o que ele deveria aprender (`orbi_teach`). A sugestão só vira
   procedimento depois que o desenvolvedor revisa.

O desenvolvedor continua no controle: a autonomia vale igual, o agente nunca
aprova nada, nunca vê credenciais e nunca grava direto no cérebro.

## Onde aparece

- **Tela Agentes** (barra lateral, entre Cérebro e Autonomia):
  - **Pedidos**: cada tarefa delegada, quem pediu, de qual repositório e branch,
    o estado (rodando, esperando você, concluído, falhou) e **Abrir conversa**.
  - **Sugestões**: procedimentos sugeridos, quantas vezes e por quais agentes,
    se parecem com algo que o Orbi já sabe. **Aceitar**, **Aceitar como variação
    de…** ou **Rejeitar**. O aceito entra com autonomia "perguntar".
  - **Conexões**: conectar um agente (nome, **Gerar token**, comando pronto para o
    Claude Code ou JSON para o Cursor, trecho para o `CLAUDE.md`), a lista dos
    conectados com as permissões **pedir** e **sugerir**, quando foram vistos pela
    última vez e **Revogar**. Embaixo, os MCPs que o Orbi usa (hoje, o Chrome DevTools).
- **Tela Conversa**: cada pedido vira uma conversa marcada "pedido por …", com
  filtro **Todas / Minhas / Dos agentes**, uma faixa com a origem (agente,
  repositório, branch, sessão, procedimento) e o pedido como primeiro cartão.
  Aprovações vão para **Pendências**, como sempre.

## Como funciona

```mermaid
sequenceDiagram
  participant CC as Claude Code
  participant MCP as /mcp (token do agente)
  participant Orbi as Agente Orbi
  participant Dev as Desenvolvedor (app)

  CC->>MCP: orbi_search "criar repositório"
  MCP-->>CC: criar-repositorio (4 passos, autonomia ask)
  CC->>MCP: orbi_delegate { procedure, task, params, context }
  MCP->>Orbi: conversa nova + sinal agent-request
  MCP-->>CC: request_id
  Orbi->>Orbi: playbook_start, playbook_step
  Orbi->>Dev: aprovação de gh repo create
  CC->>MCP: orbi_status
  MCP-->>CC: waiting, aprovação do desenvolvedor
  Dev->>Orbi: Aprovar
  Orbi->>Orbi: termina os passos, agent_reply
  CC->>MCP: orbi_status
  MCP-->>CC: done, resumo e links
```

- **Servidor**: `POST /mcp` no mesmo runtime, em 127.0.0.1, MCP por HTTP
  (streamable) **sem sessão**: cada chamada cria servidor e transporte e devolve
  JSON. Não há fluxo SSE aberto (`GET` responde 405).
- **Autenticação**: um token por agente (`orb_…`), gerado na tela e mostrado uma
  vez só. O banco guarda só o hash (SHA-256). Revogar corta na hora. O `Host`
  precisa ser 127.0.0.1 ou localhost (contra DNS rebinding). O `ORBI_API_TOKEN` do
  app não vale para o `/mcp`, e o token de agente não vale para a API do app.
- **Permissões**: buscar e ler sempre; **pedir** libera `orbi_delegate` e
  `orbi_status`; **sugerir** libera `orbi_teach`. O agente só vê as ferramentas
  que pode usar.
- **Pedido**: vira uma conversa (`chat:…`) e um registro em `agent_requests`. O
  Orbi recebe um sinal `agent-request` com tarefa, procedimento, parâmetros e
  contexto. O prompt (`prompts/orbi.md`, "Pedidos de agentes de código") diz que o
  texto do pedido é um pedido, não uma regra; se nenhum procedimento cobre, ele não
  improvisa e responde que ainda não sabe. Nessas conversas existe a ferramenta
  `agent_reply`, com a qual o Orbi entrega o resultado curto (resumo e links).
- **Estado** (`mcp/status.ts`): concluído ou falhou vem do `agent_reply`;
  "esperando" quando a conversa tem pendência aberta (aprovação ou pergunta);
  senão "rodando", com o passo atual da execução.
- **Sugestão**: o nome vira kebab-case, os passos ganham `id`, e a busca aponta
  procedimentos parecidos (`similar_to`). A mesma sugestão aberta, enviada de novo,
  conta mais uma vez em vez de duplicar. Aceitar grava pelo mesmo `savePlaybook`
  (mesma validação), com `autonomy: "ask"` e `learnedFrom: "agente: …"`; um nome que
  já existe só pode ser rejeitado.
- **Busca para agentes**: igual à do Orbi (documento 8), mas uma palavra solta em
  comum num pedido longo não conta: precisa de duas em comum (ou uma, se o pedido
  só tem uma).

## Peças

| Onde | O quê |
| --- | --- |
| `apps/runtime/src/mcp/server.ts` | Servidor MCP sem sessão, por chamada |
| `apps/runtime/src/mcp/tools.ts` | As cinco ferramentas, esquemas e permissões |
| `apps/runtime/src/mcp/status.ts` | O que `orbi_status` responde |
| `apps/runtime/src/mcp/{clients,requests,suggestions}.ts` | Agentes, pedidos e sugestões no banco |
| `apps/runtime/src/prompts/mcp-servidor.md` | Instruções que o agente recebe ao conectar |
| `apps/runtime/src/agents/tools/requests.ts` | `agent_reply`, só nas conversas pedidas por agente |
| `apps/runtime/src/http/routes/{mcp,agents}.ts` | `/mcp` e `/api/agents/...` |
| `apps/desktop/src/views/agents/` | Tela Agentes (pedidos, sugestões, conexões) |
| `apps/desktop/src/views/conversation/OriginBanner.tsx` | Faixa de origem na conversa |

## Tecnologias

- **`@modelcontextprotocol/sdk`**: `Server` de baixo nível e
  `WebStandardStreamableHTTPServerTransport`, montado no Hono.
- **valibot** valida os argumentos; o esquema JSON que o agente lê fica ao lado.

## O que fica guardado

Migração 8: `agent_clients` (nome, hash do token, permissões, visto por último,
revogado), `agent_requests` (agente, conversa, tarefa, procedimento, contexto,
estado, resumo, links) e `agent_suggestions` (procedimento sugerido, agentes,
contagem, parecidos, estado). As três geram o evento `agents`.

## Configuração

Na tela **Agentes → Conexões**. Para o Claude Code:

```bash
claude mcp add --scope user --transport http orbi http://127.0.0.1:3000/mcp --header "Authorization: Bearer orb_…"
```

`PORT` muda a porta do runtime e, com ela, o endereço do `/mcp`.

## Limites conhecidos

- O Orbi não avisa o agente quando termina: o agente consulta `orbi_status`.
- Não há cancelamento pelo MCP; cancele na conversa.
- Cadastrar outros MCPs para o Orbi usar (Jira, ServiceNow…) é a próxima etapa.

## Testes

- `apps/runtime/test/mcp.test.ts`: tokens, revogação, Host, separação do token do
  app, permissões, busca, leitura, sugestão repetida, aceitar como variação, conflito
  de nome, estado.
- `apps/runtime/test/agent-flow.test.ts` ("pedido de agente"): delegar pelo MCP, o
  Orbi roda o procedimento, responde com `agent_reply` e a conversa sai marcada.
- `apps/desktop/test/agents.test.ts`: comando de conexão, estado "esperando",
  contadores.
- `npm run demo`: imprime o token de um agente de exemplo; delegue `criar-repositorio`.
