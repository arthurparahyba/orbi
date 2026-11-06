# Orbi

Copiloto local que **aprende** os procedimentos repetitivos depois do commit
(acompanhar a esteira, abrir PR, subir para dev e homologação, GMUD, atualizar
a versão de um MFE no portal) e passa a executá-los, pedindo aprovação quando a
regra de autonomia manda.

O código não sabe nada de CI, GMUD ou portal. Ele dá ao agente **mãos**
(terminal, navegador, Claude Code), **memória** (o cérebro), **voz** (componentes
de interface e perguntas) e **relógio** (retornos agendados). O resto o Orbi
aprende com você, por conversa ou por demonstração no navegador, e guarda como
playbook.

## Estrutura

```
orbi/
├── apps/
│   ├── runtime/          o agente: Flue + Claude Haiku 5.5, cérebro (SQLite), Chrome DevTools MCP,
│   │                     gravador de demonstrações, cofre, transcrição. Servidor local em 127.0.0.1:3000
│   └── desktop/          o app: React (Conversa, Cérebro, Autonomia) + Tauri (janela nativa que
│                         inicia e encerra o runtime)
├── packages/
│   └── contracts/        o contrato entre os dois: componentes do canal `ui` e tipos da API HTTP
├── scripts/
│   └── build-app.mjs     gera o executável com o runtime e o Node dentro
├── docs/                 arquitetura, ensinar pelo navegador, desenvolvimento, empacotamento
└── package.json          workspaces npm: um `npm install` para tudo
```

## Começar

Pré-requisitos: **Node ≥ 22.13**. Para a janela nativa e o executável, também o
**Rust** (`curl https://sh.rustup.rs -sSf | sh`) e, no macOS, as Xcode Command
Line Tools (`xcode-select --install`).

```bash
npm install          # instala runtime, desktop e contrato de uma vez
npm run demo         # runtime de demonstração (sem API key) em 127.0.0.1:3000
npm run demo:ui      # em outro terminal: o app no navegador, http://localhost:5174
```

Com a sua chave:

```bash
cp apps/runtime/.env.example apps/runtime/.env   # preencha ANTHROPIC_API_KEY (e GH_TOKEN…)
npm start            # compila e sobe runtime + app, e abre http://localhost:5174. Ctrl+C encerra tudo
```

`npm run dev` faz o mesmo numa janela nativa (precisa do Rust).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | Instala tudo (workspaces) |
| `npm start` | Sobe o Orbi completo (runtime + app no navegador) com o modelo real |
| `npm run dev` | Janela nativa + runtime, para desenvolver |
| `npm run demo` / `npm run demo:ui` | Runtime roteirizado com cérebro e portal de exemplo + app no navegador |
| `npm test` | Testes do runtime (fluxo completo com modelo falso) e checagem de tipos dos três pacotes |
| `npm run e2e` | Chrome DevTools MCP de verdade + demonstração gravada → cofre → reexecução |
| `npm run build` | Gera o executável: `Orbi.app` e `.dmg` no macOS |

## O app instalado

`npm run build` gera `apps/desktop/src-tauri/target/release/bundle/` com o
`Orbi.app` (e o `.dmg`). O app leva o runtime e o próprio Node dentro: quem o
usa só abre o Orbi. Os dados ficam fora do app:

```
~/Library/Application Support/br.com.zup.orbi/
├── .env            ANTHROPIC_API_KEY e demais configurações (criado na primeira execução)
├── data/           cérebro, conversas, perfil do Chrome do Orbi, índice do cofre
└── logs/runtime.log
```

As senhas ficam no Keychain do macOS, nunca nesses arquivos.

## Documentação

- [Arquitetura](docs/arquitetura.md): como o runtime, o app e o contrato se encaixam; API local
- [Ensinar pelo navegador](docs/ensinar-pelo-navegador.md): gravação de cliques + narração, cofre
- [Desenvolvimento](docs/desenvolvimento.md): testes, demo, como adicionar um componente de interface
- [Empacotamento](docs/empacotamento.md): o que o `npm run build` faz, tamanho, assinatura no macOS
