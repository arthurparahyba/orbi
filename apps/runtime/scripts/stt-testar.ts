/**
 * `npm run stt:testar -w @orbi/runtime`: loads the transcription model the
 * way the runtime does (same .env, same folder), showing each file it
 * downloads, then transcribes one second of silence. When narration fails
 * with "não transcrito", this shows why.
 */
import { loadConfig, loadDotEnv } from '../src/config.ts';
import { loadWhisper } from '../src/voice/stt.ts';

loadDotEnv();
const { stt } = loadConfig();
console.log(`[stt] transcrição: ${stt.backend}`);
if (stt.backend !== 'local') {
  console.log(stt.backend === 'http' ? `[stt] usa ${stt.url}; este teste é só para a transcrição local.` : '[stt] desligada (ORBI_STT=off).');
  process.exit(0);
}
console.log(`[stt] modelo ${stt.localModel}, de ${stt.offline ? `${stt.modelsDir} (sem baixar)` : (stt.modelHost ?? 'https://huggingface.co')}, guardado em ${stt.modelsDir}`);
const started = Date.now();
const shown = new Map<string, number>();
try {
  const asr = await loadWhisper(stt, (p) => {
    if (!p.file) return;
    const pct = Math.floor(p.progress ?? (p.status === 'done' ? 100 : 0));
    const last = shown.get(p.file) ?? -1;
    if (p.status === 'download' && last < 0) console.log(`[stt] baixando ${p.file}`);
    if (p.status === 'progress' && pct >= last + 25) {
      shown.set(p.file, pct);
      console.log(`[stt]   ${p.file}: ${pct}%${p.total ? ` de ${(p.total / 1e6).toFixed(0)} MB` : ''}`);
    }
    if (p.status === 'done') shown.set(p.file, 100);
  });
  console.log(`[stt] modelo carregado em ${((Date.now() - started) / 1000).toFixed(1)} s; testando…`);
  await asr(new Float32Array(16_000), { language: 'portuguese', task: 'transcribe' });
  console.log('[stt] tudo certo: a narração das demonstrações vai funcionar.');
} catch (error) {
  console.error(`[stt] FALHOU: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
