import { Hono } from 'hono';
import { resolve } from 'node:path';
import type { Health } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import type { Background } from '../../compose.ts';
import { binaryStatus } from '../../tools/exec.ts';
import { describePlugins } from '../../llm/index.ts';

/** What is connected and configured: the Autonomia screen's "Capacidades" and the offline banner. */
export function healthRoutes(s: OrbiServices, background: Background) {
  const { config, brain, vault } = s;
  let vaultBackend = 'desconhecido';
  void vault.backend().then((b) => (vaultBackend = b), () => {});

  return new Hono().get('/', (c) => {
    const bridge = background.bridge();
    const health: Health = {
      model: config.model,
      codeModel: config.codeModel,
      llm: s.llm.adapter ? s.llm.adapter.name : 'anthropic',
      llmReady: s.llm.adapter ? true : Boolean(process.env.ANTHROPIC_API_KEY),
      codeFixer: config.codeFixer,
      plugins: describePlugins(s.llm.plugins),
      anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      envFile: resolve(config.cwd, '.env'),
      dataDir: config.dataDir,
      chrome: bridge ? { url: bridge.url, tools: bridge.toolNames.length } : { error: background.bridgeError() ?? 'iniciando' },
      brain: brain.stats(),
      vault: vaultBackend,
      demoPortal: process.env.ORBI_DEMO_PORTAL,
      workspace: config.workspace,
      binaries: binaryStatus(config.allowedBinaries),
      stt: s.stt.name(),
    };
    return c.json(health);
  });
}
