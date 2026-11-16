import { Hono } from 'hono';
import { ChooseVoiceModel } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body } from '../../http/errors.ts';
import { chooseVoiceModel, prepareVoiceModel } from './use-cases/choose-voice-model.ts';

/**
 * The transcription model on the Autonomia screen: which one, the folder and
 * files (with links to fetch them by hand), download with progress, and
 * changing model. Progress and results arrive as `voice` events.
 */
export function voiceRoutes({ voice, stt }: OrbiServices) {
  return new Hono()
    .get('/', (c) => c.json(voice.describe()))
    .post('/prepare', (c) => c.json(prepareVoiceModel({ voice, stt }), 202))
    .put('/model', async (c) => {
      const { model } = await body(c, ChooseVoiceModel);
      return c.json(chooseVoiceModel({ voice, stt }, model));
    });
}
