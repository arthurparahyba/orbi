import { mkdirSync } from 'node:fs';
import type { Agent } from './agents/runtime-port.ts';
import { validateConfig, type OrbiConfig } from './config.ts';
import { BrainStore } from './brain/store.ts';
import { Inbox } from './conversations/inbox.ts';
import { PolicyStore } from './autonomy/policy.ts';
import { Conversations } from './conversations/conversations.ts';
import { Followups } from './followups/service.ts';
import { startFollowups } from './followups/scheduler.ts';
import { Vault } from './vault/vault.ts';
import { createStt } from './voice/stt.ts';
import { VoiceModel } from './voice/model.ts';
import { warmVoice } from './voice/warm.ts';
import { PipelineRuns } from './pipelines/runs.ts';
import { PipelineEngine } from './pipelines/engine.ts';
import { createChrome } from './browser/chrome.ts';
import { createBrowserMcp } from './browser/mcp/chrome-devtools.ts';
import { createRecorder } from './browser/recorder.ts';
import { CodeAgents, createCodeFixer } from './code-agents/index.ts';
import { configureLlm, discoverPlugins, llmChoice, pluginDirs, type ActiveLlm } from './llm/index.ts';
import { ModelTiers } from './llm/choices.ts';
import { RunObservations } from './observability/run-observations.ts';
import { KnowledgeCandidates, deliverKnowledge, KNOWLEDGE_PREFIX } from './review/knowledge.ts';
import { adoptLegacyBrain, openDatabase, takeLegacyJson } from './db/database.ts';
import { watchTables } from './db/changes.ts';
import { createEvents } from './events.ts';
import { tellAgent } from './conversations/tell.ts';
import { UsageStore } from './observability/usage.ts';
import { watchAgents } from './observability/telemetry.ts';
import { sendReview } from './review/review.ts';
import { ToolOutcomes, type ToolOutcome } from './observability/tool-outcomes.ts';
import { log } from './observability/log.ts';
import type { InboxItem } from './conversations/inbox.ts';
import type { ConversationInfo } from './conversations/conversations.ts';
import { startBridge, type RunningBridge } from './browser/mcp/bridge.ts';
import { binaryStatus } from './terminal/exec.ts';
import type { OrbiServices } from './services.ts';
import { AgentClients } from './mcp/clients.ts';
import { AgentRequests } from './mcp/requests.ts';
import { AgentSuggestions } from './mcp/suggestions.ts';

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
  const llm = overrides.llm ?? (await configureLlmOrExplain(env, config.cwd));
  const finalConfig: OrbiConfig = { ...config, model: llm.model };

  const events = overrides.events ?? createEvents();
  const vault = overrides.vault ?? new Vault(config.vault.indexFile, config.vault.dataFile, config.vault.keyFile, config.vault.prefer);
  const chrome = overrides.chrome ?? createChrome(config.chrome);

  // One database for the brain and the app state, brought up to date by its migrations.
  adoptLegacyBrain(config.dbFile, config.legacyBrainFile);
  const db = openDatabase(config.dbFile);
  watchTables(db, events);
  // The transcription model: chosen in .env or on the Autonomia screen, its files and their state.
  const voice = overrides.voice ?? new VoiceModel(db, config.stt, () => events.emit('voice'));
  const stt = overrides.stt ?? createStt(() => voice.config(), (state) => voice.report(state));
  vault.onChange = () => events.emit('vault');
  const inbox = overrides.inbox ?? new Inbox(db);
  const conversations = overrides.conversations ?? new Conversations(db);
  const followups = overrides.followups ?? new Followups(db);
  const policy = overrides.policy ?? new PolicyStore(db);
  importLegacyState(config, { inbox, conversations, policy });
  const brain = overrides.brain ?? new BrainStore(db);
  const pipelineRuns = new PipelineRuns(db);
  const codeAgents = overrides.codeAgents ?? new CodeAgents(db, config.codeAgent);

  return {
    config: finalConfig,
    llm,
    modelTiers: new ModelTiers(db),
    observations: new RunObservations(),
    knowledge: new KnowledgeCandidates(),
    events,
    usage: overrides.usage ?? new UsageStore(db),
    toolOutcomes: overrides.toolOutcomes ?? new ToolOutcomes(),
    agents: overrides.agents ?? { clients: new AgentClients(db), requests: new AgentRequests(db), suggestions: new AgentSuggestions(db) },
    brain,
    pipelines: overrides.pipelines ?? { runs: pipelineRuns, engine: new PipelineEngine({ brain, runs: pipelineRuns, inbox }) },
    inbox,
    policy,
    conversations,
    followups,
    vault,
    stt,
    voice,
    chrome,
    browser: overrides.browser ?? createBrowserMcp({ port: config.chrome.port, token: config.chrome.token }),
    recorder: overrides.recorder ?? createRecorder({ chrome, vault, stt, onChange: (id) => events.emit('recording', id) }),
    codeAgents,
    codeFixer: overrides.codeFixer ?? createCodeFixer({ workspace: config.workspace, scratchDir: config.scratchDir, cliEnv: config.cliEnv, agents: codeAgents, shell: () => config.shell }),
  };
}

/**
 * A tool call ended. A failure inside a running playbook is a deviation of that run: the run
 * does not count toward the next level, and the Orbi is asked to propose a fix at the end.
 */
export function recordToolOutcome(s: Pick<OrbiServices, 'toolOutcomes' | 'brain'> & Partial<Pick<OrbiServices, 'observations'>>, conversationId: string, outcome: ToolOutcome): void {
  s.toolOutcomes.record(conversationId, outcome);
  if (outcome.tool === 'playbook_step' || outcome.tool === 'playbook_start') return;
  // What a running procedure read: the knowledge reviewer looks for facts in it at the end.
  // A call that only waits for approval or was not run read nothing.
  if (!outcome.failed && outcome.result && s.observations && RunObservations.reads(outcome.tool) && !/^\{"status":"(pending_approval|not_executed|invalid)"/.test(outcome.result)) {
    const open = s.brain.openRunIn(conversationId);
    if (open && open.kind !== 'rehearsal') {
      const step = open.steps.find((x) => x.status === 'running' || x.status === 'waiting') ?? open.steps.find((x) => x.status === 'pending');
      s.observations.add(open.id, { step: step?.id ?? null, tool: outcome.tool, text: outcome.result });
    }
  }
  const run = s.brain.runForFailureIn(conversationId);
  if (!run) return;
  // A run that already ended (the failing call ran alongside the last step): the last step it closed.
  const step = run.steps.find((x) => x.status === 'running' || x.status === 'waiting') ?? run.steps.find((x) => x.status === 'pending') ?? run.steps.at(-1);
  // Worked this time: an earlier failure of the same tool in this step was fixed on the spot.
  if (!outcome.failed) return s.brain.recoverRunDeviation(run.id, outcome.tool, step?.id ?? null);
  // A failure the brain already knows: remembered with its problem, so getting past it with the
  // known solution does not hold the level back, and coming back every time is counted.
  const known = outcome.error ? s.brain.knownProblems(`${outcome.tool}\n${outcome.error}`, 1)[0] : undefined;
  s.brain.addRunDeviation(run.id, {
    kind: 'falha',
    detail: `${outcome.tool} falhou${outcome.error ? `: ${outcome.error.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`,
    tool: outcome.tool,
    step: step?.id ?? null,
    ...(known ? { problem: known.id } : {}),
  });
}

/**
 * The model at start. A plugin that fails to load no longer stops the runtime: the app opens and
 * asks to choose a model (Configurar o modelo), saying what went wrong.
 */
async function configureLlmOrExplain(env: NodeJS.ProcessEnv, cwd: string): Promise<ActiveLlm> {
  try {
    return await configureLlm(env, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('modelo não configurado na partida', { error: message });
    const plugins = await discoverPlugins(pluginDirs(env, cwd)).catch(() => []);
    return { ...llmChoice({ ...env, ORBI_LLM: 'anthropic' }), kind: llmChoice(env).kind, plugins, error: message };
  }
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
 * Starts the long-running parts: telemetry, the Chrome DevTools bridge, the
 * follow-up clock and, under the desktop app, the watch on the parent process.
 * `agent` is passed in (not imported) so this file has no cycle with the agent.
 */
export function startBackground(s: OrbiServices, agent: Agent): Background {
  logStartup(s);
  // Every model and tool call: counted per conversation and logged.
  const unwatch = watchAgents({
    usage: s.usage,
    log,
    onTool: (conversationId, outcome) => recordToolOutcome(s, conversationId, outcome),
    onTurn: (conversationId, u) => s.brain.execution.addUsage(conversationId, u),
    // When a turn ends: review the runs that ended in it (problems, level, configuration).
    onSettled: (conversationId) => {
      // The knowledge reviewer finished: what it found goes to the run's conversation, as facts to propose.
      if (conversationId.startsWith(KNOWLEDGE_PREFIX)) return void deliverKnowledge(s, agent, conversationId);
      void sendReview(s, agent, conversationId);
    },
  });
  const chrome = s.config.chrome.autostart ? startChromeBridge(s) : undefined;
  warmVoice(s.voice, s.stt);
  const timers = [startFollowups(s, agent, s.config.followupIntervalMs), ...(s.config.parentPid ? [watchParent(s.config.parentPid)] : [])];
  for (const t of timers) t.unref();
  // Whatever way the runtime ends (app closed, Ctrl+C, the parent gone), what it started ends
  // with it: the chrome-devtools-mcp process and the Chrome it opened. 'exit' runs only sync code.
  process.once('exit', () => {
    chrome?.bridge?.killNow();
    s.chrome.stop();
  });

  return {
    bridge: () => chrome?.bridge,
    bridgeError: () => (chrome ? chrome.error : 'desligado'),
    async stop() {
      unwatch();
      for (const t of timers) clearInterval(t);
      await chrome?.bridge?.close();
      s.chrome.stop();
    },
  };
}

function logStartup({ config, llm }: OrbiServices) {
  log.info('runtime iniciado', { model: config.model, adapter: llm.adapter?.name, workspace: config.workspace, db: config.dbFile });
  for (const p of llm.plugins) {
    if (p.error) log.warn('plugin com erro', { plugin: p.name, kind: p.kind, dir: p.dir, error: p.error });
    else log.info('plugin carregado', { plugin: p.name, kind: p.kind, dir: p.dir });
  }
  const missing = Object.entries(binaryStatus(config.allowedBinaries)).filter(([, at]) => !at).map(([b]) => b);
  if (missing.length) log.warn('comandos não encontrados no PATH', { missing });
}

/** The bridge attaches to the shared Chrome, launched lazily on the first tool call. */
function startChromeBridge(s: OrbiServices): { bridge?: RunningBridge; error?: string } {
  const state: { bridge?: RunningBridge; error?: string } = {};
  startBridge({
    port: s.config.chrome.port,
    token: s.config.chrome.token,
    chrome: { browserUrl: s.chrome.debugUrl() },
    beforeToolCall: async () => {
      await s.chrome.ensure();
    },
  })
    .then((b) => {
      state.bridge = b;
      log.info('Chrome DevTools MCP conectado', { url: b.url, tools: b.toolNames.length });
    })
    .catch((error) => {
      state.error = error instanceof Error ? error.message : String(error);
      log.error('bridge do Chrome não subiu', { error: state.error });
    });
  return state;
}

/** Follow-ups: Orbi wakes itself up when a scheduled check-in is due. */

/**
 * Started by the desktop shell: exit when the window process is gone, even if it
 * was killed without a chance to stop us (SIGKILL, crash, force-quit).
 */
function watchParent(parent: number): NodeJS.Timeout {
  return setInterval(() => {
    try {
      process.kill(parent, 0);
    } catch (error) {
      // EPERM: it exists, it is just not ours to signal. Only "no such process" means it is gone.
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      log.info('app desktop encerrado; parando o runtime', { parent });
      process.exit(0); // the 'exit' handler ends chrome-devtools-mcp and Chrome too
    }
  }, 2_000);
}
