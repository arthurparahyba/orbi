import { Hono } from 'hono';
import { DecidePipeline, SavePipeline, StartPipeline } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { tellAgent } from '../../conversations/tell.ts';
import { HttpError, body, notFound } from '../errors.ts';
import type { Agent } from './types.ts';

/**
 * Esteiras: the definitions (Esteiras › Minhas esteiras) and the deliveries
 * running (Em andamento). Starting and deciding tell the conversation's agent
 * what to do next, as a signal; the engine decides, not the model.
 */
export function pipelineRoutes({ brain, pipelines, conversations, events }: OrbiServices, agent: Agent) {
  const invalid = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      throw new HttpError(400, 'invalid_body', error instanceof Error ? error.message : String(error));
    }
  };
  const tell = (conversationId: string, text: string) =>
    tellAgent(events, agent, { id: conversationId, message: { kind: 'signal', type: 'pipeline', tagName: 'pipeline', body: text } });

  return new Hono()
    .get('/', (c) => c.json(brain.pipelines().map((p) => ({ ...p, gaps: brain.pipelineGaps(p) }))))
    .get('/:name', (c) => {
      const p = brain.pipeline(c.req.param('name'));
      if (!p) throw notFound('esteira');
      return c.json({ ...p, gaps: brain.pipelineGaps(p) });
    })
    .put('/:name', async (c) => {
      const def = await body(c, SavePipeline);
      const saved = invalid(() => brain.savePipeline({ name: c.req.param('name'), ...def }));
      return c.json({ ...saved, gaps: brain.pipelineGaps(saved) });
    })
    .delete('/:name', (c) => {
      if (!brain.deletePipeline(c.req.param('name'))) throw notFound('esteira');
      return c.json({ deleted: true });
    })
    .post('/:name/start', async (c) => {
      const { inputs, destination } = await body(c, StartPipeline);
      const p = brain.pipeline(c.req.param('name'));
      if (!p) throw notFound('esteira');
      const summary = Object.values(inputs).filter(Boolean).join(' · ');
      const conversation = conversations.create(`${p.name}${summary ? `: ${summary}` : ''}`.slice(0, 80));
      let started;
      try {
        started = pipelines.engine.start(p.name, inputs, { conversationId: conversation.id, destination: destination ?? null });
      } catch (error) {
        conversations.delete(conversation.id);
        throw new HttpError(400, 'invalid_body', error instanceof Error ? error.message : String(error));
      }
      await tell(conversation.id, started.instruction);
      return c.json({ run: started.run, conversationId: conversation.id }, 201);
    });
}

export function pipelineRunRoutes({ pipelines, events }: OrbiServices, agent: Agent) {
  return new Hono()
    .get('/', (c) => c.json(pipelines.runs.list({ active: c.req.query('active') === '1' })))
    .get('/conversation/:id', (c) => c.json(pipelines.runs.inConversation(c.req.param('id')) ?? null))
    .post('/:id/decide', async (c) => {
      const { decision, values } = await body(c, DecidePipeline);
      const run = pipelines.runs.get(c.req.param('id'));
      if (!run) throw notFound('entrega');
      let instruction: string | null;
      try {
        instruction = pipelines.engine.decide(run.id, decision, values ?? {});
      } catch (error) {
        throw new HttpError(409, 'conflict', error instanceof Error ? error.message : String(error));
      }
      if (instruction) await tellAgent(events, agent, { id: run.conversationId, message: { kind: 'signal', type: 'pipeline', tagName: 'pipeline', body: instruction } });
      return c.json(pipelines.runs.get(run.id), 202);
    });
}
