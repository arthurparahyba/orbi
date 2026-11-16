import type { OrbiServices } from '../../../services.ts';
import type { VoiceStatus } from '../voice/src/model.ts';
import { warmVoice } from '../voice/src/warm.ts';

/**
 * O modelo de transcrição da tela Autonomia: escolher qual é, e preparar o que está em disco.
 * Trocar o modelo e preparar são a mesma dança em ordens diferentes — a escolha, o slot de
 * transcrição esvaziado, e o modelo carregado na memória antes do primeiro ditado (documento 27).
 */

type Deps = Pick<OrbiServices, 'voice' | 'stt'>;

export function chooseVoiceModel(d: Deps, model: string | null): VoiceStatus {
  d.voice.choose(model);
  // O slot guarda o transcritor do modelo antigo: esvaziar faz o próximo ditado usar o novo.
  d.stt.reset();
  warmVoice(d.voice, d.stt);
  return d.voice.describe();
}

export function prepareVoiceModel(d: Deps): VoiceStatus {
  // Remonta agora, para a próxima transcrição usar o que está em disco (arquivos postos à mão).
  d.stt.reset();
  // O download é longo: a tela acompanha por eventos `voice`, não esperando esta resposta.
  void d.voice.prepare().then(() => {
    d.stt.reset();
    warmVoice(d.voice, d.stt);
  });
  return d.voice.describe();
}
