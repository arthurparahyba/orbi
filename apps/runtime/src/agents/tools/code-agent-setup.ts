import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';
import { useTool } from '../runtime-port.ts';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';
import { CATALOG, CODE_AGENT_TASKS, agentHelp, commandProblems, findAgents, testAgent } from '../../code-agents/index.ts';

/**
 * Setting up the coding agents of this machine, for the configuration chat (agents/configurador.ts):
 * look (installed programs, their --help, what is registered), then propose a registration that
 * the developer approves on a card. Looking is read-only; registering and testing pass the gate.
 */
export const codeAgentSetup = defineCapability({ name: 'code-agent-setup', needs: ['codeAgents', 'config'], register: useCodeAgentSetup });

const agentInput = v.object({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]{0,40}$/), v.description('kebab-case, e.g. claude-code')),
  name: v.string(),
  command: v.pipe(v.string(), v.description('One-shot command with {prompt} (the request) and, when it takes a model, {modelo}')),
  models: v.optional(v.array(v.string())),
  source: v.picklist(['catalogo', 'ajuda', 'manual']),
});

/** Tool output is plain JSON. */
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

function useCodeAgentSetup(ctx: AgentContext, { codeAgents, config }: Deps<'codeAgents' | 'config'>) {
  const shellOpts = () => {
    const cwd = join(config.scratchDir, 'agent-setup');
    mkdirSync(cwd, { recursive: true });
    return { shell: config.shell, env: config.cliEnv, cwd };
  };

  useTool({
    name: 'code_agents_state',
    description: 'What is registered now (agents, which does each task with which model) and the catalog of agents the Orbi already knows how to call.',
    input: v.object({}),
    async run() {
      return { output: json({ agents: codeAgents.list(), tasks: codeAgents.assignments(), catalog: CATALOG }) };
    },
  });

  useTool({
    name: 'find_code_agents',
    description: 'Look for coding agents installed on this machine (command -v in the developer\'s shell, then --version). Read-only. Pass `extra` names to look for besides the known ones.',
    input: v.object({ extra: v.optional(v.array(v.string())) }),
    timeoutMs: 120_000,
    async run({ data }) {
      return { output: json(await findAgents(shellOpts(), data.extra ?? [])) };
    },
  });

  useTool({
    name: 'read_agent_help',
    description: 'Read the --help of an installed agent, or of one subcommand (e.g. binary "codex", subcommand "exec"): how to run it once, how to pass the model, which models exist. Read-only.',
    input: v.object({ binary: v.string(), subcommand: v.optional(v.string()) }),
    timeoutMs: 60_000,
    async run({ data }) {
      return { output: await agentHelp(shellOpts(), data.binary, data.subcommand) };
    },
  });

  ctx.gated({
    name: 'code_agents_register',
    description:
      'Register coding agents of this machine and, optionally, which does each task (investigar, corrigir) with which model. The developer approves on a card; nothing is saved before. ' +
      'Each command must run once and exit, with {prompt} where the request goes and {modelo} where the model goes (leave {modelo} out if it cannot choose a model).',
    input: v.object({
      agents: v.array(agentInput),
      tasks: v.optional(v.array(v.object({ task: v.picklist(CODE_AGENT_TASKS as unknown as ['investigar', 'corrigir']), agent: v.string(), model: v.optional(v.nullable(v.string())) }))),
      reason: v.pipe(v.string(), v.description('One line: what you found and why these commands')),
    }),
    // Configuration the developer decides on: never automatic.
    category: () => 'aprender',
    effect: () => 'local',
    title: (a) => `Cadastrar ${a.agents.length === 1 ? `o agente ${a.agents[0]!.name}` : `${a.agents.length} agentes de código`}`,
    command: (a) => a.agents.map((x) => x.command).join('\n'),
    summary: (a) => [
      a.reason,
      ...a.agents.map((x) => `${x.name}: ${x.command}${x.models?.length ? ` · modelos: ${x.models.join(', ')}` : ' · modelo padrão do agente'} (${x.source === 'catalogo' ? 'catálogo' : x.source === 'ajuda' ? 'lido no --help' : 'manual'})`),
      ...(a.tasks ?? []).map((t) => `${t.task}: ${t.agent}${t.model ? ` · ${t.model}` : ''}`),
    ].join('\n'),
    fingerprint: (a) => `code_agents_register ${a.agents.map((x) => `${x.id}=${x.command}`).join(' ')}`,
    precheck: (a) => [
      ...a.agents.flatMap((x) => commandProblems(x.command).map((p) => `${x.name}: ${p}`)),
      ...(a.tasks ?? []).filter((t) => !a.agents.some((x) => x.id === t.agent) && !codeAgents.get(t.agent)).map((t) => `tarefa ${t.task}: agente ${t.agent} não está no lote nem cadastrado`),
    ],
    execute: async (a) => {
      for (const x of a.agents) codeAgents.save(x);
      for (const t of a.tasks ?? []) codeAgents.assign(t.task, t.agent, t.model ?? null);
      return JSON.stringify({ registered: a.agents.map((x) => x.id), tasks: codeAgents.assignments() });
    },
  });

  ctx.gated({
    name: 'code_agent_test',
    description: 'Send a short request to a registered agent ("answer ok") to check it is installed, logged in and runs once without waiting. Costs one request on the agent\'s account: the developer approves.',
    input: v.object({ agent: v.string(), model: v.optional(v.nullable(v.string())) }),
    category: () => 'comandos-escrita',
    effect: () => 'local',
    title: (a) => `Testar ${codeAgents.get(a.agent)?.name ?? a.agent}${a.model ? ` com ${a.model}` : ''}`,
    command: (a) => codeAgents.get(a.agent)?.command ?? a.agent,
    summary: (a) => `Manda um pedido curto a ${a.agent} (gasta um pedido da conta dele)`,
    precheck: (a) => (codeAgents.get(a.agent) ? [] : [`agente não cadastrado: ${a.agent}`]),
    execute: async (a) => {
      const agent = codeAgents.get(a.agent)!;
      const result = await testAgent(agent, { model: a.model ?? null, scratchDir: config.scratchDir, shell: config.shell, env: config.cliEnv });
      if (agent.source !== 'env') codeAgents.recordTest(agent.id, result);
      return JSON.stringify(result);
    },
    timeoutMs: 180_000,
  });
}
