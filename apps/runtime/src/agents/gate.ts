import { useAgentStart, useDelivery, usePersistentState, useTool } from '@flue/runtime';
import type * as v from 'valibot';
import type { UiComponent } from '@orbi/contracts';
import { services } from '../services.ts';
import { decide, type Category } from '../autonomy/policy.ts';
import type { ActiveRun, GatedTool } from './context.ts';

type Pending = { tool: string; args: unknown; category: Category; requestedAt: string };
type Executor = (args: unknown, approvalId: string) => Promise<string>;

/**
 * The autonomy gate: one path for every tool that changes something.
 *   auto    → runs now
 *   observe → only reported back to the model
 *   ask     → recorded, shown as an approval card, turn ends; it runs when the
 *             developer approves (signal `tool-approval`, sent by the HTTP inbox route)
 */
export function useGate(conversationId: string, ui: (c: UiComponent) => void, activeRun: () => ActiveRun) {
  const { inbox, policy } = services();
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
        const category = def.category(data);
        const level = decide(policy.get(), category, activeRun());
        if (level === 'auto') return { output: { status: 'executed', category, result: await def.execute(data, toolCallId) } };
        if (level === 'observe') {
          return { output: { status: 'not_executed', category, reason: `"${category}" está em modo observar: relate o que faria e não tente de novo.` } };
        }
        setPending((prev) => ({ ...prev, [toolCallId]: { tool: def.name, args: data, category, requestedAt: new Date().toISOString() } }));
        const detail = JSON.stringify(data, null, 2);
        const item = inbox.add({ kind: category === 'aprender' ? 'learning' : 'approval', conversationId, title: def.summary(data), detail, approvalId: toolCallId, routine: category });
        ui({ component: 'approval', id: `approval-${toolCallId}`, title: def.summary(data), detail, category, inboxId: item.id });
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

  return gated;
}
