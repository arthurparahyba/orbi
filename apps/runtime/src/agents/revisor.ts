'use agent';
import * as v from 'valibot';
import { defineTool, useModel, useTool } from './runtime-port.ts';
import { services, type OrbiServices } from '../services.ts';
import { brainQuery } from './tools/brain.ts';
import { modelForTurn, resolveRoles } from '../llm/roles.ts';
import { KNOWLEDGE_PREFIX, matchFacts, type FactCandidate } from '../review/knowledge.ts';
import instructions from '../prompts/revisor.md?raw';

/**
 * The knowledge reviewer (conversation `revisao:<runId>`, docs/funcionalidades/19): reads what a
 * finished run read and proposes facts about concepts the brain already has. Runs on the cheapest
 * model offered. It only reads the brain and hands candidates back to the runtime: the developer
 * approves them on the learning card of the run's conversation.
 */
export function Revisor({ id }: { id: string }) {
  const all = services();
  useModel(modelForTurn(all.llm, resolveRoles(all.llm, all.modelRoles.all(), all.modelTiers.all()), 'conhecimento'), { thinkingLevel: 'low' });
  useTool(brainQuery(all.brain));
  useTool(proposeFacts(all, id.slice(KNOWLEDGE_PREFIX.length)));
  return instructions;
}

Revisor.agentName = 'revisor';

const fact = v.variant('kind', [
  v.object({ kind: v.literal('entity'), id: v.string(), type: v.string(), props: v.optional(v.record(v.string(), v.unknown()), {}), aliases: v.optional(v.array(v.string())), why: v.string(), step: v.optional(v.string()) }),
  v.object({ kind: v.literal('edge'), from: v.string(), rel: v.string(), to: v.string(), why: v.string(), step: v.optional(v.string()) }),
]);

/** The facts found, checked like any learning (types that exist, no credentials); the valid ones go to the runtime. */
function proposeFacts(s: Pick<OrbiServices, 'brain' | 'knowledge'>, runId: string) {
  return defineTool({
    name: 'propose_facts',
    description: 'Propose the facts found in what the run read (an empty list when there is none). Problems come back at once; fix and call again with only those.',
    input: v.object({ facts: v.array(fact) }),
    async run({ data }) {
      const ok: FactCandidate[] = [];
      const problems: string[] = [];
      for (const f of data.facts) {
        const issues = f.kind === 'entity'
          ? [...(s.brain.type(f.type) ? [] : [`o tipo ${f.type} não existe no cérebro (não crie tipos)`]), ...s.brain.check('entity', { id: f.id, type: f.type, props: f.props })]
          : s.brain.check('edge', { from: f.from, rel: f.rel, to: f.to });
        if (issues.length) problems.push(`${f.kind === 'entity' ? f.id : `${f.from} ${f.rel} ${f.to}`}: ${issues.join('; ')}`);
        else ok.push(f as FactCandidate);
      }
      // Against the brain (docs/funcionalidades/22): the same thing under another name becomes the
      // existing fact, and what is already known is marked so (it may still change its step).
      const matched = matchFacts(ok, s.brain);
      s.knowledge.offer(runId, matched);
      return { output: { accepted: matched.filter((f) => f.verdict !== 'já sei').length, known: matched.filter((f) => f.verdict === 'já sei').length, ...(problems.length ? { problems } : {}) } };
    },
  });
}
