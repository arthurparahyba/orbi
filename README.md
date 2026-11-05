# Vigia — runtime

Copiloto de esteira: um agente que **aprende** os procedimentos repetitivos do
desenvolvedor (subir para dev, acompanhar a esteira, abrir PR, release, GMUD,
atualizar versão em portal) e passa a executá-los sozinho, pedindo aprovação
quando a regra de autonomia manda.

- Framework: [Flue](https://flueframework.com) 2.3 sobre o harness Pi
- Modelo: `anthropic/claude-haiku-5-5` (API da Anthropic)
- Correção de código: Claude Code via Claude Agent SDK (`claude-haiku-5-5`)
- Navegador: `chrome-devtools-mcp` atrás de uma ponte HTTP local (o Flue só fala MCP por HTTP)
- Cérebro: um arquivo SQLite (`data/brain.db`), sem servidor

O código não sabe nada de CI, GMUD ou portal. Ele dá ao agente **mãos**
(terminal, navegador, Claude Code), **memória** (o cérebro), **voz**
(componentes de interface e perguntas) e **relógio** (retornos agendados).
O resto o Vigia aprende com você e guarda como playbook.

## Rodar

```bash
cp .env.example .env      # preencha ANTHROPIC_API_KEY, VIGIA_WORKSPACE, GH_TOKEN…
npm install
npm run dev               # http://127.0.0.1:5173 (sobe a ponte do Chrome junto)
```

Conversar (o app desktop faz isso por baixo):

```bash
ID=$(curl -s -XPOST localhost:5173/api/conversations | jq -r .id)
curl -XPOST localhost:5173/agents/vigia/$ID -H 'content-type: application/json' \
  -d '{"kind":"user","body":"Vou te ensinar a subir o portal-clientes-front para dev."}'
curl -N localhost:5173/agents/vigia/$ID      # stream de eventos (texto + componentes)
```

Produção local: `npm run build && npm start` (porta 3000, só loopback).

## App desktop

`desktop/` é o app: **Tauri 2** (janela nativa, ~3 MB) + **React 19** com
`@flue/react`. Três telas:

- **Conversa** — chat com o Vigia. Texto, componentes (`stepper` ao vivo,
  cartões de aprovação e de pergunta, tabelas, diffs) e as ações executadas
  agrupadas. Pendências de todas as conversas ficam na coluna da direita.
- **Cérebro** — grafo do conhecimento (clique num nó para ver propriedades,
  relações atuais e histórico), lacunas, playbooks com autonomia por playbook,
  execuções e os tipos da ontologia. Exporta tudo em Markdown.
- **Autonomia** — observar · perguntar · automático por tipo de ação, e o
  estado das capacidades (modelo, chave, Chrome DevTools MCP).

Ao abrir, o app procura o runtime em `127.0.0.1:3000`; se não achar, inicia
`node dist/server.mjs` da pasta do runtime (ou de `VIGIA_RUNTIME_DIR`) e o
encerra junto com a janela. A chave vem do `.env` do runtime, porque apps
abertos pelo Dock/Finder não herdam o ambiente do terminal.

```bash
# uma vez
npm install && npm run build        # runtime
cd desktop && npm install

# desenvolvimento: UI com hot reload no navegador (http://localhost:5174)
npm run demo                        # na raiz: runtime com modelo roteirizado e cérebro de exemplo, sem API key
npm --prefix desktop run dev

# janela nativa
npm --prefix desktop run tauri dev
npm --prefix desktop run tauri build   # macOS: .app e .dmg em desktop/src-tauri/target/release/bundle/
```

Pré-requisitos do Tauri: Rust (`rustup`), e no macOS as Xcode Command Line
Tools (`xcode-select --install`); no Linux, `libwebkit2gtk-4.1-dev`.

`npm run demo` roda o fluxo completo sem gastar API: peça “Vou te ensinar como
subir a versão de um front no portal”, aprove o cartão, e depois “Atualiza a
versão do novo-front no portal” para ver o playbook executar passo a passo.

## API local

| Rota | O quê |
| --- | --- |
| `POST /agents/vigia/:id` · `GET /agents/vigia/:id` | Conversa Flue: enviar mensagem, ler stream |
| `POST /api/conversations` | Novo id de conversa |
| `GET /api/inbox` | Aprovações, perguntas e aprendizados pendentes |
| `POST /api/inbox/:id/decision` `{decision}` | Aprovar/negar (vira sinal na conversa) |
| `POST /api/inbox/:id/answer` `{text}` | Responder pergunta |
| `GET /api/brain` | Ontologia, entidades, ligações, lacunas |
| `GET /api/brain/entities/:id` · `GET /api/brain/search?q=` | Navegar o grafo |
| `GET /api/brain/playbooks` · `PATCH /api/brain/playbooks/:name` | Playbooks e autonomia de cada um |
| `GET /api/brain/runs` | Execuções de playbook (passo a passo) |
| `POST /api/brain/export` | Exporta o cérebro em Markdown (Obsidian) |
| `GET/PATCH /api/autonomy` | Níveis globais por categoria |
| `GET /api/health` | Modelo, chave, ponte do Chrome, cérebro |

## Componentes de interface

O agente nunca manda HTML. Ele escreve no canal `ui` um destes componentes
(`src/ui.ts`) e o app desenha: `stepper`, `status`, `approval`, `question`,
`table`, `link`, `code`, `learning`. Mesmo `id` = atualização no lugar.

## Testes

```bash
npm test             # unidade + fluxo completo do agente com o provedor faux do Pi (sem API key)
npm run e2e:chrome   # ponte + chrome-devtools-mcp + Chrome headless num "portal" local
npm run check:types
```

## Estrutura

```
src/
  app.ts                  rotas HTTP, ponte do Chrome, laço de retornos
  agents/vigia.ts         o agente (Flue 'use agent')
  agents/capabilities.ts  tools genéricas + gate de autonomia + canal de UI
  subagents/investigador.ts
  skills/aprender-procedimento.ts   a única skill de fábrica: como aprender
  brain/store.ts          cérebro em SQLite (ontologia, grafo temporal, playbooks)
  policy/autonomy.ts      observar · perguntar · automático
  mcp/bridge.ts           stdio → HTTP para o chrome-devtools-mcp
  tools/exec.ts           execução sem shell, com allowlist
  tools/claude-code.ts    correção em worktree via Claude Agent SDK
scripts/demo-server.ts    runtime com modelo roteirizado (sem API key)
desktop/
  src/views/              Conversa, Cérebro, Autonomia
  src/components/         catálogo de componentes do canal `ui`
  src-tauri/              janela nativa + início/parada do runtime
```

Nota: `@earendil-works/pi-ai` e `pi-agent-core` estão fixados em 1.1.0 em
`overrides` — o Flue 2.3.0 quebra com o Pi 1.2+.
