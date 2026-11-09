import { useAgentStart, useDelivery, usePersistentState, useTool } from './runtime-port.ts';
import type * as v from 'valibot';
import type { UiComponent } from '@orbi/contracts';
import type { Deps } from './capability.ts';
import { decide, effectOfCategory, type Category } from '../autonomy/policy.ts';
import { askReason, defaultFingerprint, fingerprintWith, type RunAction } from '../brain/domain/levels.ts';
import type { PlaybookRun } from '../brain/domain/types.ts';
import type { ActiveRun, GatedTool } from './context.ts';

type Pending = { tool: string; args: unknown; category: Category; requestedAt: string; runId?: string; action?: RunAction };

/** "passo 2 de 4 · Copiar o index.html": the step running now, for the card and the trail. */
function currentStep(run: PlaybookRun | undefined): { id: string; text: string } | null {
  if (!run) return null;
  const i = run.steps.findIndex((s) => s.status === 'running' || s.status === 'waiting');
  const at = i >= 0 ? i : run.steps.findIndex((s) => s.status === 'pending');
  if (at < 0) return null;
  return { id: run.steps[at]!.id, text: `passo ${at + 1} de ${run.steps.length} · ${run.steps[at]!.label}` };
}
type Executor = (args: unknown, approvalId: string) => Promise<string>;

/**
 * The autonomy gate: one path for every tool that changes something.
 *   auto    → runs now
 *   observe → only reported back to the model
 *   ask     → recorded, shown as an approval card, turn ends; it runs when the
 *             developer approves (signal `tool-approval`, sent by the HTTP inbox route)
 */
export function useGate(conversationId: string, ui: (c: UiComponent) => void, activeRun: () => ActiveRun, { inbox, policy, brain }: Deps<'inbox' | 'policy' | 'brain'>) {
  const [pending, setPending] = usePersistentState<Record<string, Pending>>('pending', {});
  const delivery = useDelivery();
  const executors = new Map<string, Executor>();

  function gated<T extends v.GenericSchema<Record<string, unknown>>>(def: GatedTool<T>) {
    executors.set(def.name, def.execute as Executor);
    useTool({
      name: def.name,
      description: `${def.description} Governed by the developer's autonomy settings: it may run now, wait for approval, or only be reported.`,
      input: def.input,
      timeoutMs: def.timeoutMs ?? 600_000,
      async run({ data, toolCallId }) {
        const problems = def.precheck?.(data) ?? [];
        if (problems.length) {
          return { output: { status: 'invalid', problems, hint: 'Nada foi feito nem pedido ao desenvolvedor. Corrija e chame de novo com tudo.' } };
        }
        const category = def.category(data);
        // Inside a playbook: its level, and whether this exact action already worked before.
        const active = activeRun();
        const pb = active ? brain.playbook(active.playbook) : undefined;
        // Learning is about the brain, not a step of the running procedure: it stays out of its trail.
        const run = active && def.category(data) !== 'aprender' ? brain.run(active.runId) : undefined;
        const effect = def.effect?.(data) ?? effectOfCategory(category);
        const step = currentStep(run);
        const action: RunAction = {
          fingerprint: fingerprintWith(def.fingerprint?.(data) ?? defaultFingerprint(def.name, data), run?.params ?? {}),
          tool: def.name,
          effect,
          summary: def.title?.(data) ?? def.summary(data),
          step: step?.id ?? null,
        };
        const known = pb ? brain.isKnownAction(pb.name, action.fingerprint) : false;
        const level = decide(policy.get(), category, pb ?? null, { known, effect });
        if (level === 'auto') {
          const result = await def.execute(data, toolCallId);
          if (run) brain.recordRunAction(run.id, action);
          // How the call reads in the conversation travels with it: the app needs no list of tools.
          const shown = { ...(def.title ? { title: def.title(data) } : {}), ...(def.command ? { command: def.command(data) } : {}) };
          return { output: { status: 'executed', category, ...shown, result } };
        }
        if (level === 'observe') {
          return { output: { status: 'not_executed', category, reason: `"${category}" está em modo observar: relate o que faria e não tente de novo.` } };
        }
        setPending((prev) => ({ ...prev, [toolCallId]: { tool: def.name, args: data, category, requestedAt: new Date().toISOString(), ...(run ? { runId: run.id, action } : {}) } }));
        const detail = JSON.stringify(data, null, 2);
        const title = def.title?.(data) ?? def.summary(data);
        const item = inbox.add({ kind: category === 'aprender' ? 'learning' : 'approval', conversationId, title, detail, approvalId: toolCallId, routine: category });
        ui({
          component: 'approval', id: `approval-${toolCallId}`, title, detail, category, inboxId: item.id, effect,
          ...(def.command ? { command: def.command(data) } : {}),
          // Learning is not an action of the running procedure: no level reason, no step.
          ...(pb && category !== 'aprender' ? { reason: askReason(pb, { known, effect }) } : {}),
          ...(step && category !== 'aprender' ? { step: step.text } : {}),
        });
        return { output: { status: 'pending_approval', approvalId: toolCallId, category }, terminate: true };
      },
    });
  }

  // Runs the stored call when the developer decides.
  useAgentStart(async ({ append }) => {
    if (delivery.kind !== 'signal' || delivery.type !== 'tool-approval') return;
    const { approvalId = '', decision, approver = 'O desenvolvedor' } = (delivery.attributes ?? {}) as Record<string, string>;
    const call = pending[approvalId];
    if (!call) return;
    setPending(({ [approvalId]: _done, ...rest }) => rest);
    if (decision !== 'approve') {
      if (call.runId) brain.addRunDeviation(call.runId, { kind: 'negado', detail: `você negou: ${call.action?.summary ?? call.tool}`, tool: call.tool, step: call.action?.step ?? null });
      append({ kind: 'signal', type: 'tool-approval-result', body: `${approver} negou ${call.tool} (${approvalId}). Não tente de novo; pergunte como seguir.` });
      return;
    }
    try {
      const result = await executors.get(call.tool)!(call.args, approvalId);
      if (call.runId && call.action) brain.recordRunAction(call.runId, call.action);
      append({ kind: 'signal', type: 'tool-approval-result', body: `${approver} aprovou ${call.tool} (${approvalId}). Resultado: ${result}` });
    } catch (error) {
      if (call.runId) brain.addRunDeviation(call.runId, { kind: 'falha', detail: `${call.tool} falhou: ${String(error).slice(0, 200)}`, tool: call.tool, step: call.action?.step ?? null });
      append({ kind: 'signal', type: 'tool-approval-result', body: `${call.tool} (${approvalId}) foi aprovado mas falhou: ${String(error)}` });
    }
  });

  return gated;
}
