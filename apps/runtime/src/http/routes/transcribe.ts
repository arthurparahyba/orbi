import { Hono } from 'hono';
import type { OrbiServices } from '../../services.ts';
import { HttpError } from '../errors.ts';
import { log } from '../../observability/log.ts';

const MAX_AUDIO = 8 * 1024 * 1024;

/**
 * POST /api/transcribe — dictation in the chat box: a WAV (16 kHz mono PCM16)
 * comes in, its text goes back. Nothing is stored and nothing reaches the
 * agent: the developer reads the text in the box and sends it if it is right.
 */
export function transcribeRoutes({ stt }: OrbiServices) {
  return new Hono().post('/', async (c) => {
    const wav = Buffer.from(await c.req.arrayBuffer());
    if (wav.length < 44) throw new HttpError(400, 'invalid_body', 'envie o áudio em audio/wav');
    if (wav.length > MAX_AUDIO) throw new HttpError(413, 'too_large', 'áudio grande demais (máx. 8 MB)');
    const transcriber = stt.get();
    if (!transcriber) throw new HttpError(409, 'conflict', 'a transcrição está desligada (ORBI_STT=off)');
    try {
      return c.json({ text: await transcriber.transcribe(wav) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn('ditado não transcrito', { error: message });
      throw new HttpError(500, 'transcription_failed', message);
    }
  });
}
