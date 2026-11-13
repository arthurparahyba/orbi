import { useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import { defineCapability, type Deps } from '../capability.ts';
import type { AgentContext } from '../context.ts';

/**
 * "Já sei algo parecido?": before acting on a request, and before storing a
 * procedure, Orbi looks for what it already knows. The same thing: it says so
 * in one line and goes on. Something similar: it stops and shows the card with
 * what it can reuse, what changes and a suggestion, and the developer chooses.
 */
export const similar = defineCapability({ name: 'similar', needs: ['brain', 'inbox'], register: useSimilar });

function useSimilar(ctx: AgentContext, { brain, inbox }: Deps<'brain' | 'inbox'>) {

  useTool({
    name: 'playbook_similar',
    description:
      'Find playbooks that look like a request or a procedure you are about to store. Give the goal in a few words ("deletar repositório no GitHub"). ' +
      'Returns up to 3 candidates, best first, with steps, instructions, scripts (names), inputs, outputs and track record. A version of one (`variationOf`) inherits its scripts, inputs and outputs: send only what changes; you judge if one is the same, similar or unrelated. ' +
      'Also how you find any playbook not in your skill catalog: run it with playbook_start by name.',
    input: v.object({ text: v.string() }),
    async run({ data }) {
      const all = brain.playbooks();
      const candidates = brain.searchPlaybooks(data.text, 3).map(({ playbook: p, shared }) => ({
        name: p.name,
        description: p.description,
        trigger: p.trigger,
        appliesTo: p.appliesTo,
        autonomy: p.autonomy,
        steps: p.steps,
        instructions: p.instructions,
        // Names only: a version of it inherits them; brain_query with the name gives the code.
        scripts: p.scripts.map((x) => ({ name: x.name, description: x.description })),
        inputs: p.inputs,
        outputs: p.outputs,
        uses: p.uses,
        successes: p.successes,
        variationOf: p.variationOf,
        variations: all.filter((o) => o.variationOf === p.name).map((o) => o.name),
        sharedStems: shared,
      }));
      const result = candidates.length ? { candidates } : { candidates, note: 'nada parecido: siga normalmente' };
      return { output: JSON.parse(JSON.stringify(result)) };
    },
  });

  useTool({
    name: 'similar_found',
    description:
      'Tell the developer you already know something. verdict "same": one line, then go on with that playbook. ' +
      'verdict "similar": shows the "Já sei algo parecido" card and ends your turn; do not act or store anything until they choose.',
    input: v.object({
      verdict: v.picklist(['same', 'similar']),
      playbook: v.pipe(v.string(), v.description('Name of the existing playbook')),
      known: v.optional(v.pipe(v.string(), v.description('similar: first sentence, what you know and what you do not ("Sei criar repositório; deletar você ainda não me ensinou.")'))),
      relation: v.optional(v.pipe(v.string(), v.description('similar: 2–4 words, e.g. "parecido, não igual", "mesmo objetivo, outro lugar"'))),
      reuse: v.optional(v.array(v.string())),
      changes: v.optional(v.array(v.string())),
      suggestion: v.optional(v.pipe(v.string(), v.description('similar: your recommendation and why, one line'))),
      options: v.optional(v.array(v.object({ label: v.string(), hint: v.optional(v.string()) }))),
    }),
    async run({ data }) {
      const pb = brain.playbook(data.playbook);
      if (!pb) return { output: `playbook não existe: ${data.playbook}. Use playbook_similar para ver os nomes.` };
      const base = { name: pb.name, description: pb.description, uses: pb.uses, successes: pb.successes, learnedAt: pb.updatedAt };

      if (data.verdict === 'same') {
        ctx.ui({ component: 'known', id: `known-${pb.name}`, playbook: base });
        return { output: 'avisado; siga o playbook' };
      }
      const options = data.options?.length
        ? data.options
        : [{ label: 'Criar versão a partir deste' }, { label: 'É outra coisa: aprender do zero' }, { label: 'Era isso mesmo' }];
      const item = inbox.add({
        kind: 'question',
        conversationId: ctx.conversationId,
        title: `Já sei algo parecido: ${pb.name}`,
        detail: options.map((o) => o.label).join('\n'),
      });
      ctx.ui({
        component: 'similar',
        id: `similar-${item.id}`,
        known: data.known ?? '',
        relation: data.relation ?? 'parecido, não igual',
        playbook: base,
        reuse: data.reuse ?? [],
        changes: data.changes ?? [],
        suggestion: data.suggestion ?? '',
        options,
        inboxId: item.id,
      });
      return { output: 'cartão mostrado; a escolha chega como a próxima mensagem', terminate: true };
    },
  });
}
