import { defineSkill, usePersistentState, useSkill, useTool } from '../runtime-port.ts';
import * as v from 'valibot';
import type { BrainStore } from '../../brain/store.ts';
import type { Inbox } from '../../conversations/inbox.ts';
import { defineCapability, type Deps } from '../capability.ts';
import { redact } from '../../vault/vault.ts';
import type { ActiveRun, AgentContext } from '../context.ts';
import { LEVEL_NAMES } from '../../brain/domain/levels.ts';
import { RUN_RULES } from '../prompt.ts';

/** The playbook running in this conversation, kept across turns. */
export function useActiveRun() {
  return usePersistentState<ActiveRun>('activeRun', null);
}

/**
 * Playbooks: the most used are mounted as Agent Skills (one catalog line each;
 * the model activates one to read its steps), plus the two tools that run one
 * as a live checklist. The catalog stays small however many playbooks exist:
 * the rest are found by search (playbook_similar) and started by name. The
 * order (uses, then name) is stable, so the catalog rarely changes between
 * turns and the prompt cache holds.
 */
export function skillCatalog<T extends { name: string; uses: number }>(playbooks: T[], size: number): T[] {
  return [...playbooks].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)).slice(0, Math.max(0, size));
}

export const playbooks = defineCapability({ name: 'playbooks', needs: ['brain', 'vault', 'pipelines', 'toolOutcomes', 'inbox', 'config'], register: usePlaybooks });

function usePlaybooks(ctx: AgentContext, { brain, vault, pipelines, toolOutcomes, inbox, config }: Deps<'brain' | 'vault' | 'pipelines' | 'toolOutcomes' | 'inbox' | 'config'>) {

  const showRun = (runId: string) => {
    const run = brain.run(runId);
    if (!run) return;
    ctx.ui({
      component: 'stepper',
      id: `run-${run.id}`,
      title: run.playbook,
      status: run.status,
      steps: run.steps.map((s) => ({ id: s.id, label: s.label, status: s.status, note: s.note })),
    });
  };

  for (const pb of skillCatalog(brain.playbooks(), config.skillCatalogSize)) {
    useSkill(
      defineSkill({
        name: pb.name,
        description: `${pb.description}${pb.appliesTo ? ` (aplica a: ${pb.appliesTo})` : ''}`,
        instructions: [
          pb.instructions,
          '',
          `Autonomia: ${pb.autonomy === 'observe' ? 'só observar' : LEVEL_NAMES[pb.level]}. Usado ${pb.uses}x, ${pb.successes} com sucesso. Comece com playbook_start {"name":"${pb.name}"}.`,
          '',
          '## Passos',
          ...pb.steps.map((s, i) => `${i + 1}. [${s.id}] ${s.label} — ${s.how}`),
          ...(pb.outputs.length
            ? ['', '## Entrega (registre com outputs no playbook_step do último passo)', ...pb.outputs.map((o) => `- ${o.name}: ${o.description}`)]
            : []),
          ...(pb.scripts.length
            ? ['', '## Scripts (rode com run_script {"script", "args"}; não reescreva com python3 -c)', ...pb.scripts.map((s) => `- ${s.name}: ${s.description}`)]
            : []),
        ].join('\n'),
      }),
    );
  }

  useTool({
    name: 'playbook_start',
    description:
      'Start running a learned playbook. Shows its steps to the developer as a live checklist. Then report each step with playbook_step. Pass the values of its {{parameters}} (e.g. {"mfe": "novo-front", "versao": "2.5.0"}); credentials ({{segredo:…}}) are not parameters.',
    input: v.object({ name: v.string(), target: v.optional(v.string()), params: v.optional(v.record(v.string(), v.string())) }),
    async run({ data }) {
      const pb = brain.playbook(data.name);
      if (!pb) return { output: { error: `playbook não existe: ${data.name}`, available: brain.playbooks().map((p) => p.name) } };
      // In an esteira, stages go in order: a later stage does not start while the current is open.
      const outOfOrder = pipelines.engine.startProblem(ctx.conversationId, pb.name);
      if (outOfOrder) return { output: { error: outOfOrder } };
      const run = brain.startRun(pb.name, ctx.conversationId, data.params);
      ctx.setActiveRun({ runId: run.id, playbook: pb.name, autonomy: pb.autonomy });
      pipelines.engine.runStarted(run);
      showRun(run.id);
      const steps = run.steps.map((s) => ({ id: s.id, label: s.label, how: s.how }));
      const level = pb.autonomy === 'observe' ? 'só observar' : LEVEL_NAMES[pb.level];
      // This turn's prompt was built before the run existed: the rules for running come here.
      if (!pb.outputs.length) return { output: { runId: run.id, autonomy: level, steps, regras: RUN_RULES } };
      const outputs = pb.outputs.map((o) => ({ name: o.name, description: o.description }));
      return { output: { runId: run.id, autonomy: level, steps, outputs, note: 'Ao terminar, registre os valores com outputs no playbook_step.', regras: RUN_RULES } };
    },
  });

  useTool({
    name: 'playbook_step',
    description:
      'Report progress of the running playbook: mark a step running, done, failed, waiting (for CI, approval, a follow-up) or skipped, with a short note. ' +
      'With `outputs`, record what the playbook hands over (only the names it declares, e.g. {"versao": "2.5.0", "pr_url": "…"}): the next stage of an esteira and agents use them. Never credentials.',
    input: v.object({
      stepId: v.string(),
      status: v.picklist(['running', 'done', 'failed', 'waiting', 'skipped']),
      note: v.optional(v.string()),
      outputs: v.optional(v.record(v.string(), v.pipe(v.string(), v.maxLength(2000)))),
    }),
    async run({ data }) {
      if (!ctx.activeRun) return { output: { error: 'nenhum playbook em execução' } };
      // A step whose last tool failed is not done: fix it, or say it failed or was skipped.
      const last = toolOutcomes.lastIn(ctx.conversationId);
      if (data.status === 'done' && last?.failed) {
        return {
          output: {
            error: `o passo ${data.stepId} não pode ser dado como feito: a última ferramenta (${last.tool}) falhou${last.error ? ` (${last.error.slice(0, 200)})` : ''}.`,
            hint: 'Corrija e tente de novo, ou marque o passo como failed ou skipped com uma nota do que aconteceu.',
          },
        };
      }
      // "Waiting" must be for something real: an approval card, a question or a scheduled follow-up.
      // Saying it before calling the tool left the developer with no button to press.
      if (data.status === 'waiting' && !(await somethingWaits({ inbox, brain }, ctx.conversationId))) {
        return {
          output: {
            error: `nada está esperando nesta conversa: não há aprovação, pergunta nem retorno agendado para o passo ${data.stepId}.`,
            hint: 'Chame a ferramenta do passo (run_command, run_script…): se ela precisar de aprovação, o portão pede e o cartão aparece. Para esperar CI ou deploy, use schedule_followup. Só então marque waiting.',
          },
        };
      }
      let outputs = data.outputs;
      if (outputs && Object.keys(outputs).length) {
        // A value that happens to be a credential never gets stored as a result.
        const secrets = (await Promise.all(vault.list().map((x) => vault.get(x.name)))).filter((x): x is string => !!x);
        outputs = Object.fromEntries(Object.entries(outputs).map(([k, val]) => [k, redact(val, secrets)]));
      }
      let run;
      try {
        run = brain.updateRunStep(ctx.activeRun.runId, data.stepId, data.status, data.note, outputs);
      } catch (error) {
        return { output: { error: error instanceof Error ? error.message : String(error) } };
      }
      showRun(run.id);
      if (run.status !== 'done' && run.status !== 'failed') {
        // The last step was given but some before it are still open: the run does not end until they are.
        const last = run.steps.at(-1);
        const open = run.steps.filter((s) => s.status === 'pending' || s.status === 'running').map((s) => s.id);
        if (last?.id === data.stepId && last.status === 'done' && open.length) {
          return {
            output: {
              runStatus: run.status,
              pendentes: open,
              hint: `O procedimento só termina quando todos os passos fecham. Marque ${open.join(', ')} com playbook_step (done se foi feito, skipped se não precisou), com uma nota. Sem isso, a esteira não segue.`,
            },
          };
        }
        return { output: { runStatus: run.status } };
      }
      ctx.setActiveRun(null);
      // The level and the review come when the turn ends (review/review.ts), after every failure is in.
      // Part of an esteira: the engine says what comes next (the next stage, or wait for the developer).
      const next = pipelines.engine.runFinished(run);
      return { output: { runStatus: run.status, ...(next ? { esteira: next } : {}) } };
    },
  });
}

/**
 * Whether the conversation waits for something: an open card (approval, question, learning,
 * passage) or a scheduled follow-up. Tools of the same batch may still be starting: a short look again.
 */
async function somethingWaits({ inbox, brain }: { inbox: Inbox; brain: BrainStore }, conversationId: string, tries = 4): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const open = inbox.list({ status: 'open' }).some((x) => x.conversationId === conversationId && x.kind !== 'level');
    if (open || brain.hasScheduledFollowup(conversationId)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
