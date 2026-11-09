# Empacotamento

```bash
npm install
npm run build                     # tudo o que a plataforma suporta
npm run build -- --bundles dmg    # só o .dmg (argumentos extras vão para o tauri build)
```

Gere na plataforma de destino: as dependências nativas (Keychain, onnxruntime)
são instaladas para a máquina que roda o build. No Mac com Apple Silicon sai um
app arm64.

## O que o `scripts/build-app.mjs` faz

1. Compila o runtime (`apps/runtime/dist`). O contrato entra no bundle.
2. Instala só as dependências de produção do runtime, nas versões exatas do
   `package-lock.json` da raiz, em `apps/desktop/src-tauri/resources/runtime`.
3. Poda binários de outras plataformas: o Claude Code nativo de outros sistemas
   e o onnxruntime (Whisper local) de outros sistemas e arquiteturas.
4. Copia o Node que está rodando o build para `binaries/orbi-node-<plataforma>`.
   O app leva o próprio Node e não depende do da máquina. Use Node ≥ 22.13.
5. Roda `tauri build` com `tauri.bundle.conf.json`, que acrescenta o runtime
   (Resources/runtime) e o `orbi-node` (ao lado do executável).

Saída em `apps/desktop/src-tauri/target/release/bundle/` (`macos/Orbi.app`,
`dmg/Orbi_0.1.0_aarch64.dmg`).

## Tamanho

O runtime embutido ocupa uns 750 MB descompactado (o pacote compactado fica
perto de 300 MB). A maior parte é:

- Claude Code nativo (~320 MB), usado para corrigir código;
- onnxruntime (~200 MB), usado pela transcrição local;
- o próprio Node (~100 MB).

Se a transcrição for sempre por um serviço (`ORBI_STT_URL`), dá para tirar o
`@huggingface/transformers` das dependências e economizar uns 250 MB.

## Assinatura no macOS

Um app gerado na sua própria máquina abre normalmente. Para distribuir para
outras pessoas sem o aviso do Gatekeeper, é preciso assinar e notarizar com um
Developer ID da Apple: o Tauri faz isso se as variáveis `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD` e `APPLE_TEAM_ID` estiverem definidas no build.
Sem isso, quem recebe o app abre pelo clique direito → Abrir na primeira vez.

O app pede permissão de microfone na primeira gravação narrada
(`Info.plist` e `Entitlements.plist` em `apps/desktop/src-tauri/`).

## Windows (.exe sem Rust na sua máquina)

O instalador sai do GitHub Actions, num Windows com Rust:
**Actions → App Windows → Run workflow**. Ao terminar, o `.exe` está em
*Artifacts* (`Orbi-windows`). Uma tag `v*` (ex.: `v0.2.0`) também gera e anexa o
`.exe` a uma release (`.github/workflows/app-windows.yml`).

- Instala **por usuário** (`installMode: currentUser`): não precisa de administrador.
  O programa vai para `%LOCALAPPDATA%\Orbi`.
- Precisa do WebView2, que já vem no Windows 10 e 11. Se faltar, o instalador baixa.
- O instalador não é assinado: o Windows pode mostrar "o Windows protegeu o
  computador" na primeira vez (Mais informações → Executar assim mesmo). Política da
  empresa pode bloquear instaladores sem assinatura.
- Os testes rodam no Windows a cada build, como aviso (não impedem o `.exe`).

## Onde ficam os seus dados (e por que a atualização não apaga)

O app instalado separa o programa dos seus dados. O programa é substituído na
atualização; os dados ficam em:

| Sistema | Pasta |
| --- | --- |
| Windows | `%APPDATA%\br.com.zup.orbi` |
| macOS | `~/Library/Application Support/br.com.zup.orbi` |

| Dentro dela | O quê |
| --- | --- |
| `.env` | A configuração (chave do modelo, binários permitidos, transcrição…) |
| `data/` | Cérebro, conversas, pendências, esteiras (`orbi.db`, `flue.db`) e os modelos baixados (`data/models`, ex.: transcrição) |
| `plugins/` | Plugins de modelo |
| `workspace/` | Pasta de trabalho dos comandos |
| `logs/` | `runtime.log` |

Credenciais não ficam aí: vão para o cofre do sistema (Gerenciador de Credenciais
no Windows, Keychain no macOS).

Com `npm start`, tudo isso fica dentro do clone (`apps/runtime/.env` e
`apps/runtime/data/`). Para levar para o app instalado, feche os dois e copie
`.env` e o conteúdo de `data/` para a pasta da tabela acima.
