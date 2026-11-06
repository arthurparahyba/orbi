# Arquitetura

```
┌──────────────── Orbi.app ────────────────────────────────────────────────┐
│  apps/desktop (Tauri)                                                     │
│   ├─ janela: React — Conversa · Cérebro · Autonomia                       │
│   └─ inicia ──▶ orbi-node apps/runtime/dist/server.mjs  (encerra junto)   │
│                                                                           │
│  apps/runtime  (127.0.0.1:3000)                                           │
│   ├─ agente Orbi (Flue + Claude Haiku 5.5)                                │
│   ├─ cérebro: SQLite (ontologia, grafo temporal, playbooks, execuções)    │
│   ├─ mãos: git/gh/aws/python sem shell · Chrome DevTools MCP · Claude Code│
│   ├─ gravador de demonstrações + transcrição + cofre                      │
│   └─ API HTTP + stream da conversa                                        │
└───────────────────────────────────────────────────────────────────────────┘
        packages/contracts: o que trafega entre os dois (tipos + esquema da UI)
```

## Runtime (`apps/runtime`)

- Framework: [Flue](https://flueframework.com) 2.3 sobre o harness Pi
- Modelo: `anthropic/claude-haiku-5-5` por padrão; qualquer outro por um adaptador (`src/llm`, ver [llm-adaptadores.md](llm-adaptadores.md))
- Correção de código: Claude Code via Claude Agent SDK, em worktree isolada
- Navegador: `chrome-devtools-mcp` atrás de uma ponte HTTP local (o Flue só fala MCP por HTTP)
- Cérebro: um arquivo SQLite (`data/brain.db`), sem servidor

```
src/
  app.ts                    rotas HTTP, ponte do Chrome, laço de retornos
  agents/orbi.ts            o agente (Flue 'use agent')
  agents/capabilities.ts    tools genéricas + gate de autonomia + canal de UI
  subagents/investigador.ts investigação só-leitura em paralelo
  skills/aprender-procedimento.ts   a única skill de fábrica: como aprender
  brain/store.ts            cérebro (ontologia, grafo temporal, playbooks)
  policy/autonomy.ts        observar · perguntar · automático, por categoria e por playbook
  mcp/bridge.ts             stdio → HTTP para o chrome-devtools-mcp
  tools/exec.ts             execução sem shell, com allowlist
  tools/claude-code.ts      correção em worktree via Claude Agent SDK
  browser/                  Chrome compartilhado + gravador de demonstrações
  vault.ts                  cofre de credenciais (Keychain / arquivo criptografado)
  stt.ts                    transcrição da narração (Whisper local ou HTTP)
  llm/                      porta LlmAdapter, ponte para o Pi e adaptadores (openai-compatible)
  contract-check.ts         garante em tempo de compilação que o runtime cumpre o contrato
scripts/
  demo-server.ts            runtime com modelo roteirizado, cérebro e portal de exemplo
  e2e-*.ts                  testes de ponta a ponta com Chrome
```

## App (`apps/desktop`)

```
src/
  views/                    Conversa, Cérebro (grafo, playbooks, execuções, ontologia), Autonomia
  components/               catálogo de componentes do canal ui, painel de demonstração, Markdown
  api.ts                    cliente da API local (tipos vêm do contrato)
  audio.ts                  microfone → WAV 16 kHz cortado nas pausas
src-tauri/
  src/main.rs               janela + início/parada do runtime, PATH do shell, pasta de dados
  tauri.conf.json           identidade do app (br.com.zup.orbi), janela, CSP
  tauri.bundle.conf.json    acrescentado só no `npm run build`: runtime e Node embutidos
```

O app procura o runtime em `127.0.0.1:3000`. Se já houver um (por exemplo o
`npm run demo`), usa esse. Senão, inicia:

- **app instalado**: o runtime de dentro do pacote com o `orbi-node` ao lado do
  executável; dados em `~/Library/Application Support/br.com.zup.orbi`; o PATH
  vem do seu shell de login, para achar `git`, `gh`, `aws` e `python3` do Homebrew;
- **desenvolvimento**: `apps/runtime/dist/server.mjs` com o `node` do PATH; dados em `apps/runtime/data`.

Se o app morrer sem conseguir encerrar o runtime, o runtime percebe (vigia o
processo pai) e sai sozinho.

## Contrato (`packages/contracts`)

Tudo o que cruza a fronteira runtime ↔ app:

- `ui.ts`: o esquema (valibot) dos componentes que o agente manda no canal `ui`
  (`stepper`, `status`, `approval`, `question`, `table`, `link`, `code`, `learning`).
  O runtime valida com ele; o app desenha a partir dos mesmos tipos.
- `api.ts`: os formatos da API HTTP como o app os lê.

`apps/runtime/src/contract-check.ts` compara os tipos internos do runtime com o
contrato. Se um lado mudar sem o outro, `npm test` falha apontando o par.

O contrato é código TypeScript sem etapa de build: o Vite do app e o do runtime
o compilam junto. No runtime ele propositalmente não aparece em `dependencies`
(o Flue deixaria qualquer dependência declarada de fora do bundle).

## API local

| Rota | O quê |
| --- | --- |
| `POST /agents/orbi/:id` · `GET /agents/orbi/:id` | Conversa Flue: enviar mensagem, ler stream |
| `GET/POST/PATCH /api/conversations` | Lista, cria e renomeia conversas |
| `GET /api/inbox` | Aprovações, perguntas e aprendizados pendentes |
| `POST /api/inbox/:id/decision` `{decision}` | Aprovar/negar (vira sinal na conversa) |
| `POST /api/inbox/:id/answer` `{text}` | Responder pergunta |
| `GET /api/brain` | Ontologia, entidades, ligações, lacunas |
| `GET /api/brain/entities/:id` · `GET /api/brain/search?q=` | Navegar o grafo |
| `GET /api/brain/playbooks` · `PATCH /api/brain/playbooks/:name` | Playbooks e autonomia de cada um |
| `GET /api/brain/runs` | Execuções de playbook (passo a passo) |
| `POST /api/brain/export` | Exporta o cérebro em Markdown (Obsidian) |
| `GET/PATCH /api/autonomy` | Níveis globais por categoria |
| `POST /api/recordings` · `GET /api/recordings/:id` · `POST …/audio` · `POST …/stop` | Demonstração no navegador |
| `GET /api/vault` · `PUT/DELETE /api/vault/:name` | Cofre (só nomes e descrições, nunca valores) |
| `GET /api/health` | Modelo, chave, ponte do Chrome, cérebro, onde fica o `.env` |

O servidor só escuta em loopback. Com `ORBI_API_TOKEN` definido, toda rota exige
`Authorization: Bearer <token>`.
