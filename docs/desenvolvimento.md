# Desenvolvimento

Tudo se roda da raiz. Os workspaces do npm instalam os três pacotes num
`node_modules` só, com um único `package-lock.json`.

```bash
npm install
npm run demo        # runtime roteirizado: sem API key, cérebro e portal de exemplo
npm run demo:ui     # app no navegador com hot reload (http://localhost:5174)
npm run dev         # janela nativa + runtime real (precisa de apps/runtime/.env)
```

Para rodar um comando de um pacote só: `npm run <script> -w @orbi/runtime` (ou
`@orbi/desktop`).

## O modo demonstração

`npm run demo` sobe o runtime com um modelo roteirizado (o provedor falso do
Pi), um cérebro com exemplos e um portal de teste em
`http://127.0.0.1:4310/login` (usuário `arthur`, senha `s3nh@-Portal!`). Roteiro:

1. “Vou te ensinar como subir a versão de um front no portal” → aprovar o cartão
2. “Atualiza a versão do novo-front no portal para 2.4.0” → o playbook roda passo a passo
3. **Ensinar pelo navegador** → grava cliques e fala no portal de teste

## Testes

```bash
npm test     # unidade + fluxo completo do agente com modelo falso + tipos dos três pacotes
npm run e2e  # Chrome headless de verdade: ponte MCP e demonstração → cofre → reexecução
```

`npm test` também roda `contract-check.ts`: se o runtime mudar o formato de algo
que o app lê, a checagem de tipos falha.

## Adicionar um componente de interface

1. `packages/contracts/src/ui.ts`: acrescente a variante ao esquema `UiComponent`.
2. `apps/desktop/src/components/UiComponents.tsx`: desenhe-a em `UiComponentView`.
   O TypeScript aponta o `switch` incompleto.
3. Se o agente precisar saber dele, descreva-o nas instruções de `show_ui` em
   `apps/runtime/src/agents/capabilities.ts`.

## Dependências fixadas

`@earendil-works/pi-ai` e `pi-agent-core` estão fixados em 1.1.0 em `overrides`
no `package.json` da raiz, porque o Flue 2.3.0 quebra com o Pi 1.2+. Em
workspaces, `overrides` só vale na raiz.
