import type { VoiceModel } from './model.ts';
import type { SttSlot } from './stt.ts';

/**
 * The local transcription model takes seconds to load into memory: load it ahead, so the first
 * dictation does not wait (the microphone shows "carregando" meanwhile). Only when its files are
 * already on disk: downloading ~250 MB stays something the developer asks for. ORBI_STT_PRELOAD=false
 * turns it off (saves memory; the first dictation waits for the load).
 */
export function warmVoice(voice: Pick<VoiceModel, 'config' | 'describe'>, stt: SttSlot): void {
  const config = voice.config();
  if (!config.preload || config.backend !== 'local' || !voice.describe().complete) return;
  void stt.get()?.warm?.().catch(() => undefined);
}
