# Plugins

Cada pasta aqui é um plugin do Orbi. Hoje o tipo suportado é `llm`: a conexão
com um modelo de linguagem (por exemplo o LLM da sua empresa).

```bash
npm run plugin:new -- gateway-empresa     # cria plugins/gateway-empresa a partir do modelo
npm run plugin:test -- gateway-empresa    # testa contra o LLM real
```

Ative com `ORBI_LLM=<nome>` no `.env`. O melhor lugar para o plugin é a pasta do
app instalado, que vale também para o `npm start` e não some numa atualização:
`%APPDATA%\br.com.zup.orbi\plugins` no Windows,
`~/Library/Application Support/br.com.zup.orbi/plugins` no macOS.

O conteúdo desta pasta (fora este README) não vai para o git do Orbi: o plugin
da empresa pode ter um repositório próprio. Guia completo: `docs/plugins.md`.
