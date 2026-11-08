import { mkdirSync } from 'node:fs';
import type { OrbiConfig } from '../config.ts';
import { log } from '../observability/log.ts';

type SttConfig = OrbiConfig['stt'];

/**
 * Speech-to-text for narrated demonstrations. Audio arrives as short WAV
 * segments (16 kHz mono PCM16) cut at pauses by the desktop app.
 *
 *  - `local` (default): Whisper on this machine via transformers.js. The model
 *    (ORBI_STT_LOCAL_MODEL, default whisper-small, ~250 MB) is downloaded from
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

type Asr = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>;
export type ModelProgress = { status: string; file?: string; progress?: number; loaded?: number; total?: number };

/**
 * Loads Whisper with transformers.js, downloading it into modelsDir the first
 * time. The library decides whether to cache a download with
 * `response instanceof Response`; a fetch from another implementation fails
 * that check, nothing is cached, and loading ends in "Unable to get model file
 * path or buffer". So fetch here always hands back this runtime's Response.
 * A failure names the file and the real cause (blocked host, status, disk).
 */
export async function loadWhisper(stt: SttConfig, onProgress?: (p: ModelProgress) => void): Promise<Asr> {
  mkdirSync(stt.modelsDir, { recursive: true });
  const t = await import('@huggingface/transformers').catch(() => {
    throw new Error('transcrição local precisa do pacote @huggingface/transformers (npm install)');
  });
  t.env.cacheDir = stt.modelsDir;
  t.env.useFSCache = true;
  t.env.useBrowserCache = false;
  t.env.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const res: Pick<Response, 'body' | 'status' | 'statusText' | 'headers'> = await fetch(input, init);
    return res instanceof Response ? res : new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
  if (stt.modelHost) t.env.remoteHost = stt.modelHost.endsWith('/') ? stt.modelHost : `${stt.modelHost}/`;
  // Files already in the folder (downloaded before, or put there by hand) are used without
  // going to the internet: transformers.js looks in localModelPath first.
  t.env.allowLocalModels = true;
  t.env.localModelPath = stt.modelsDir;
  if (stt.offline) t.env.allowRemoteModels = false;
  let lastFile = '';
  try {
    return (await t.pipeline('automatic-speech-recognition', stt.localModel, {
      dtype: 'q8',
      progress_callback: (p: ModelProgress) => {
        if (p.file) lastFile = p.file;
        onProgress?.(p);
      },
    })) as unknown as Asr;
  } catch (error) {
    throw new Error(modelLoadError(stt, lastFile, error));
  }
}

/** One line a person can act on, with the underlying cause (fetch errors hide it in `cause`). */
export function modelLoadError(stt: Pick<SttConfig, 'localModel' | 'modelHost' | 'offline' | 'modelsDir'>, file: string, error: unknown): string {
  const causes: string[] = [];
  for (let e: unknown = error; e && causes.length < 4; e = (e as { cause?: unknown }).cause) {
    const msg = e instanceof Error ? `${e.message}${(e as { code?: string }).code ? ` (${(e as { code?: string }).code})` : ''}` : String(e);
    if (!causes.includes(msg)) causes.push(msg);
  }
  const where = stt.offline ? `em ${stt.modelsDir}` : `de ${stt.modelHost ?? 'huggingface.co'}`;
  return `não consegui carregar o modelo de transcrição ${stt.localModel} ${where}${file ? ` (arquivo ${file})` : ''}: ${causes.join(' ← ')}. ` +
    'Veja em Autonomia → Transcrição de voz: dá para baixar de novo ou colocar os arquivos à mão.';
}

function localWhisper(stt: SttConfig, report?: (ok: boolean, message?: string) => void): Transcriber {
  let asr: Promise<Asr> | undefined;
  const load = () =>
    (asr ??= (async () => {
      log.info('carregando modelo de transcrição (a primeira vez baixa o modelo)', { model: stt.localModel, dir: stt.modelsDir });
      let reported = '';
      return loadWhisper(stt, (p) => {
        if (p.status === 'download' && p.file && p.file !== reported) {
          reported = p.file;
          log.info('baixando arquivo do modelo de transcrição', { file: p.file });
        }
      });
    })().then(
      (loaded) => { report?.(true); return loaded; },
      (error) => {
        asr = undefined;
        log.error('modelo de transcrição não carregou', { error });
        report?.(false, error instanceof Error ? error.message : String(error));
        throw error;
      },
    ));
  return {
    name: `local:${stt.localModel}`,
    async transcribe(wav) {
      const { samples } = wavToFloat32(wav);
      const run = await load();
      const languageName: Record<string, string> = { pt: 'portuguese', en: 'english', es: 'spanish' };
      const result = await run(samples, {
        language: languageName[stt.language] ?? stt.language,
        task: 'transcribe',
        chunk_length_s: 30,
      });
      return (Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text).trim();
    },
  };
}

function httpWhisper(stt: SttConfig): Transcriber {
  if (!stt.url) throw new Error('ORBI_STT_URL não definido');
  return {
    name: `http:${stt.model}`,
    async transcribe(wav) {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'narracao.wav');
      form.append('model', stt.model);
      form.append('language', stt.language);
      form.append('response_format', 'json');
      const res = await fetch(stt.url!, {
        method: 'POST',
        headers: stt.apiKey ? { authorization: `Bearer ${stt.apiKey}` } : {},
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`transcrição falhou: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return String(((await res.json()) as { text?: string }).text ?? '').trim();
    },
  };
}

/**
 * The transcriber in use. Created lazily from the config (loading Whisper is
 * slow); tests and the demo swap in their own with `set`.
 */
export interface SttSlot {
  get(): Transcriber | null;
  set(t: Transcriber | null): void;
  /** Forget the current one (the model changed): the next use builds it again. */
  reset(): void;
  /** Name for /api/health, without loading anything heavy. */
  name(): string;
}

export function createStt(config: SttConfig | (() => SttConfig), report?: (ok: boolean, message?: string) => void): SttSlot {
  let current: Transcriber | null | undefined;
  const build = () => {
    const stt = typeof config === 'function' ? config() : config;
    return stt.backend === 'off' ? null : stt.backend === 'http' ? httpWhisper(stt) : localWhisper(stt, report);
  };
  return {
    get: () => (current === undefined ? (current = build()) : current),
    set: (t) => {
      current = t;
    },
    reset: () => {
      current = undefined;
    },
    name() {
      try {
        return this.get()?.name ?? 'desligada';
      } catch (error) {
        return `erro: ${(error as Error).message}`;
      }
    },
  };
}
