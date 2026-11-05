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

## Ensinar pelo navegador

O jeito mais rápido de ensinar um procedimento web (portal, ServiceNow…): na
Conversa, clique em **Ensinar pelo navegador**, faça o procedimento no Chrome
que abrir e, se quiser, explique em voz alta. Ao clicar em **Terminar e
aprender**, o Vigia junta as duas trilhas e propõe o playbook para você aprovar.

```
App (microfone) ──WAV 16 kHz por pausa──▶ runtime ──▶ Whisper ─┐
                                                               ├─▶ linha do tempo ─▶ agente ─▶ playbook (aprovação)
Chrome do Vigia ──CDP: navegação, cliques, campos──▶ gravador ─┘
                                  └─ senha/usuário ─▶ cofre (nunca no cérebro)
```

- **Cliques** (`src/browser/recorder.ts`, `page-recorder.ts`): um script em cada
  página registra navegação, cliques, campos, seleções e Enter pelo *papel e
  rótulo* do elemento (“o campo Versão na aba Configuração”), não por seletor CSS.
  O Chrome é o mesmo que o agente usa via chrome-devtools-mcp (perfil próprio em
  `data/chrome-profile`, aberto sob demanda).
- **Fala** (`src/stt.ts`): o app corta o áudio nas pausas e manda trechos WAV com
  horário; o runtime transcreve com Whisper **local** (transformers.js; o modelo
  é baixado uma vez para `data/models`, o áudio não sai da máquina) ou com um
  endpoint compatível com a API da OpenAI (`VIGIA_STT_URL`).
- **Síntese**: a linha do tempo (AÇÃO/FALA no mesmo relógio) vai ao agente, que
  segue a seção “Aprender por demonstração” da skill: intenção e gatilho vêm da
  fala, a mecânica vem dos cliques, valores variáveis viram `{{parâmetros}}`.
- **Credenciais** (`src/vault.ts`): campos de senha/token/código e o usuário de
  um formulário de login vão **direto para o cofre** — Keychain do macOS
  (Credential Manager no Windows, Secret Service no Linux) ou, sem cofre do
  sistema, um arquivo AES-256-GCM. A gravação, a mensagem ao agente, o cérebro e
  o playbook só têm a referência `{{segredo:host/campo}}`; o `browser_act`
  substitui o valor na hora de preencher e apaga-o de qualquer saída. Gerencie
  na tela Autonomia → Cofre.

```bash
npm run e2e:demo    # grava uma demonstração num portal local, confere o cofre e reexecuta pelo MCP
```

No `npm run demo`, o botão já vem com um portal de exemplo
(`http://127.0.0.1:4310/login`, usuário `arthur`, senha `s3nh@-Portal!`).

## Componentes de interface

O agente nunca manda HTML. Ele escreve no canal `ui` um destes componentes
(`src/ui.ts`) e o app desenha: `stepper`, `status`, `approval`, `question`,
`table`, `link`, `code`, `learning`. Mesmo `id` = atualização no lugar.

## Testes

```bash
npm test             # unidade + fluxo completo do agente com o provedor faux do Pi (sem API key)
npm run e2e:chrome   # ponte + chrome-devtools-mcp + Chrome headless num "portal" local
npm run e2e:demo     # demonstração gravada → cofre → reexecução com {{segredo:…}}
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
  browser/                Chrome compartilhado + gravador de demonstrações
  vault.ts                cofre de credenciais (Keychain / arquivo criptografado)
  stt.ts                  transcrição da narração (Whisper local ou HTTP)
scripts/demo-server.ts    runtime com modelo roteirizado (sem API key)
desktop/
  src/views/              Conversa, Cérebro, Autonomia
  src/components/         catálogo de componentes do canal `ui`
  src-tauri/              janela nativa + início/parada do runtime
```

Nota: `@earendil-works/pi-ai` e `pi-agent-core` estão fixados em 1.1.0 em
`overrides` — o Flue 2.3.0 quebra com o Pi 1.2+.
