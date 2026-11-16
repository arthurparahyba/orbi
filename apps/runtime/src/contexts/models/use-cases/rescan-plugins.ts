import type { OrbiServices } from '../../../services.ts';
import { modelStatus } from '../setup/src/setup.ts';
import { discoverPlugins, pluginDirs } from '../plugins/src/plugins.ts';

/**
 * Reprocurar os plugins de modelo nas pastas conhecidas: o desenvolvedor instalou um agora e quer
 * que o Orbi o veja sem reiniciar. Devolve o estado do modelo já com o que foi achado.
 */

type Deps = Pick<OrbiServices, 'llm' | 'config'>;

export async function rescanPlugins(d: Deps, env: NodeJS.ProcessEnv) {
  d.llm.plugins = await discoverPlugins(pluginDirs(env, d.config.cwd));
  return modelStatus(d.llm);
}
