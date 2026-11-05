import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import {
  defineSkill,
  defineTool,
  useAgentStart,
  useDataWriter,
  useDelivery,
  usePersistentState,
  useResponseStart,
  useSkill,
  useTool,
} from '@flue/runtime';
import * as v from 'valibot';
import { ulid } from 'ulidx';
import { config } from '../config.ts';
import { brain, inbox, policy } from '../runtime.ts';
import { UiComponent, UiPart } from '../ui.ts';
import { runCommand } from '../tools/exec.ts';
import { prepareFix, pushFix, getFix } from '../tools/claude-code.ts';
import { callBrowserTool } from '../mcp/chrome-devtools.ts';
import {
  browserCategory,
  codeFixCategory,
  commandCategory,
  decide,
  type AutonomyLevel,
  type Category,
} from '../policy/autonomy.ts';

/**
 * Vigia's generic capabilities. Nothing here knows about CI, GMUD or portals:
 * those are playbooks Vigia learns and stores in the brain. Code only provides
 * hands (terminal, browser, Claude Code), memory (the brain), a voice (UI parts,
 * questions) and a clock (follow-ups) — plus the autonomy gate around every
 * action that changes something.
 */

/** Components shown in the current response of each conversation (see UiPart). */
const uiByConversation = new Map<string, Map<string, UiComponent>>();

type ActiveRun = { runId: string; playbook: string; autonomy: AutonomyLevel } | null;
type Pending = { tool: string; args: unknown; category: Category; requestedAt: string };
type Executor = (args: any, approvalId: string) => Promise<string>;

// ── helpers shared by root agent and subagents ─────────────────────────────

function insideWorkspace(cwd?: string): string {
  const dir = cwd ? (isAbsolute(cwd) ? cwd : resolve(config.workspace, cwd)) : config.workspace;
  const rel = relative(config.workspace, dir);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`cwd fora do workspace: ${cwd}`);
  return dir;
}

async function execCommand(args: { binary: string; args: string[]; cwd?: string; timeoutSeconds?: number }, signal?: AbortSignal) {
  const result = await runCommand(args.binary, args.args, {
    cwd: insideWorkspace(args.cwd),
    timeoutMs: Math.min(args.timeoutSeconds ?? 120, 1800) * 1000,
    env: config.cliEnv,
    allowed: config.allowedBinaries,
    signal,
  });
  return JSON.stringify(result);
}

const commandInput = v.object({
  binary: v.pipe(v.string(), v.description(`One of: ${config.allowedBinaries.join(', ')}`)),
  args: v.array(v.string()),
  cwd: v.optional(v.pipe(v.string(), v.description('Folder relative to the workspace, e.g. the repo name'))),
  timeoutSeconds: v.optional(v.number()),
  purpose: v.pipe(v.string(), v.description('One line: why you run this. Shown to the developer.')),
});

/** Read-only command runner for subagents (they cannot hold approvals). */
export const runReadOnlyCommand = defineTool({
  name: 'run_readonly_command',
  description: 'Run a read-only CLI command (git log/diff/status, gh run view/list, aws logs tail, describe/get/list…). No shell. Write commands are refused.',
  input: commandInput,
  timeoutMs: 600_000,
  async run({ data, signal }) {
    if (commandCategory(data.binary, data.args) !== 'comandos-leitura') {
      return { output: { refused: 'Comando de escrita. Devolva ao agente principal o que precisa ser feito.' } };
    }
    return { output: await execCommand(data, signal) };
  },
});

export const runPython = defineTool({
  name: 'run_python',
  description: 'Run a short Python 3 script for investigation (parse logs, compare files, compute). Runs in a scratch folder, without credentials, 60 s limit.',
  input: v.object({ code: v.string(), purpose: v.string() }),
  timeoutMs: 90_000,
  async run({ data, signal }) {
    mkdirSync(config.scratchDir, { recursive: true });
    const file = join(config.scratchDir, `script-${ulid()}.py`);
    writeFileSync(file, data.code);
    const result = await runCommand('python3', ['-I', file], { cwd: config.scratchDir, timeoutMs: 60_000, signal, allowed: ['python3'] });
    return { output: JSON.stringify(result) };
  },
});

export const brainQuery = defineTool({
  name: 'brain_query',
  description:
    'Look up the brain (knowledge graph). Give `id` to get one entity with its current relations and neighborhood, `type` to list entities of a type, or `text` to search. Use before acting: what you were taught is here.',
  input: v.object({
    id: v.optional(v.string()),
    type: v.optional(v.string()),
    text: v.optional(v.string()),
    depth: v.optional(v.number()),
  }),
  async run({ data }) {
    if (data.id) {
      const entity = brain.get(data.id);
      if (!entity) return { output: { notFound: data.id, similar: brain.search(data.id, 5).map((e) => e.id) } };
      return { output: JSON.parse(JSON.stringify({ entity, relations: brain.neighbors(data.id), nearby: brain.reachable(data.id, data.depth ?? 2) })) };
    }
    if (data.type) return { output: JSON.parse(JSON.stringify(brain.byType(data.type))) };
    if (data.text) return { output: JSON.parse(JSON.stringify(brain.search(data.text))) };
    return { output: JSON.parse(JSON.stringify({ ontology: brain.types(), gaps: brain.gaps(), playbooks: brain.playbooks().map((p) => p.name) })) };
  },
});

export const browserRead = defineTool({
  name: 'browser_read',
  description:
    'Read-only browser access (Chrome DevTools MCP): list_pages, new_page, navigate_page, take_snapshot, take_screenshot, wait_for, console and network listing. Pass the page-scoped tools a `pageId` from list_pages.',
  input: v.object({ tool: v.string(), args: v.optional(v.record(v.string(), v.unknown())) }),
  timeoutMs: 120_000,
  async run({ data }) {
    if (browserCategory(data.tool) !== 'navegador-leitura') return { output: { refused: 'Ação de escrita no navegador.' } };
    return { output: await callBrowserTool(data.tool, data.args ?? {}) };
  },
});

// ── the root agent's capability hook ───────────────────────────────────────

export function useVigia(conversationId: string) {
  const [activeRun, setActiveRun] = usePersistentState<ActiveRun>('activeRun', null);
  const [pending, setPending] = usePersistentState<Record<string, Pending>>('pending', {});
  const writePart = useDataWriter('ui', { schema: UiPart });
  useResponseStart(() => {
    uiByConversation.set(conversationId, new Map());
  });
  const writeUi = (component: UiComponent) => {
    let shown = uiByConversation.get(conversationId);
    if (!shown) uiByConversation.set(conversationId, (shown = new Map()));
    shown.set(component.id, component);
    writePart({ components: [...shown.values()] });
  };
  const delivery = useDelivery();
  const executors = new Map<string, Executor>();

  const showRun = (runId: string) => {
    const run = brain.run(runId);
    if (!run) return;
    writeUi({
      component: 'stepper',
      id: `run-${run.id}`,
      title: run.playbook,
      status: run.status,
      steps: run.steps.map((s) => ({ id: s.id, label: s.label, status: s.status, note: s.note })),
    });
  };

  /** One gate for every side effect: auto runs now, observe reports, ask records and ends the turn. */
  function gated<T extends v.GenericSchema<Record<string, unknown>>>(def: {
    name: string;
    description: string;
    input: T;
    category: (args: v.InferOutput<T>) => Category;
    summary: (args: v.InferOutput<T>) => string;
    execute: (args: v.InferOutput<T>, approvalId: string) => Promise<string>;
    timeoutMs?: number;
  }) {
    executors.set(def.name, def.execute as Executor);
    useTool({
      name: def.name,
      description: `${def.description} Governed by the developer's autonomy settings: it may run now, wait for approval, or only be reported.`,
      input: def.input,
      timeoutMs: def.timeoutMs ?? 600_000,
      async run({ data, toolCallId }) {
        const category = def.category(data);
        const level = decide(policy.get(), category, activeRun);
        if (level === 'auto') return { output: { status: 'executed', category, result: await def.execute(data, toolCallId) } };
        if (level === 'observe') {
          return { output: { status: 'not_executed', category, reason: `"${category}" está em modo observar: relate o que faria e não tente de novo.` } };
        }
        setPending((prev) => ({ ...prev, [toolCallId]: { tool: def.name, args: data, category, requestedAt: new Date().toISOString() } }));
        const item = inbox.add({ kind: category === 'aprender' ? 'learning' : 'approval', conversationId, title: def.summary(data), detail: JSON.stringify(data, null, 2), approvalId: toolCallId, routine: category });
        writeUi({ component: 'approval', id: `approval-${toolCallId}`, title: def.summary(data), detail: JSON.stringify(data, null, 2), category, inboxId: item.id });
        return { output: { status: 'pending_approval', approvalId: toolCallId, category }, terminate: true };
      },
    });
  }

  // Runs the stored call when the developer decides (signal sent by app.ts).
  useAgentStart(async ({ append }) => {
    if (delivery.kind !== 'signal' || delivery.type !== 'tool-approval') return;
    const { approvalId = '', decision, approver = 'O desenvolvedor' } = (delivery.attributes ?? {}) as Record<string, string>;
    const call = pending[approvalId];
    if (!call) return;
    setPending(({ [approvalId]: _done, ...rest }) => rest);
    if (decision !== 'approve') {
      append({ kind: 'signal', type: 'tool-approval-result', body: `${approver} negou ${call.tool} (${approvalId}). Não tente de novo; pergunte como seguir.` });
      return;
    }
    try {
      const result = await executors.get(call.tool)!(call.args, approvalId);
      append({ kind: 'signal', type: 'tool-approval-result', body: `${approver} aprovou ${call.tool} (${approvalId}). Resultado: ${result}` });
    } catch (error) {
      append({ kind: 'signal', type: 'tool-approval-result', body: `${call.tool} (${approvalId}) foi aprovado mas falhou: ${String(error)}` });
    }
  });

  // ── hands ────────────────────────────────────────────────────────────────
  gated({
    name: 'run_command',
    description: `Run a CLI command in the workspace — ${config.allowedBinaries.join(', ')} — without a shell (binary + args). Read-only commands usually run at once; writes (push, merge, workflow run, deploy) follow the autonomy rules.`,
    input: commandInput,
    category: (a) => commandCategory(a.binary, a.args),
    summary: (a) => `${a.purpose}: ${a.binary} ${a.args.join(' ')}`,
    execute: (a) => execCommand(a),
    timeoutMs: 1_800_000,
  });
  useTool(runPython);

  gated({
    name: 'browser_act',
    description:
      'Act on a web page through Chrome DevTools MCP: click, fill, fill_form, press_key, hover, select_page, handle_dialog, upload_file, evaluate_script, close_page. Get element `uid`s from take_snapshot first and pass `pageId`.',
    input: v.object({ tool: v.string(), args: v.record(v.string(), v.unknown()), purpose: v.string() }),
    category: (a) => browserCategory(a.tool),
    summary: (a) => `${a.purpose} (navegador: ${a.tool})`,
    execute: (a) => callBrowserTool(a.tool, a.args),
  });

  useTool({
    name: 'claude_code_prepare_fix',
    description:
      'Ask Claude Code to fix a bug in a repository clone, in a throwaway worktree of `branch`. Give a complete diagnosis (error, logs, suspected cause). Nothing is committed: returns fixId, changed files and diff for claude_code_push_fix.',
    input: v.object({ repo: v.pipe(v.string(), v.description('owner/repo')), branch: v.string(), diagnosis: v.string() }),
    timeoutMs: 1_200_000,
    async run({ data, signal }) {
      writeUi({ component: 'status', id: `fix-${data.repo}`, title: 'Claude Code investigando', state: 'running', text: `${data.repo} · ${data.branch}` });
      const fix = await prepareFix(data, signal);
      writeUi({ component: 'code', id: `fix-diff-${fix.id}`, title: `Correção proposta (${fix.files.length} arquivos)`, language: 'diff', text: fix.diff.slice(0, 20_000) });
      return { output: { fixId: fix.id, files: fix.files, summary: fix.summary, costUsd: fix.costUsd, diff: fix.diff.slice(0, 8_000) } };
    },
  });

  gated({
    name: 'claude_code_push_fix',
    description: 'Commit and push a fix prepared by claude_code_prepare_fix. Test-only fixes and production-code fixes follow different autonomy rules.',
    input: v.object({ fixId: v.string(), commitMessage: v.string() }),
    category: (a) => codeFixCategory(getFix(a.fixId)?.files ?? ['?']),
    summary: (a) => `Subir correção ${a.fixId}: ${a.commitMessage}`,
    execute: (a) => pushFix(a.fixId, a.commitMessage),
  });

  // ── memory ───────────────────────────────────────────────────────────────
  useTool(brainQuery);

  const learnItem = v.variant('kind', [
    v.object({ kind: v.literal('type'), payload: v.object({ name: v.string(), description: v.string(), relations: v.optional(v.record(v.string(), v.string())), requires: v.optional(v.array(v.string())) }) }),
    v.object({ kind: v.literal('entity'), payload: v.object({ id: v.string(), type: v.string(), props: v.optional(v.record(v.string(), v.unknown())), body: v.optional(v.string()) }) }),
    v.object({ kind: v.literal('edge'), payload: v.object({ from: v.string(), rel: v.string(), to: v.string(), attrs: v.optional(v.record(v.string(), v.unknown())), validFrom: v.optional(v.string()), validTo: v.optional(v.string()) }) }),
    v.object({
      kind: v.literal('playbook'),
      payload: v.object({
        name: v.pipe(v.string(), v.description('kebab-case')),
        description: v.pipe(v.string(), v.description('When to use it — this line decides when it is picked')),
        appliesTo: v.optional(v.string()),
        trigger: v.string(),
        autonomy: v.optional(v.picklist(['observe', 'ask', 'auto'])),
        steps: v.array(v.object({ id: v.string(), label: v.string(), how: v.string() })),
        instructions: v.string(),
      }),
    }),
  ]);

  gated({
    name: 'brain_learn',
    description:
      'Save what you learned: new ontology types, entities, relations (with optional validity dates) and playbooks (procedures with steps). The batch is validated against the ontology and shown to the developer to approve.',
    input: v.object({ reason: v.string(), items: v.array(learnItem) }),
    category: () => 'aprender',
    summary: (a) => `Aprender: ${a.reason}`,
    execute: async (a) => {
      const applied = a.items.map((item) => brain.apply(brain.propose(item.kind, item.payload as Record<string, unknown>, a.reason, conversationId).id));
      return `Guardado no cérebro: ${applied.join('; ')}`;
    },
  });

  // Playbooks are mounted as Agent Skills: the catalog line is cheap; the model
  // activates one to read its steps when a request matches its description.
  for (const pb of brain.playbooks()) {
    useSkill(
      defineSkill({
        name: pb.name,
        description: `${pb.description}${pb.appliesTo ? ` (aplica a: ${pb.appliesTo})` : ''}`,
        instructions: [
          pb.instructions,
          '',
          `Autonomia: ${pb.autonomy}. Usado ${pb.uses}x, ${pb.successes} com sucesso. Comece com playbook_start {"name":"${pb.name}"}.`,
          '',
          '## Passos',
          ...pb.steps.map((s, i) => `${i + 1}. [${s.id}] ${s.label} — ${s.how}`),
        ].join('\n'),
      }),
    );
  }

  useTool({
    name: 'playbook_start',
    description: 'Start running a learned playbook. Shows its steps to the developer as a live checklist. Then report each step with playbook_step.',
    input: v.object({ name: v.string(), target: v.optional(v.string()) }),
    async run({ data }) {
      const pb = brain.playbook(data.name);
      if (!pb) return { output: { error: `playbook não existe: ${data.name}`, available: brain.playbooks().map((p) => p.name) } };
      const run = brain.startRun(pb.name, conversationId);
      setActiveRun({ runId: run.id, playbook: pb.name, autonomy: pb.autonomy });
      showRun(run.id);
      return { output: { runId: run.id, autonomy: pb.autonomy, steps: pb.steps.map((s) => ({ id: s.id, label: s.label, how: s.how })) } };
    },
  });

  useTool({
    name: 'playbook_step',
    description: 'Report progress of the running playbook: mark a step running, done, failed, waiting (for CI, approval, a follow-up) or skipped, with a short note.',
    input: v.object({ stepId: v.string(), status: v.picklist(['running', 'done', 'failed', 'waiting', 'skipped']), note: v.optional(v.string()) }),
    async run({ data }) {
      if (!activeRun) return { output: { error: 'nenhum playbook em execução' } };
      const run = brain.updateRunStep(activeRun.runId, data.stepId, data.status, data.note);
      showRun(run.id);
      if (run.status === 'done' || run.status === 'failed') setActiveRun(null);
      return { output: { runStatus: run.status } };
    },
  });

  // ── voice ────────────────────────────────────────────────────────────────
  useTool({
    name: 'show_ui',
    description:
      'Show the developer a component in the conversation: status, table, link or code. Reuse an `id` to update a component in place. Use it to make progress visible instead of long text.',
    input: v.object({ component: UiComponent }),
    async run({ data }) {
      writeUi(data.component);
      return { output: 'shown' };
    },
  });

  useTool({
    name: 'ask_developer',
    description:
      'Ask the developer something only they can answer (a decision, a missing fact, how to do a step you do not know). Ends your turn; the answer arrives as their next message.',
    input: v.object({ question: v.string(), options: v.optional(v.array(v.string())) }),
    async run({ data }) {
      const item = inbox.add({ kind: 'question', conversationId, title: data.question, detail: (data.options ?? []).join('\n') });
      writeUi({ component: 'question', id: `q-${item.id}`, question: data.question, options: data.options ?? [], inboxId: item.id });
      return { output: { asked: true }, terminate: true };
    },
  });

  // ── clock ────────────────────────────────────────────────────────────────
  useTool({
    name: 'schedule_followup',
    description:
      'Wake yourself up later in this conversation, e.g. to check a CI run, a deploy or a GMUD that takes minutes. Say what to check. End your turn after scheduling.',
    input: v.object({ minutes: v.pipe(v.number(), v.minValue(1), v.maxValue(1440)), note: v.string() }),
    async run({ data }) {
      const due = new Date(Date.now() + data.minutes * 60_000).toISOString();
      brain.scheduleFollowup(conversationId, due, data.note);
      return { output: { scheduledFor: due }, terminate: true };
    },
  });

  return { activeRun };
}
