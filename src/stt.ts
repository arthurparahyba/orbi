import { mkdirSync } from 'node:fs';
import { config } from './config.ts';

/**
 * Speech-to-text for narrated demonstrations. Audio arrives as short WAV
 * segments (16 kHz mono PCM16) cut at pauses by the desktop app.
 *
 *  - `local` (default): Whisper on this machine via transformers.js. The model
 *    (VIGIA_STT_LOCAL_MODEL, default whisper-small, ~250 MB) is downloaded from
 *    Hugging Face on first use and cached in data/models. Audio never leaves
 *    the machine.
 *  - `http`: any OpenAI-compatible /audio/transcriptions endpoint
 *    (OpenAI, Groq, Azure, a self-hosted faster-whisper server…).
 *  - `off`: demonstrations without narration.
 */
export interface Transcriber {
  name: string;
  transcribe(wav: Buffer): Promise<string>;
}

/** Decode a PCM16 WAV into 16 kHz mono float samples (what Whisper expects). */
export function wavToFloat32(wav: Buffer): { samples: Float32Array; sampleRate: number } {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('áudio não é WAV');
  let offset = 12, sampleRate = 16_000, channels = 1, bits = 16;
  let data: Buffer | undefined;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const body = wav.subarray(offset + 8, offset + 8 + size);
    if (id === 'fmt ') {
      channels = body.readUInt16LE(2);
      sampleRate = body.readUInt32LE(4);
      bits = body.readUInt16LE(14);
    } else if (id === 'data') data = body;
    offset += 8 + size + (size % 2);
  }
  if (!data || bits !== 16) throw new Error('WAV precisa ser PCM 16 bits');
  const frames = Math.floor(data.length / 2 / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2) / 32768;
    mono[i] = sum / channels;
  }
  if (sampleRate === 16_000) return { samples: mono, sampleRate };
  // Linear resample to 16 kHz.
  const ratio = sampleRate / 16_000;
  const out = new Float32Array(Math.floor(frames / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio, i0 = Math.floor(x), i1 = Math.min(i0 + 1, frames - 1);
    out[i] = mono[i0] + (mono[i1] - mono[i0]) * (x - i0);
  }
  return { samples: out, sampleRate: 16_000 };
}

function localWhisper(): Transcriber {
  type Asr = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>;
  let asr: Promise<Asr> | undefined;
  const load = () =>
    (asr ??= (async () => {
      mkdirSync(config.stt.modelsDir, { recursive: true });
      const t = await import('@huggingface/transformers').catch(() => {
        throw new Error('transcrição local precisa do pacote @huggingface/transformers (npm install)');
      });
      t.env.cacheDir = config.stt.modelsDir;
      console.log(`[vigia] carregando ${config.stt.localModel} para transcrição (primeira vez baixa o modelo)…`);
      return (await t.pipeline('automatic-speech-recognition', config.stt.localModel, { dtype: 'q8' })) as unknown as Asr;
    })().catch((error) => {
      asr = undefined;
      throw error;
    }));
  return {
    name: `local:${config.stt.localModel}`,
    async transcribe(wav) {
      const { samples } = wavToFloat32(wav);
      const run = await load();
      const languageName: Record<string, string> = { pt: 'portuguese', en: 'english', es: 'spanish' };
      const result = await run(samples, {
        language: languageName[config.stt.language] ?? config.stt.language,
        task: 'transcribe',
        chunk_length_s: 30,
      });
      return (Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text).trim();
    },
  };
}

function httpWhisper(): Transcriber {
  if (!config.stt.url) throw new Error('VIGIA_STT_URL não definido');
  return {
    name: `http:${config.stt.model}`,
    async transcribe(wav) {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'narracao.wav');
      form.append('model', config.stt.model);
      form.append('language', config.stt.language);
      form.append('response_format', 'json');
      const res = await fetch(config.stt.url!, {
        method: 'POST',
        headers: config.stt.apiKey ? { authorization: `Bearer ${config.stt.apiKey}` } : {},
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`transcrição falhou: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return String(((await res.json()) as { text?: string }).text ?? '').trim();
    },
  };
}

let current: Transcriber | null | undefined;

export function transcriber(): Transcriber | null {
  if (current !== undefined) return current;
  current = config.stt.backend === 'off' ? null : config.stt.backend === 'http' ? httpWhisper() : localWhisper();
  return current;
}

/** Tests and the demo plug in their own transcriber. */
export function setTranscriber(t: Transcriber | null) {
  current = t;
}
