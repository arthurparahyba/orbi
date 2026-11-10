import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warmVoice } from '../src/voice/warm.ts';

test('voz: o modelo local é carregado ao abrir só se já está no disco e o pré-carregamento está ligado', () => {
  let warmed = 0;
  const stt = { get: () => ({ name: 'x', transcribe: async () => '', warm: async () => { warmed++; } }), set() {}, reset() {}, name: () => 'x' };
  const voice = (preload: boolean, complete: boolean, backend: 'local' | 'http' = 'local') =>
    ({ config: () => ({ preload, backend }), describe: () => ({ complete }) }) as never;
  warmVoice(voice(true, true), stt);
  warmVoice(voice(false, true), stt);
  warmVoice(voice(true, false), stt);
  warmVoice(voice(true, true, 'http'), stt);
  assert.equal(warmed, 1);
});
