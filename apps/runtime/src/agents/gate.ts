import { useAgentStart, useDelivery, usePersistentState, useTool } from './runtime-port.ts';
import type * as v from 'valibot';
import type { UiComponent } from '@orbi/contracts';
import type { Deps } from './capability.ts';
import { decide, effectOfCategory, type Category } from '../autonomy/policy.ts';
import { askReason, defaultFingerprint, fingerprintWith, type RunAction } from '../brain/domain/levels.ts';
import type { PlaybookRun } from '../brain/domain/types.ts';
import type { ActiveRun, GatedTool } from './context.ts';
import type { InboxItem } from '../conversations/inbox.ts';

type Pending = { tool: string; args: unknown; category: Category; requestedAt: string; runId?: string; action?: RunAction };

/** "passo 2 de 4 · Copiar o index.html": the step running now, for the card and the trail. */
function currentStep(run: PlaybookRun | undefined): { id: string; text: string } | null {
  if (!run) return null;
  const i = run.steps.findIndex((s) => s.status === 'running' || s.status === 'waiting');
  const at = i >= 0 ? i : run.steps.findIndex((s) => s.status === 'pending');
  if (at < 0) return null;
  return { id: run.steps[at]!.id, text: `passo ${at + 1} de ${run.steps.length} · ${run.steps[at]!.label}` };
}
type Executor = (args: unknown, approvalId: string, how: 'auto' | 'approved', signal?: AbortSignal) => Promise<string>;

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
  const onDenied = new Map<string, (args: Record<string, unknown>) => void>();

  /**
   * The learning card this turn was asked from (a message written inside it, signal `card`), when
   * it is still open in this conversation with its call stored: a new proposal changes that card.
   */
  function cardInProgress(): { item: InboxItem; approvalId: string } | undefined {
    if (delivery.kind !== 'signal' || delivery.type !== 'card') return undefined;
    const item = inbox.get(String((delivery.attributes as Record<string, unknown> | undefined)?.card ?? ''));
    if (!item || item.status !== 'open' || item.kind !== 'learning' || item.conversationId !== conversationId) return undefined;
    if (!item.approvalId || !pending[item.approvalId]) return undefined;
    return { item, approvalId: item.approvalId };
  }

  function gated<T extends v.GenericSchema<Record<string, unknown>>>(def: GatedTool<T>) {
    executors.set(def.name, def.execute as Executor);
    if (def.denied) onDenied.set(def.name, def.denied as (args: Record<string, unknown>) => void);
    useTool({
      name: def.name,
      description: `${def.description} Governed by the developer's autonomy settings: it may run now, wait for approval, or only be reported.`,
      input: def.input,
      timeoutMs: def.timeoutMs ?? 600_000,
      async run({ data, toolCallId, signal }) {
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
        const byRule = decide(policy.get(), category, pb ?? null, { known, effect });
        const alone = def.alone?.();
        const decided = byRule === 'ask' && alone?.set && effect !== 'apaga' ? 'auto' : byRule;
        // In a rehearsal (trying out an explanation) whatever publishes or deletes always asks, whatever the level.
        const rehearsing = run?.kind === 'rehearsal' && (effect === 'publica' || effect === 'apaga');
        const level = decided === 'auto' && (def.alwaysAsk?.(data) || rehearsing) ? 'ask' : decided;
        if (level === 'auto') {
          const result = await def.execute(data, toolCallId, 'auto', signal);
          if (run) brain.recordRunAction(run.id, action);
          // How the call reads in the conversation travels with it: the app needs no list of tools.
          const shown = { ...(def.title ? { title: def.title(data) } : {}), ...(def.command ? { command: def.command(data) } : {}) };
          return { output: { status: 'executed', category, ...shown, result } };
        }
        if (level === 'observe') {
          return { output: { status: 'not_executed', category, reason: `"${category}" está em modo observar: relate o que faria e não tente de novo.` } };
        }
        // Asked inside a learning card that is still open (docs/funcionalidades/21): the card itself
        // changes. The stored call gets the new arguments, the item a new version; no new card.
        const card = category === 'aprender' ? cardInProgress() : undefined;
        if (card && JSON.stringify(pending[card.approvalId]?.args) === JSON.stringify(data)) {
          // The same proposal again (an "ok" read as a request): nothing changes on the card.
          return { output: { status: 'card_unchanged', approvalId: card.approvalId, note: 'É a mesma proposta que já está no cartão: nada mudou. Se o desenvolvedor quis aprovar, diga que é pelo botão Aprovar do cartão.' } };
        }
        if (card) {
          setPending((prev) => ({ ...prev, [card.approvalId]: { ...prev[card.approvalId]!, tool: def.name, args: data } }));
          const updated = inbox.revise(card.item.id, def.title?.(data) ?? def.summary(data), JSON.stringify(data, null, 2));
          return {
            // Not the end of the turn: the Orbi says in one sentence what changed (inside the card).
            output: { status: 'card_updated', approvalId: card.approvalId, version: updated.version, note: 'O cartão foi atualizado no lugar (versão nova). Diga em uma frase o que mudou e pare: o desenvolvedor decide no próprio cartão.' },
          };
        }
        // Counted in the run: the review weighs a change by the approvals it would save.
        if (run) brain.execution.countAsk(conversationId);
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
          ...(alone?.offer && effect !== 'apaga' ? { alwaysAlone: alone.offer } : {}),
          ...(def.why?.(data) ? { why: def.why(data) } : {}),
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
      onDenied.get(call.tool)?.(call.args as Record<string, unknown>);
      append({ kind: 'signal', type: 'tool-approval-result', body: `${approver} negou ${call.tool} (${approvalId}). Não tente de novo; pergunte como seguir.` });
      return;
    }
    try {
      const result = await executors.get(call.tool)!(call.args, approvalId, 'approved');
      if (call.runId && call.action) brain.recordRunAction(call.runId, call.action);
      append({ kind: 'signal', type: 'tool-approval-result', body: `${approver} aprovou ${call.tool} (${approvalId}). Resultado: ${result}` });
    } catch (error) {
      if (call.runId) brain.addRunDeviation(call.runId, { kind: 'falha', detail: `${call.tool} falhou: ${String(error).slice(0, 200)}`, tool: call.tool, step: call.action?.step ?? null });
      append({ kind: 'signal', type: 'tool-approval-result', body: `${call.tool} (${approvalId}) foi aprovado mas falhou: ${String(error)}` });
    }
  });

  return gated;
}
