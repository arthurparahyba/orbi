/**
 * Narration capture for demonstrations. The microphone is read as PCM,
 * downsampled to 16 kHz mono and cut into segments at natural pauses
 * (≥ 6 s of audio followed by ~0.7 s of silence, or 20 s at most). Each
 * segment is sent as a WAV with the wall-clock time it started, so the
 * runtime can line speech up with the clicks. Silent segments are dropped —
 * Whisper tends to "hear" phrases in silence.
 */
const TARGET_RATE = 16_000;
const MIN_SEGMENT_S = 6;
const MAX_SEGMENT_S = 20;
const PAUSE_S = 0.7;

export interface NarratorEvents {
  onSegment(startedAt: number, durationMs: number, wav: Blob): void;
  onLevel?(level: number): void;
}

export class Narrator {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: ScriptProcessorNode;
  private chunks: Float32Array[] = [];
  private samples = 0;
  private silentFor = 0;
  private peak = 0;
  private segmentStart = 0;
  muted = false;

  constructor(public events: NarratorEvents) {}

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const source = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but works everywhere (WKWebView, WebKitGTK, Chromium) without a worklet file.
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    const ratio = this.ctx.sampleRate / TARGET_RATE;
    this.segmentStart = Date.now();
    this.node.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      this.events.onLevel?.(this.muted ? 0 : Math.min(1, rms * 8));
      if (this.muted) return;
      const out = new Float32Array(Math.floor(input.length / ratio));
      for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)];
      if (this.samples === 0) this.segmentStart = Date.now() - (input.length / this.ctx!.sampleRate) * 1000;
      this.chunks.push(out);
      this.samples += out.length;
      this.peak = Math.max(this.peak, rms);
      this.silentFor = rms < 0.012 ? this.silentFor + out.length / TARGET_RATE : 0;
      const seconds = this.samples / TARGET_RATE;
      if ((seconds >= MIN_SEGMENT_S && this.silentFor >= PAUSE_S) || seconds >= MAX_SEGMENT_S) this.flush();
    };
    source.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  setMuted(muted: boolean) {
    if (muted && !this.muted) this.flush();
    this.muted = muted;
  }

  private flush() {
    if (this.samples === 0) return;
    const all = new Float32Array(this.samples);
    let o = 0;
    for (const c of this.chunks) { all.set(c, o); o += c.length; }
    const started = this.segmentStart, duration = (this.samples / TARGET_RATE) * 1000, speech = this.peak > 0.02;
    this.chunks = []; this.samples = 0; this.silentFor = 0; this.peak = 0;
    if (speech) this.events.onSegment(started, duration, encodeWav(all));
  }

  async stop() {
    this.flush();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
  }
}

export function encodeWav(samples: Float32Array, rate = TARGET_RATE): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}
