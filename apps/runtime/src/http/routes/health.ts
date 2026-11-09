import { Hono } from 'hono';
import { resolve } from 'node:path';
import type { Health } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import type { Background } from '../../compose.ts';
import { binaryStatus } from '../../terminal/exec.ts';
import { describePlugins } from '../../llm/index.ts';
import { BUILD } from '../../build.ts';

/** What is connected and configured: the Autonomia screen's "Capacidades" and the offline banner. */
export function healthRoutes(s: OrbiServices, background: Background) {
  const { config, brain, vault } = s;
  let vaultBackend = 'desconhecido';
  void vault.backend().then((b) => (vaultBackend = b), () => {});

  return new Hono().get('/', (c) => {
    const bridge = background.bridge();
    const health: Health = {
      model: config.model,
      llm: s.llm.adapter ? s.llm.adapter.name : s.llm.kind,
      llmReady: !s.llm.error && (s.llm.adapter ? true : s.llm.kind === 'anthropic' && Boolean(process.env.ANTHROPIC_API_KEY)),
      codeAgent: s.codeAgents.describe(),
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
      mcpUrl: `http://127.0.0.1:${config.port}/mcp`,
      build: BUILD,
      pid: process.pid,
      runtimePath: process.argv[1],
    };
    return c.json(health);
  });
}
