# Plugins

Cada pasta aqui é um plugin do Orbi. Hoje o tipo suportado é `llm`: a conexão
com um modelo de linguagem (por exemplo o LLM da sua empresa).

```bash
npm run plugin:new -- gateway-empresa     # cria plugins/gateway-empresa a partir do modelo
npm run plugin:test -- gateway-empresa    # testa contra o LLM real
```

Ative com `ORBI_LLM=<nome>` em `apps/runtime/.env`. No app instalado, a pasta de
plugins é `~/Library/Application Support/br.com.zup.orbi/plugins`.

O conteúdo desta pasta (fora este README) não vai para o git do Orbi: o plugin
da empresa pode ter um repositório próprio. Guia completo: `docs/plugins.md`.
