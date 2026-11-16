import { Hono } from 'hono';
import { AssignCodeAgentTask, SaveCodeAgent, TestCodeAgent, type CodeAgentsState } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { CATALOG, CODE_AGENT_TASKS, CodeAgentError, type CodeAgentTask } from './code-agents/src/index.ts';
import { testCodeAgent } from './use-cases/test-code-agent.ts';
import { HttpError, body, notFound } from '../../http/errors.ts';

/**
 * Configurações › Agentes de código: which coding agents this machine has, how each is called, and
 * which does each task with which model. The configuration chat proposes registrations through
 * its card; here the developer sees and edits them by hand.
 */
export function codeAgentRoutes({ codeAgents, config }: Pick<OrbiServices, 'codeAgents' | 'config'>) {
  const valid = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof CodeAgentError) throw new HttpError(400, 'invalid_body', error.message);
      throw error;
    }
  };
  const state = (): CodeAgentsState => ({ agents: codeAgents.list(), tasks: codeAgents.assignments(), catalog: [...CATALOG] });

  return new Hono()
    .get('/', (c) => c.json(state()))
    .put('/tasks/:task', async (c) => {
      const task = c.req.param('task') as CodeAgentTask;
      if (!CODE_AGENT_TASKS.includes(task)) throw notFound('tarefa');
      const { agent, model } = await body(c, AssignCodeAgentTask);
      valid(() => codeAgents.assign(task, agent, model ?? null));
      return c.json(state());
    })
    .put('/:id', async (c) => {
      const input = await body(c, SaveCodeAgent);
      return c.json(valid(() => codeAgents.save({ id: c.req.param('id'), ...input })));
    })
    .delete('/:id', (c) => {
      if (!codeAgents.remove(c.req.param('id'))) throw notFound('agente de código');
      return c.json(state());
    })
    .post('/:id/test', async (c) => {
      const { model } = await body(c, TestCodeAgent);
      const result = await testCodeAgent({ codeAgents, config }, { agent: c.req.param('id'), model });
      if ('refused' in result) throw notFound('agente de código');
      return c.json(result);
    });
}
