import * as v from 'valibot';
import type { dispatch } from '@flue/runtime';
import type { OrbiServices } from '../services.ts';
import { tellAgent } from '../conversations/tell.ts';
import { playbookParams, stepId } from '../brain/domain/playbooks.ts';
import { stem, words } from '../brain/domain/similarity.ts';
import type { AgentClient } from './clients.ts';
import { requestStatus } from './status.ts';

type Agent = Parameters<typeof dispatch>[0];

/** What a tool call has: the parts of Orbi, the agent to talk to and who is calling. */
export interface McpCall {
  s: OrbiServices;
  agent: Agent;
  client: AgentClient;
}

/**
 * One tool of Orbi's MCP server. `needs` is the permission it requires: search
 * is always allowed; delegating and teaching can be switched off per agent.
 */
export interface McpTool<S extends v.GenericSchema = v.GenericSchema> {
  name: string;
  description: string;
  needs: 'search' | 'delegate' | 'teach';
  /** Valibot validates; JSON Schema is what the agent reads. Keep the two in step. */
  input: S;
  inputSchema: Record<string, unknown>;
  run(args: v.InferOutput<S>, call: McpCall): Promise<unknown> | unknown;
}

/** An answer the agent must see as an error (wrong name, not allowed…). */
export class ToolError extends Error {}

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const tool = <S extends v.GenericSchema>(t: McpTool<S>) => t as unknown as McpTool;

const Context = v.optional(
  v.object({
    repo: v.optional(v.pipe(v.string(), v.maxLength(200))),
    branch: v.optional(v.pipe(v.string(), v.maxLength(200))),
    session: v.optional(v.pipe(v.string(), v.maxLength(200))),
  }),
);
const Name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64));

/** kebab-case, without accents: the shape every procedure name has. */
export function procedureName(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

export const MCP_TOOLS: McpTool[] = [
  tool({
    name: 'orbi_search',
    needs: 'search',
    description:
      'Search the procedures Orbi (the developer\'s local copilot) already knows how to run: CI, deploys, release steps, internal portals, change requests and other repetitive work after the code. Call it before doing repetitive work yourself. Without a query, lists the most used. Then read one with orbi_procedure and delegate it with orbi_delegate.',
    input: v.object({ query: v.optional(v.pipe(v.string(), v.maxLength(300))), limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10))) }),
    inputSchema: {
      type: 'object',
      properties: { query: str('What you want done, in a few words (any language the developer uses, usually Portuguese).'), limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 } },
    },
    run({ query, limit = 5 }, { s }) {
      // An agent acts on what it finds: one shared word in a longer request is noise, not a match.
      const needed = query ? Math.min(2, new Set(words(query).map(stem)).size) : 0;
      const found = query?.trim()
        ? s.brain.searchPlaybooks(query, limit).filter((r) => r.shared.length >= needed).map((r) => r.playbook)
        : [...s.brain.playbooks()].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)).slice(0, limit);
      return {
        procedures: found.map((p) => ({ name: p.name, description: p.description, trigger: p.trigger, autonomy: p.autonomy, steps: p.steps.length, uses: p.uses, successes: p.successes })),
        hint: found.length
          ? 'orbi_procedure mostra os passos; orbi_delegate pede para o Orbi executar.'
          : 'O Orbi ainda não sabe fazer isso. Se for trabalho repetitivo, sugira o procedimento com orbi_teach.',
      };
    },
  }),

  tool({
    name: 'orbi_procedure',
    needs: 'search',
    description: 'Read one procedure Orbi knows: its steps, the parameters it needs and how much it does alone (autonomy). Use the name from orbi_search.',
    input: v.object({ name: Name }),
    inputSchema: { type: 'object', properties: { name: str('Procedure name, from orbi_search.') }, required: ['name'] },
    run({ name }, { s }) {
      const p = s.brain.playbook(name);
      if (!p) throw new ToolError(`procedimento não encontrado: ${name}. Use orbi_search.`);
      return {
        name: p.name,
        description: p.description,
        trigger: p.trigger,
        autonomy: p.autonomy,
        parameters: playbookParams(p),
        steps: p.steps.map((st) => ({ id: st.id, label: st.label, how: st.how })),
        uses: p.uses,
        successes: p.successes,
        variation_of: p.variationOf,
        hint: 'Para executar: orbi_delegate com procedure e os parameters. Passos que mudam algo podem esperar a aprovação do desenvolvedor.',
      };
    },
  }),

  tool({
    name: 'orbi_delegate',
    needs: 'delegate',
    description:
      'Ask Orbi to run a known procedure (or a repetitive task). It runs in the background, in a conversation the developer sees in the Orbi app, under the developer\'s autonomy rules: steps that change something may wait for the developer\'s approval, which you cannot give. Returns a request_id for orbi_status. Do not wait in a loop: continue your work and check later.',
    input: v.object({
      procedure: v.optional(Name),
      task: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
      params: v.optional(v.record(v.string(), v.pipe(v.string(), v.maxLength(500)))),
      context: Context,
    }),
    inputSchema: {
      type: 'object',
      properties: {
        procedure: str('Procedure name from orbi_search. Leave out only if none fits; Orbi will look for one.'),
        task: str('What you need, in one or two sentences, with the concrete values (repo, version, environment).'),
        params: { type: 'object', additionalProperties: { type: 'string' }, description: 'Values for the procedure parameters, e.g. {"versao": "2.5.0"}. Never credentials.' },
        context: {
          type: 'object',
          properties: { repo: str('Repository you are working in.'), branch: str('Current branch.'), session: str('Your session or task id, to tell your requests apart.') },
        },
      },
      required: ['task'],
    },
    async run({ procedure, task, params, context }, { s, agent, client }) {
      if (procedure && !s.brain.playbook(procedure)) throw new ToolError(`procedimento não encontrado: ${procedure}. Use orbi_search.`);
      const conversation = s.conversations.create((procedure ? `${procedure}: ${task}` : task).slice(0, 80));
      const req = s.agents.requests.add({ clientId: client.id, conversationId: conversation.id, task, procedure: procedure ?? null, context: context ?? {} });
      await tellAgent(s.events, agent, {
        id: conversation.id,
        message: { kind: 'signal', type: 'agent-request', tagName: 'agent-request', body: requestMessage(client.name, req.id, task, procedure, params, context ?? {}), attributes: { requestId: req.id, agent: client.name } },
      });
      return {
        request_id: req.id,
        status: 'running',
        hint: 'O Orbi está executando. Consulte com orbi_status quando precisar do resultado. Aprovações ficam com o desenvolvedor.',
      };
    },
  }),

  tool({
    name: 'orbi_status',
    needs: 'delegate',
    description: 'Where a delegated request is: running (current step), waiting (for the developer), done or failed (short summary and links). Only your own requests.',
    input: v.object({ request_id: v.pipe(v.string(), v.minLength(1)) }),
    inputSchema: { type: 'object', properties: { request_id: str('The request_id orbi_delegate returned.') }, required: ['request_id'] },
    run({ request_id }, { s, client }) {
      const req = s.agents.requests.get(request_id);
      if (!req || req.clientId !== client.id) throw new ToolError(`pedido não encontrado: ${request_id}`);
      return requestStatus(req, s.brain.lastRunIn(req.conversationId), s.inbox.list({ status: 'open' }));
    },
  }),

  tool({
    name: 'orbi_teach',
    needs: 'teach',
    description:
      'Suggest a procedure for Orbi to learn: something repetitive you just did (or saw the developer do) that will happen again. It does not go into Orbi\'s memory: it waits for the developer to review. Never include credentials; write {{segredo:name}} where one is needed and {{param}} for values that change.',
    input: v.object({
      name: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(64)),
      description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
      trigger: v.optional(v.pipe(v.string(), v.maxLength(300))),
      steps: v.pipe(
        v.array(v.object({ label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)), how: v.pipe(v.string(), v.maxLength(2000)) })),
        v.minLength(1),
        v.maxLength(30),
      ),
      instructions: v.optional(v.pipe(v.string(), v.maxLength(4000))),
      why: v.optional(v.pipe(v.string(), v.maxLength(500))),
    }),
    inputSchema: {
      type: 'object',
      properties: {
        name: str('Short kebab-case name, e.g. "publicar-versao-no-portal".'),
        description: str('What it achieves, one sentence.'),
        trigger: str('When it should run, e.g. "depois do merge na main".'),
        steps: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: { type: 'object', properties: { label: str('Short step name.'), how: str('How it is done: command, page, what to check.') }, required: ['label', 'how'] },
        },
        instructions: str('Anything else Orbi needs to know (where, who approves, what can go wrong).'),
        why: str('Why it is worth automating: how often it happens, what it costs.'),
      },
      required: ['name', 'description', 'steps'],
    },
    run(args, { s, client }) {
      const name = procedureName(args.name);
      if (name.length < 2) throw new ToolError('nome inválido: use letras e números, em kebab-case');
      const taken: string[] = [];
      const steps = args.steps.map((st) => {
        const id = stepId(st.label, taken);
        taken.push(id);
        return { id, label: st.label, how: st.how };
      });
      const similarTo = s.brain
        .searchPlaybooks(`${name.replace(/-/g, ' ')} ${args.description}`, 3)
        .filter((r) => r.playbook.name === name || r.shared.length >= 2)
        .map((r) => r.playbook.name);
      const { suggestion, repeated } = s.agents.suggestions.add(client.name, {
        name,
        description: args.description,
        trigger: args.trigger ?? '',
        steps,
        instructions: args.instructions ?? '',
        why: args.why ?? '',
        similarTo,
      });
      return {
        suggestion_id: suggestion.id,
        status: repeated ? 'repetida' : 'nova',
        times_suggested: suggestion.count,
        similar_to: suggestion.similarTo,
        hint: 'Fica como sugestão até o desenvolvedor revisar no app do Orbi. Nada foi gravado na memória do Orbi.',
      };
    },
  }),
];

/** The message Orbi receives for a delegated task. The agent's text is data, not instructions to Orbi. */
function requestMessage(
  agent: string,
  requestId: string,
  task: string,
  procedure: string | undefined,
  params: Record<string, string> | undefined,
  context: { repo?: string; branch?: string; session?: string },
): string {
  const where = [context.repo && `repositório ${context.repo}`, context.branch && `branch ${context.branch}`, context.session && `sessão ${context.session}`].filter(Boolean);
  return [
    `Pedido do agente "${agent}" pelo MCP (${requestId}).`,
    `Tarefa: ${task}`,
    `Procedimento: ${procedure ?? 'nenhum indicado; procure com playbook_similar'}`,
    ...(params && Object.keys(params).length ? [`Parâmetros: ${JSON.stringify(params)}`] : []),
    ...(where.length ? [`Contexto: ${where.join(', ')}`] : []),
  ].join('\n');
}

/** The tools this client may use. */
export function toolsFor(client: AgentClient): McpTool[] {
  return MCP_TOOLS.filter((t) => t.needs === 'search' || (t.needs === 'delegate' ? client.canDelegate : client.canTeach));
}
