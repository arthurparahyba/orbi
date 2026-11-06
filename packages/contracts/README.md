# @orbi/contracts

O que trafega entre o runtime e o app: o esquema dos componentes do canal `ui`
(`src/ui.ts`) e os formatos da API HTTP (`src/api.ts`). TypeScript puro, sem
etapa de build; os dois lados o compilam junto.

Mudou aqui? Rode `npm test` na raiz: a checagem de tipos mostra o que precisa
acompanhar no runtime (`src/contract-check.ts`) e no app.
