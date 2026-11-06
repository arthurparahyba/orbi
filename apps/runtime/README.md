# @orbi/runtime

O agente do Orbi: Flue + Claude Haiku 5.5, cérebro em SQLite, Chrome DevTools
MCP, gravador de demonstrações, cofre e transcrição. Servidor local em
`127.0.0.1:3000`, que o app desktop inicia sozinho.

Rode os comandos da raiz do repositório (`npm run demo`, `npm test`, `npm run e2e`).
Para rodar só o runtime: `npm run dev -w @orbi/runtime` (desenvolvimento,
porta 5173) ou `npm run build -w @orbi/runtime && npm start -w @orbi/runtime`.

Configuração: copie `.env.example` para `.env`.

Veja [docs/arquitetura.md](../../docs/arquitetura.md) e
[docs/ensinar-pelo-navegador.md](../../docs/ensinar-pelo-navegador.md).
