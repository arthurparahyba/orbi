import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { OrbiConfig } from '../config.ts';
import { log } from '../observability/log.ts';
import { loadWhisper, modelLoadError, type ModelProgress } from './stt.ts';

type SttConfig = OrbiConfig['stt'];

/**
 * The files a Whisper model from onnx-community needs, at the precision Orbi
 * uses (q8). transformers.js looks for them in `<pasta>/<modelo>/…` before
 * going to the internet, so whoever cannot download from here can fetch them
 * by hand (links on the Autonomia screen) and drop them in that folder.
 */
export const MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

/** Whisper models that work as they are (same files, same names). */
export const KNOWN_MODELS = [
  { id: 'onnx-community/whisper-base', size: '~80 MB', note: 'mais rápido, erra mais' },
  { id: 'onnx-community/whisper-small', size: '~250 MB', note: 'padrão: bom equilíbrio' },
  { id: 'onnx-community/whisper-large-v3-turbo', size: '~1,1 GB', note: 'o melhor em português, mais lento e pesado' },
];

export type VoiceState =
  | { state: 'idle' }
  | { state: 'downloading'; file?: string; progress?: number }
  | { state: 'ready' }
  | { state: 'error'; message: string };

export interface VoiceStatus {
  backend: SttConfig['backend'];
  /** For backend http: where the audio goes. */
  url?: string;
  model: string;
  /** Default model (from .env); `model` differs when changed on the screen. */
  defaultModel: string;
  /** The folder the files go into (absolute). */
  dir: string;
  host: string;
  offline: boolean;
  files: Array<{ path: string; present: boolean; bytes: number; url: string }>;
  /** Every file is on disk. */
  complete: boolean;
  known: typeof KNOWN_MODELS;
  status: VoiceState;
}

/**
 * The local transcription model: which one, where it is, what is missing,
 * downloading it on request (with progress) and changing it. The choice made
 * on the screen is kept in `settings` (key `stt`) and wins over the .env.
 */
export class VoiceModel {
  private status: VoiceState = { state: 'idle' };
  private download?: Promise<void>;

  constructor(
    private readonly db: DatabaseSync,
    private readonly base: SttConfig,
    private readonly onChange: () => void,
  ) {}

  /** The configuration in effect: the .env plus the model chosen on the screen. */
  config(): SttConfig {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'stt'").get() as { value: string } | undefined;
    const saved = row ? (JSON.parse(row.value) as { model?: string }) : {};
    return { ...this.base, localModel: saved.model || this.base.localModel };
  }

  describe(): VoiceStatus {
    const stt = this.config();
    const host = (stt.modelHost ?? 'https://huggingface.co/').replace(/\/?$/, '/');
    const dir = join(stt.modelsDir, stt.localModel);
    const files = MODEL_FILES.map((path) => {
      const full = join(dir, path);
      const present = existsSync(full) && statSync(full).size > 0;
      return { path, present, bytes: present ? statSync(full).size : 0, url: `${host}${stt.localModel}/resolve/main/${path}` };
    });
    return {
      backend: stt.backend,
      ...(stt.backend === 'http' ? { url: stt.url } : {}),
      model: stt.localModel,
      defaultModel: this.base.localModel,
      dir,
      host,
      offline: stt.offline,
      files,
      complete: files.every((f) => f.present),
      known: KNOWN_MODELS,
      status: this.status,
    };
  }

  /** Downloads (or just loads, when the files are there) and checks it transcribes. */
  prepare(): Promise<void> {
    this.download ??= (async () => {
      const stt = this.config();
      this.set({ state: 'downloading' });
      let lastShown = 0;
      try {
        const asr = await loadWhisper(stt, (p: ModelProgress) => {
          if (p.status !== 'progress' || !p.file) return;
          const now = Date.now();
          if (now - lastShown < 500 && (p.progress ?? 0) < 100) return;
          lastShown = now;
          this.set({ state: 'downloading', file: p.file, progress: Math.floor(p.progress ?? 0) });
        });
        await asr(new Float32Array(16_000), { language: stt.language, task: 'transcribe' });
        this.set({ state: 'ready' });
      } catch (error) {
        const message = error instanceof Error ? error.message : modelLoadError(stt, '', error);
        log.error('modelo de transcrição não ficou pronto', { model: stt.localModel, error: message });
        this.set({ state: 'error', message });
      } finally {
        this.download = undefined;
      }
    })();
    return this.download;
  }

  /** Another model (or back to the default with null). Takes effect at the next transcription. */
  choose(model: string | null): void {
    if (model) {
      this.db.prepare("INSERT INTO settings (key, value) VALUES ('stt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ model }));
    } else {
      this.db.prepare("DELETE FROM settings WHERE key = 'stt'").run();
    }
    this.set({ state: 'idle' });
  }

  /** Called by the transcriber when loading fails or works, so the screen tells the same story. */
  report(state: VoiceState): void {
    if (this.status.state === 'downloading' && this.download) return;
    this.set(state);
  }

  private set(state: VoiceState) {
    this.status = state;
    this.onChange();
  }
}
