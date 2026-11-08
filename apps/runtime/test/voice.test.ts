/**
 * The transcription model on the Autonomia screen: folder, files and links,
 * changing model, and a failed download that says why.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { createOrbi } from '../src/compose.ts';
import { createHttpApp } from '../src/http/app.ts';
import { Orbi } from '../src/agents/orbi.ts';
import { MODEL_FILES } from '../src/voice/model.ts';

const background = { bridge: () => undefined, bridgeError: () => 'desligado', stop: async () => {} };

async function setup(env: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'orbi-voice-'));
  const orbi = await createOrbi(loadConfig({ ORBI_VAULT: 'file', CHROME_MCP_AUTOSTART: 'false', ...env }, cwd), {}, {});
  const app = createHttpApp(orbi, background, Orbi);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { orbi, call };
}

test('voz: mostra a pasta, os arquivos que faltam e de onde baixar cada um', async () => {
  const { orbi, call } = await setup();
  const { json } = await call('GET', '/api/voice');
  assert.equal(json.model, 'onnx-community/whisper-small');
  assert.equal(json.dir, join(orbi.config.stt.modelsDir, 'onnx-community/whisper-small'));
  assert.equal(json.complete, false);
  assert.equal(json.files.length, MODEL_FILES.length);
  assert.equal(json.files[5].url, 'https://huggingface.co/onnx-community/whisper-small/resolve/main/onnx/encoder_model_quantized.onnx');

  // Files put there by hand count.
  for (const f of MODEL_FILES) {
    mkdirSync(join(json.dir, f, '..'), { recursive: true });
    writeFileSync(join(json.dir, f), 'x');
  }
  assert.equal((await call('GET', '/api/voice')).json.complete, true);
});

test('voz: trocar de modelo vale na hora e volta ao padrão', async () => {
  const { call } = await setup({ ORBI_STT_MODEL_HOST: 'https://espelho.acme.internal/hf' });
  const chosen = await call('PUT', '/api/voice/model', { model: 'onnx-community/whisper-base' });
  assert.equal(chosen.json.model, 'onnx-community/whisper-base');
  assert.equal(chosen.json.defaultModel, 'onnx-community/whisper-small');
  assert.match(chosen.json.files[0].url, /^https:\/\/espelho\.acme\.internal\/hf\/onnx-community\/whisper-base\/resolve\/main\/config\.json$/);
  assert.equal((await call('PUT', '/api/voice/model', { model: 'nao tem barra' })).status, 400);
  assert.equal((await call('PUT', '/api/voice/model', { model: null })).json.model, 'onnx-community/whisper-small');
});

test('voz: download que falha diz o arquivo e a causa', async () => {
  const { orbi, call } = await setup({ ORBI_STT_MODEL_HOST: 'http://127.0.0.1:9/' });
  assert.equal((await call('POST', '/api/voice/prepare')).status, 202);
  for (let i = 0; i < 100 && orbi.voice.describe().status.state === 'downloading'; i++) await new Promise((r) => setTimeout(r, 100));
  const status = orbi.voice.describe().status;
  assert.equal(status.state, 'error');
  assert.match((status as { message: string }).message, /não consegui carregar o modelo de transcrição onnx-community\/whisper-small de http:\/\/127\.0\.0\.1:9\/.*Autonomia/);
});
