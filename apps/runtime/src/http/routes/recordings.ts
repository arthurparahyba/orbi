import { Hono } from 'hono';
import { tellAgent } from '../../conversations/tell.ts';
import { StartRecording, StopRecording } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { demonstrationMessage } from '../../browser/recorder.ts';
import { HttpError, body, notFound } from '../errors.ts';
import type { Agent } from './types.ts';
import { log } from '../../observability/log.ts';

const MAX_SEGMENT = 8 * 1024 * 1024;

/** Demonstrations: the developer teaches by doing (and narrating) in the browser. */
export function recordingRoutes({ recorder, conversations, events }: OrbiServices, agent: Agent) {
  const recording = (id: string) => {
    const rec = recorder.get(id);
    if (!rec) throw notFound('gravação');
    return rec;
  };

  return new Hono()
    .post('/', async (c) => {
      const req = await body(c, StartRecording);
      const rec = await recorder.start(req.conversationId, { url: req.url || undefined, narrated: req.narrated }).catch((error: Error) => {
        throw new HttpError(409, 'conflict', error.message);
      });
      if (conversations.get(req.conversationId)?.title === 'Nova conversa') conversations.touch(req.conversationId, 'Demonstração no navegador');
      return c.json(rec, 201);
    })
    .get('/active', (c) => c.json(recorder.active() ?? null))
    .get('/:id', (c) => c.json(recording(c.req.param('id'))))
    .post('/:id/audio', async (c) => {
      const startedAt = Number(c.req.query('startedAt'));
      const durationMs = Number(c.req.query('durationMs') ?? '0');
      const rec = recording(c.req.param('id'));
      const wav = Buffer.from(await c.req.arrayBuffer());
      if (!startedAt || wav.length < 44) throw new HttpError(400, 'invalid_body', 'envie audio/wav com ?startedAt=<epoch ms>');
      if (wav.length > MAX_SEGMENT) throw new HttpError(413, 'too_large', 'segmento de áudio grande demais (máx. 8 MB)');
      return c.json(recorder.addAudio(rec.id, startedAt, durationMs, wav), 202);
    })
    .post('/:id/stop', async (c) => {
      const { discard = false } = await body(c, StopRecording);
      const rec = recording(c.req.param('id'));
      // Transcription may still be running: answer now, hand the timeline to the agent when it is ready.
      void recorder
        .stop(rec.id, discard)
        .then(async (done) => {
          if (discard || (done.actions.length === 0 && !done.narration.some((n) => n.text))) return;
          await tellAgent(events, agent, { id: done.conversationId, message: { kind: 'user', body: demonstrationMessage(done) } });
        })
        .catch((error) => log.error('finalizar demonstração falhou', { recording: rec.id, conversation: rec.conversationId, error }));
      return c.json({ ...rec, status: discard ? 'discarded' : 'transcribing' }, 202);
    });
}
