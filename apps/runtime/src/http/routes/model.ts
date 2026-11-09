import { Hono } from 'hono';
import { ChooseModel } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { applyModel, modelStatus, testModel } from '../../llm/setup.ts';
import { discoverPlugins, pluginDirs } from '../../llm/index.ts';
import { log } from '../../observability/log.ts';
import { body } from '../errors.ts';

/**
 * The model, chosen from the app: where it stands, a test that saves nothing, and the choice
 * (tested again, saved to the .env of the data folder, applied without a restart). Keys come in
 * and are never sent back nor logged.
 */
export function modelRoutes(s: Pick<OrbiServices, 'llm' | 'config'>) {
  return new Hono()
    .get('/', async (c) => c.json(await modelStatus(s.llm)))
    .post('/plugins/rescan', async (c) => {
      s.llm.plugins = await discoverPlugins(pluginDirs(process.env, s.config.cwd));
      return c.json(await modelStatus(s.llm));
    })
    .post('/test', async (c) => c.json(await testModel(await body(c, ChooseModel), { plugins: s.llm.plugins })))
    .put('/', async (c) => {
      const choice = await body(c, ChooseModel);
      const result = await applyModel(choice, s);
      log.info(result.ok ? 'modelo trocado' : 'modelo não trocado: o teste falhou', { kind: choice.kind, model: result.model ?? choice.model });
      return c.json(result, result.ok ? 200 : 422);
    });
}
