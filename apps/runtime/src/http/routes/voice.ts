import { Hono } from 'hono';
import { ChooseVoiceModel } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body } from '../errors.ts';

/**
 * The transcription model on the Autonomia screen: which one, the folder and
 * files (with links to fetch them by hand), download with progress, and
 * changing model. Progress and results arrive as `voice` events.
 */
export function voiceRoutes({ voice, stt }: OrbiServices) {
  return new Hono()
    .get('/', (c) => c.json(voice.describe()))
    .post('/prepare', (c) => {
      // Rebuild so the next transcription uses what is on disk now (files put there by hand).
      stt.reset();
      void voice.prepare().then(() => stt.reset());
      return c.json(voice.describe(), 202);
    })
    .put('/model', async (c) => {
      const { model } = await body(c, ChooseVoiceModel);
      voice.choose(model);
      stt.reset();
      return c.json(voice.describe());
    });
}
