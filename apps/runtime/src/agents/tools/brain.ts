import { deniedAttempts, repeatedAttempts } from '../../brain/domain/step-learnings.ts';
import { outOfScope } from '../../brain/domain/judge.ts';
import { classifyEntity } from '../../brain/domain/fact-match.ts';
import type { Entity } from '../../brain/domain/types.ts';
import { defineTool, useDelivery, useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import type { BrainStore } from '../../brain/store.ts';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';

/** Memory: query the brain freely; learning goes through the gate (the developer approves). */

export const brainQuery = (brain: BrainStore) => defineTool({
  name: 'brain_query',
  description:
    'Look up the brain (knowledge graph). Give `id` to get one entity with its current relations and neighborhood (or, with a procedure\'s name, the whole procedure with its scripts), `type` to list entities of a type, or `text` to search. Use before acting: what you were taught is here.',
  input: v.object({
    id: v.optional(v.string()),
    type: v.optional(v.string()),
    text: v.optional(v.string()),
    depth: v.optional(v.number()),
  }),
  async run({ data }) {
    const json = (value: unknown) => JSON.parse(JSON.stringify(value));
    if (data.id) {
      const entity = brain.get(data.id);
      // A procedure by its name: all of it, with its scripts (to read before changing or making a version).
      const playbook = entity ? undefined : brain.playbook(data.id);
      if (playbook) return { output: json({ playbook }) };
      if (!entity) return { output: { notFound: data.id, similar: brain.search(data.id, 5).map((e) => e.id) } };
      return { output: json({ entity, relations: brain.neighbors(data.id), nearby: brain.reachable(data.id, data.depth ?? 2) }) };
    }
    if (data.type) return { output: json(brain.byType(data.type)) };
    if (data.text) return { output: json(brain.search(data.text)) };
    return { output: json({ ontology: brain.types(), gaps: brain.gaps(), playbooks: brain.playbooks().map((p) => p.name) }) };
  },
});

const learnItem = v.variant('kind', [
  v.object({
    kind: v.literal('type'),
    payload: v.object({
      name: v.string(),
      description: v.string(),
      relations: v.optional(v.record(v.string(), v.string())),
      requires: v.optional(v.array(v.string())),
      props: v.optional(v.pipe(v.record(v.string(), v.string()), v.description('Properties every entity of this concept has (name → what it is), e.g. {"endereco": "URL do portal"}: what a procedure may cite as {{entrada.endereco}}. Added to the ones it has.'))),
      knows: v.optional(v.pipe(v.record(v.string(), v.string()), v.description('What is known for every entity of this concept (name → how), e.g. {"de_pe": "running = desired", "achar": "buscar pelo nome no portal"}. Added to the ones it has.'))),
    }),
  }),
  v.object({
    kind: v.literal('entity'),
    payload: v.object({
      id: v.string(),
      type: v.string(),
      props: v.optional(v.record(v.string(), v.unknown())),
      body: v.optional(v.string()),
      aliases: v.optional(v.pipe(v.array(v.string()), v.description('Other names it goes by ("xpto" for xpto-mfe)'))),
    }),
  }),
  v.object({ kind: v.literal('edge'), payload: v.object({ from: v.string(), rel: v.string(), to: v.string(), attrs: v.optional(v.record(v.string(), v.unknown())), validFrom: v.optional(v.string()), validTo: v.optional(v.string()) }) }),
  v.object({
    kind: v.literal('playbook'),
    payload: v.object({
      name: v.pipe(v.string(), v.description('kebab-case')),
      description: v.pipe(v.string(), v.description('When to use it — this line decides when it is picked')),
      intent: v.optional(v.pipe(v.string(), v.description('What it is for, in terms of concepts: "Publicar uma Versao de um MicroFrontend em um Ambiente"'))),
      testedRun: v.optional(v.pipe(v.string(), v.description('The rehearsal (runId of rehearsal_finish) that proved it works'))),
      inputs: v.optional(
        v.pipe(
          v.array(v.object({ name: v.string(), concept: v.optional(v.string()), description: v.optional(v.string()) })),
          v.description('What it receives each time (snake_case), typed by a concept when it is one: [{"name":"mfe","concept":"MicroFrontend"},{"name":"versao"}]. Steps cite {{mfe}} and {{mfe.publicadoPor.endereco}} (relations, then a declared property); never write a specific name (checkout-mfe) in the steps.'),
        ),
      ),
      appliesTo: v.optional(v.string()),
      trigger: v.string(),
      autonomy: v.optional(v.picklist(['observe', 'ask', 'auto'])),
      steps: v.array(v.object({ id: v.string(), label: v.string(), how: v.string() })),
      instructions: v.string(),
      variationOf: v.optional(v.pipe(v.string(), v.description('Name of the playbook this one was made from (a variation); keep the ids of reused steps'))),
      learnings: v.optional(
        v.pipe(
          v.array(v.object({ step: v.optional(v.string()), tried: v.pipe(v.string(), v.maxLength(600)), outcome: v.picklist(['falhou', 'funcionou']), why: v.optional(v.pipe(v.string(), v.maxLength(300))) })),
          v.description('What this run taught about a step, kept with the procedure: [{"step":"filtrar","tried":"clicar no botão Ofertas","outcome":"falhou","why":"não existe nesta categoria"},{"step":"filtrar","tried":"filtro Desconto 10% ou mais no menu lateral","outcome":"funcionou"}]. Only what really happened in the run.'),
        ),
      ),
      outputs: v.optional(
        v.pipe(
          v.array(v.object({ name: v.string(), description: v.string() })),
          v.description('What it hands over when it finishes (snake_case names, e.g. versao, pr_url): the next stage of an esteira uses them'),
        ),
      ),
      scripts: v.optional(
        v.pipe(
          v.array(v.object({ name: v.string(), description: v.string(), code: v.string(), effect: v.optional(v.picklist(['local', 'publica'])) })),
          v.description('Its own Python scripts (name like gerar_html.py), run with run_script and reading data from sys.argv. The complete list: scripts left out are removed. Leave the field out to keep the current ones.'),
        ),
      ),
    }),
  }),
  v.object({
    kind: v.literal('pipeline'),
    payload: v.object({
      name: v.pipe(v.string(), v.description('kebab-case')),
      description: v.string(),
      inputs: v.pipe(
        v.array(v.object({ name: v.string(), description: v.string(), options: v.optional(v.array(v.string())), default: v.optional(v.string()) })),
        v.description('What it needs to start; `options` when a branch depends on it (e.g. tipo: front/backend); `default` when the developer gave a usual value (a folder, a branch): then it starts without asking'),
      ),
      stages: v.pipe(
        v.array(
          v.object({
            id: v.pipe(v.string(), v.description('kebab-case, short: dev, hml, gmud')),
            label: v.string(),
            passage: v.pipe(v.picklist(['ask', 'auto']), v.description('Coming into this stage: ask the developer, or go on by itself')),
            options: v.array(
              v.object({
                playbook: v.string(),
                when: v.optional(v.object({ field: v.string(), equals: v.string() })),
                map: v.optional(
                  v.pipe(
                    v.record(v.string(), v.string()),
                    v.description('Only when names differ: param ← "entrada.<input>", "<stage>.<output>" or "perguntar"'),
                  ),
                ),
              }),
            ),
          }),
        ),
        v.description('In order. A stage with branches has one option per branch, each with `when`.'),
      ),
    }),
  }),
]);

/** Types first, then what uses them: an entity can be of a type proposed in the same batch. */
const ORDER = { type: 0, entity: 1, edge: 2, playbook: 3, pipeline: 4 } as const;
export const inLearningOrder = <T extends { kind: keyof typeof ORDER }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

/**
 * The learning card's heading: a fix to procedures that already exist reads as one
 * ("Corrigir 2 procedimentos: a, b"); anything else as "Aprender: <reason>".
 */
export function learnTitle(items: Array<{ kind: string; payload: { name?: string } }>, reason: string, exists: (playbook: string) => boolean): string {
  const fixes = items.filter((i) => i.kind === 'playbook' && i.payload.name && exists(i.payload.name)).map((i) => i.payload.name!);
  const pipelines = items.filter((i) => i.kind === 'pipeline').map((i) => i.payload.name ?? '');
  if (fixes.length && fixes.length + pipelines.length === items.length) {
    const what = [fixes.length === 1 ? `o procedimento ${fixes[0]}` : `${fixes.length} procedimentos: ${fixes.join(', ')}`, ...pipelines.map((n) => `a esteira ${n}`)];
    return `Corrigir ${what.join(' e ')}`;
  }
  return `Aprender: ${reason}`;
}

export const memory = defineCapability({ name: 'brain', needs: ['brain', 'config'], register: useBrain });

function useBrain(ctx: AgentContext, { brain, config }: Deps<'brain' | 'config'>) {
  const delivery = useDelivery();
  useTool(brainQuery(brain));
  ctx.gated({
    name: 'brain_learn',
    description:
      'Save what you learned: new ontology types, entities, relations (with optional validity dates), playbooks (procedures with steps) and esteiras (playbooks in sequence, `pipeline`). ' +
      'The brain starts empty: when an entity needs a type that does not exist yet, include that `type` in the same batch — never drop the entity because its type is missing. ' +
      'Save the things the procedure touches (account, repository, portal, environment) as entities, not only the playbook. ' +
      'The batch is checked first (problems come back at once, nothing is asked); then shown to the developer to approve, and saved all or nothing.',
    input: v.object({
      reason: v.string(),
      why: v.optional(v.pipe(v.string(), v.maxLength(400), v.description('Why you propose it: ONE sentence in Portuguese, shown inside the card ("o curl não é permitido aqui; extrair pelo navegador grava o JSON direto").'))),
      asked: v.optional(v.pipe(v.string(), v.maxLength(400), v.description("ONLY when the developer, in THIS message, asked to change a procedure: their request in their own words (\"muda o passo 5 pra gravar com a data no nome\"). The card shows it, and their request is not limited to the steps a review named. Never for your own ideas."))),
      items: v.array(learnItem),
      leftOut: v.optional(
        v.pipe(
          v.array(v.object({ value: v.string(), where: v.string() })),
          v.description('Each specific value of the explanation that is NOT in the procedure, and where it went: {"value":"checkout-mfe","where":"fato: é um MicroFrontend"}, {"value":"2.14.0","where":"entrada versao"}. Never a password.'),
        ),
      ),
    }),
    category: () => 'aprender',
    why: (a) => a.why?.trim() || undefined,
    summary: (a) => learnTitle(a.items as Array<{ kind: string; payload: { name?: string } }>, a.reason, (name) => !!brain.playbook(name)),
    precheck: (a) => {
      const problems = brain.learnProblems(inLearningOrder(a.items) as never);
      if (problems.length) return [...problems, 'Se falta um tipo, inclua o item `type` no mesmo lote; não tire a entidade.'];
      // The developer's own request, in this very message, is not held to the steps a review named.
      const theirs = delivery?.kind === 'user' || (delivery?.kind === 'signal' && delivery.type === 'card');
      if (a.asked?.trim() && !theirs) return ['`asked` só vale na mensagem em que o desenvolvedor pediu a mudança: tire-o e proponha só o que a revisão pediu.'];
      const scope = a.asked?.trim() ? [] : scopeProblems(brain, a.items as LearnItems, ctx.conversationId);
      if (scope.length && theirs) scope.push('Se foi o desenvolvedor que pediu esta mudança agora, passe o pedido dele em `asked`.');
      // An attempt that already failed or was denied in this procedure does not come back as a new idea.
      const repeated = a.asked?.trim() ? [] : repeatedProposals(brain, a.items as LearnItems);
      return [...scope, ...repeated, ...commandProblems(a.items as LearnItems, config.allowedBinaries), ...sameFactProblems(a.items as LearnItems, (t) => brain.byType(t))];
    },
    // A denied change to a procedure is remembered with it, so it is not proposed again.
    denied: (a) => {
      for (const item of a.items as LearnItems) {
        const before = item.kind === 'playbook' ? brain.playbook(String(item.payload.name ?? '')) : undefined;
        if (!before || !Array.isArray(item.payload.steps)) continue;
        for (const l of deniedAttempts(before.name, before.steps, stepsOf(item), ctx.conversationId)) brain.learnings.add(l);
      }
    },
    execute: async (a) => {
      const applied = brain.learn(inLearningOrder(a.items) as never, a.reason, ctx.conversationId);
      for (const item of a.items as LearnItems) if (item.kind === 'playbook' && item.payload.name) brain.review.changeApplied(String(item.payload.name));
      saveLearnings(brain, a.items as LearnItems, ctx.conversationId, a.asked?.trim() ? 'pedido' : 'revisao');
      return `Guardado no cérebro: ${applied.join('; ')}`;
    },
  });
}

type LearnItems = Array<{ kind: string; payload: Record<string, unknown> }>;

const stepsOf = (item: LearnItems[number]) => (item.payload.steps as Array<Record<string, unknown>>).map((st) => ({ id: String(st.id ?? ''), how: String(st.how ?? '') }));

/** Steps of a new version that repeat what already failed or was denied in that procedure (docs/funcionalidades/25). */
function repeatedProposals(brain: Deps<'brain'>['brain'], items: LearnItems): string[] {
  const out: string[] = [];
  for (const item of items) {
    const before = item.kind === 'playbook' && Array.isArray(item.payload.steps) ? brain.playbook(String(item.payload.name ?? '')) : undefined;
    if (!before) continue;
    out.push(...repeatedAttempts(before.steps, stepsOf(item), brain.learnings.list(before.name)).map((line) => `${before.name}, ${line}`));
  }
  return out;
}

/** What the batch says the run taught about each procedure: kept with it once the card is approved. */
function saveLearnings(brain: Deps<'brain'>['brain'], items: LearnItems, conversationId: string, source: 'pedido' | 'revisao'): void {
  for (const item of items) {
    if (item.kind !== 'playbook' || !Array.isArray(item.payload.learnings)) continue;
    const playbook = String(item.payload.name ?? '');
    const steps = new Set(brain.playbook(playbook)?.steps.map((s) => s.id));
    for (const l of item.payload.learnings as Array<{ step?: string; tried: string; outcome: 'falhou' | 'funcionou'; why?: string }>) {
      brain.learnings.add({ playbook, step: l.step && steps.has(l.step) ? l.step : null, tried: l.tried, outcome: l.outcome, why: l.why ?? '', source, runId: null, conversationId });
    }
  }
}

/**
 * When the end-of-run review asked to change only some steps of a procedure (docs/funcionalidades/19),
 * a new version that touches others is refused before any card: autonomy before perfection.
 */
function scopeProblems(brain: Deps<'brain'>['brain'], items: LearnItems, conversationId: string): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.kind !== 'playbook' || !Array.isArray(item.payload.steps)) continue;
    const name = String(item.payload.name ?? '');
    const before = brain.playbook(name);
    const scope = before && brain.review.changeScope(name, conversationId);
    if (!before || !scope) continue;
    const after = (item.payload.steps as Array<Record<string, unknown>>).map((st) => ({ id: String(st.id ?? ''), label: String(st.label ?? ''), how: String(st.how ?? '') }));
    const outside = outOfScope(before.steps, after, scope);
    if (outside.length) {
      out.push(`${name}: a revisão pediu para mudar só os passos ${scope.join(', ')}; esta versão muda também ${outside.join(', ')}. Deixe esses passos exatamente como estão (mesmo id, label e how).`);
    }
  }
  return out;
}

/**
 * A "new" fact that is one the brain already has, under another name or with the same value
 * (docs/funcionalidades/22): back to the model before the card, to add to the existing one.
 */
export function sameFactProblems(items: LearnItems, byType: (type: string) => Entity[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.kind !== 'entity') continue;
    const p = item.payload as { id?: unknown; type?: unknown; props?: unknown; aliases?: unknown };
    if (typeof p.id !== 'string' || typeof p.type !== 'string') continue;
    const v = classifyEntity({ id: p.id, type: p.type, props: (p.props ?? {}) as Record<string, unknown>, aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [] }, byType);
    // Nothing new, but under another name: saving it would make a second fact for the same thing.
    if (v.kind === 'known' && v.id !== p.id) out.push(`${p.id} já está no cérebro como ${v.id}, com os mesmos valores: tire este item do lote.`);
    if (v.kind === 'same') out.push(`${p.id} é o mesmo que ${v.id} (${v.why}): use o id ${v.id}, ponha "${p.id}" em aliases e mantenha só o que acrescenta ou muda; relações que citam ${p.id} passam a citar ${v.id}.`);
  }
  return out;
}

const NOT_A_PROGRAM = new Set(['com', 'para', 'o', 'a', 'os', 'as', 'e', 'de', 'do', 'da', 'no', 'na', 'que', 'em', 'sobre', 'usando', 'um', 'uma', 'pelo', 'pela']);

/**
 * A step that runs a program this machine does not allow ("run_command curl …") would fail every
 * time: refused before any card, saying which programs there are.
 */
export function commandProblems(items: LearnItems, allowed: readonly string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.kind !== 'playbook' || !Array.isArray(item.payload.steps)) continue;
    for (const st of item.payload.steps as Array<Record<string, unknown>>) {
      for (const m of String(st.how ?? '').matchAll(/\brun_command\s+([A-Za-z][\w.+-]*)/g)) {
        const bin = m[1].toLowerCase();
        if (NOT_A_PROGRAM.has(bin) || allowed.includes(bin)) continue;
        out.push(`passo ${String(st.id ?? '')}: ${bin} não está entre os comandos permitidos (${allowed.join(', ')}). Use um deles, um script do procedimento (run_script) ou o navegador com saveTo; se ${bin} for essencial, peça ao desenvolvedor para liberar em ORBI_ALLOWED_BINARIES.`);
      }
    }
  }
  return out;
}
