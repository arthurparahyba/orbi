import { mkdirSync } from 'node:fs';
import { dispatch } from '@flue/runtime';
import { validateConfig, type OrbiConfig } from './config.ts';
import { BrainStore } from './brain/store.ts';
import { Inbox } from './inbox.ts';
import { PolicyStore } from './policy/autonomy.ts';
import { Conversations } from './conversations.ts';
import { Vault } from './vault.ts';
import { createStt } from './stt.ts';
import { createChrome } from './browser/chrome.ts';
import { createBrowserMcp } from './mcp/chrome-devtools.ts';
import { createRecorder } from './browser/recorder.ts';
import { createCodeFixer } from './tools/claude-code.ts';
import { configureLlm } from './llm/index.ts';
import { adoptLegacyBrain, openDatabase, takeLegacyJson } from './db/database.ts';
import type { InboxItem } from './inbox.ts';
import type { ConversationInfo } from './conversations.ts';
import { startBridge, type RunningBridge } from './mcp/bridge.ts';
import { binaryStatus } from './tools/exec.ts';
import type { OrbiServices } from './services.ts';

/**
 * The composition root: the only place that creates Orbi's parts and wires
 * them together. Swap a part (another vault, a fake transcriber, an LLM
 * adapter) by changing what is created here or passing `overrides`.
 */
export async function createOrbi(
  config: OrbiConfig,
  overrides: Partial<OrbiServices> = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<OrbiServices> {
  const problems = validateConfig(config);
  if (problems.length) throw new Error(`configuração inválida:\n- ${problems.join('\n- ')}`);

  for (const dir of [config.dataDir, config.workspace, config.scratchDir]) mkdirSync(dir, { recursive: true });

  // The model first: an adapter or plugin must be registered before any conversation.
  const llm = overrides.llm ?? (await configureLlm(env, config.cwd));
  const finalConfig: OrbiConfig = { ...config, model: llm.model };

  const vault = overrides.vault ?? new Vault(config.vault.indexFile, config.vault.dataFile, config.vault.keyFile, config.vault.prefer);
  const stt = overrides.stt ?? createStt(config.stt);
  const chrome = overrides.chrome ?? createChrome(config.chrome);

  // One database for the brain and the app state, brought up to date by its migrations.
  adoptLegacyBrain(config.dbFile, config.legacyBrainFile);
  const db = openDatabase(config.dbFile);
  const inbox = overrides.inbox ?? new Inbox(db);
  const conversations = overrides.conversations ?? new Conversations(db);
  const policy = overrides.policy ?? new PolicyStore(db);
  importLegacyState(config, { inbox, conversations, policy });

  return {
    config: finalConfig,
    llm,
    brain: overrides.brain ?? new BrainStore(db),
    inbox,
    policy,
    conversations,
    vault,
    stt,
    chrome,
    browser: overrides.browser ?? createBrowserMcp({ port: config.chrome.port, token: config.chrome.token }),
    recorder: overrides.recorder ?? createRecorder({ chrome, vault, stt }),
    codeFixer:
      overrides.codeFixer !== undefined
        ? overrides.codeFixer
        : config.codeFixer
          ? createCodeFixer({ workspace: config.workspace, scratchDir: config.scratchDir, cliEnv: config.cliEnv, model: config.codeModel, budgetUsd: config.codeFixBudgetUsd })
          : null,
  };
}

/** State kept in JSON files before the single database: imported once. */
function importLegacyState(config: OrbiConfig, to: { inbox: Inbox; conversations: Conversations; policy: PolicyStore }) {
  for (const item of takeLegacyJson<InboxItem[]>(config.legacy.inboxFile) ?? []) to.inbox.insert(item);
  for (const conv of takeLegacyJson<ConversationInfo[]>(config.legacy.conversationsFile) ?? []) to.conversations.insert(conv);
  const policy = takeLegacyJson<unknown>(config.legacy.policyFile);
  if (policy) to.policy.replace(policy);
}

/** What runs in the background once the server is up. `stop()` ends all of it. */
export interface Background {
  bridge(): RunningBridge | undefined;
  bridgeError(): string | undefined;
  stop(): Promise<void>;
}

/**
 * Starts the long-running parts: the Chrome DevTools bridge, the follow-up
 * clock and, under the desktop app, the watch on the parent process.
 * `agent` is passed in (not imported) so this file has no cycle with the agent.
 */
export function startBackground(s: OrbiServices, agent: Parameters<typeof dispatch>[0]): Background {
  const { config } = s;
  let bridge: RunningBridge | undefined;
  let bridgeError: string | undefined;
  const timers: NodeJS.Timeout[] = [];

  console.log(`[orbi] modelo: ${config.model}${s.llm.adapter ? ` (adaptador ${s.llm.adapter.name})` : ''}`);
  for (const p of s.llm.plugins) console.log(`[orbi] plugin ${p.name} (${p.kind}) ${p.error ? `com erro: ${p.error}` : 'ok'} — ${p.dir}`);
  console.log(`[orbi] pasta de trabalho: ${config.workspace}`);
  const missing = Object.entries(binaryStatus(config.allowedBinaries)).filter(([, at]) => !at).map(([b]) => b);
  if (missing.length) console.log(`[orbi] comandos não encontrados no PATH: ${missing.join(', ')}`);

  if (config.chrome.autostart) {
    startBridge({
      port: config.chrome.port,
      token: config.chrome.token,
      // The bridge attaches to the shared Chrome, launched lazily on the first tool call.
      chrome: { browserUrl: s.chrome.debugUrl() },
      beforeToolCall: async () => {
        await s.chrome.ensure();
      },
    })
      .then((b) => {
        bridge = b;
        console.log(`[orbi] Chrome DevTools MCP em ${b.url} (${b.toolNames.length} tools)`);
      })
      .catch((error) => {
        bridgeError = error instanceof Error ? error.message : String(error);
        console.error('[orbi] bridge do Chrome não subiu:', bridgeError);
      });
  }

  // Follow-ups: Orbi wakes itself up.
  timers.push(
    setInterval(async () => {
      for (const f of s.brain.claimDueFollowups()) {
        try {
          await dispatch(agent, {
            id: f.conversationId,
            message: { kind: 'signal', type: 'followup', body: `Retorno agendado: ${f.note}`, attributes: { followupId: f.id } },
          });
        } catch (error) {
          console.error('[orbi] follow-up falhou:', error);
        }
      }
    }, config.followupIntervalMs),
  );

  // Started by the desktop shell: exit when the window process is gone, even if it
  // was killed without a chance to stop us (SIGKILL, crash, force-quit).
  if (config.parentPid) {
    const parent = config.parentPid;
    timers.push(
      setInterval(() => {
        try {
          process.kill(parent, 0);
        } catch {
          console.log('[orbi] app desktop encerrado; parando o runtime');
          process.exit(0);
        }
      }, 2_000),
    );
  }
  for (const t of timers) t.unref();
  process.once('exit', () => s.chrome.stop());

  return {
    bridge: () => bridge,
    bridgeError: () => bridgeError ?? (config.chrome.autostart ? undefined : 'desligado'),
    async stop() {
      for (const t of timers) clearInterval(t);
      await bridge?.close();
      s.chrome.stop();
    },
  };
}
