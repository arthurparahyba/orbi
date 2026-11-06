# Ensinar pelo navegador

O jeito mais rápido de ensinar um procedimento web (portal, ServiceNow…): na
Conversa, clique em **Ensinar pelo navegador**, faça o procedimento no Chrome
que abrir e, se quiser, explique em voz alta. Ao clicar em **Terminar e
aprender**, o Orbi junta as duas trilhas e propõe o playbook para você aprovar.

```
App (microfone) ──WAV 16 kHz por pausa──▶ runtime ──▶ Whisper ─┐
                                                               ├─▶ linha do tempo ─▶ agente ─▶ playbook (aprovação)
Chrome do Orbi ──CDP: navegação, cliques, campos──▶ gravador ─┘
                                  └─ senha/usuário ─▶ cofre (nunca no cérebro)
```

- **Cliques** (`apps/runtime/src/browser/recorder.ts`, `page-recorder.ts`): um script em cada
  página registra navegação, cliques, campos, seleções e Enter pelo *papel e
  rótulo* do elemento (“o campo Versão na aba Configuração”), não por seletor CSS.
  O Chrome é o mesmo que o agente usa via chrome-devtools-mcp (perfil próprio em
  `data/chrome-profile`, aberto sob demanda).
- **Fala** (`apps/runtime/src/voice/stt.ts`): o app corta o áudio nas pausas e manda trechos WAV com
  horário; o runtime transcreve com Whisper **local** (transformers.js; o modelo
  é baixado uma vez para `data/models`, o áudio não sai da máquina) ou com um
  endpoint compatível com a API da OpenAI (`ORBI_STT_URL`).
- **Síntese**: a linha do tempo (AÇÃO/FALA no mesmo relógio) vai ao agente, que
  segue a seção “Aprender por demonstração” da skill: intenção e gatilho vêm da
  fala, a mecânica vem dos cliques, valores variáveis viram `{{parâmetros}}`.
- **Credenciais** (`apps/runtime/src/vault/vault.ts`): campos de senha/token/código e o usuário de
  um formulário de login vão **direto para o cofre** — Keychain do macOS
  (Credential Manager no Windows, Secret Service no Linux) ou, sem cofre do
  sistema, um arquivo AES-256-GCM. A gravação, a mensagem ao agente, o cérebro e
  o playbook só têm a referência `{{segredo:host/campo}}`; o `browser_act`
  substitui o valor na hora de preencher e apaga-o de qualquer saída. Gerencie
  na tela Autonomia → Cofre.

```bash
npm run e2e:demo -w @orbi/runtime   # grava uma demonstração num portal local, confere o cofre e reexecuta pelo MCP
```

O cartão de aprovação mostra o que vai ser guardado já legível: o playbook em
passos numerados, o gatilho, a que classe se aplica, os parâmetros e as
credenciais (só os nomes no cofre), além dos fatos que entram no grafo.

Transcrição: sem configurar nada, usa Whisper local (`whisper-small`, ~250 MB
no primeiro uso). Para um modelo maior ou um serviço da empresa:

```bash
ORBI_STT_LOCAL_MODEL=onnx-community/whisper-large-v3-turbo   # local, mais preciso, mais pesado
# ou qualquer endpoint compatível com /v1/audio/transcriptions
ORBI_STT_URL=https://api.openai.com/v1/audio/transcriptions ORBI_STT_API_KEY=… ORBI_STT_MODEL=whisper-1
```

No macOS o app pede permissão de microfone na primeira gravação
(`apps/desktop/src-tauri/Info.plist`).

`apps/runtime/scripts/ui-narration/` tem o teste da trilha de áudio pela interface: Chromium
com microfone falso tocando uma narração sintetizada (`espeak-ng`), um endpoint
de transcrição simulado que valida cada WAV, e o roteiro completo (gravar →
aprovar → executar).

No `npm run demo`, o botão já vem com um portal de exemplo
(`http://127.0.0.1:4310/login`, usuário `arthur`, senha `s3nh@-Portal!`).
