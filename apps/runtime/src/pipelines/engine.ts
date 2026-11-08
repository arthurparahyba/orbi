import type { BrainStore, PlaybookRun } from '../brain/store.ts';
import { chooseOption, inputProblems, passageNeedsDeveloper, resolveParams, withDefaults, type Pipeline, type PipelineData } from '../brain/domain/pipelines.ts';
import { playbookParams } from '../brain/domain/playbooks.ts';
import type { Inbox } from '../conversations/inbox.ts';
import type { PipelineRun, PipelineRunStage, PipelineRuns } from './runs.ts';

/**
 * Runs esteiras. The agent runs each stage's procedure as usual; this engine
 * decides, without the model, what comes next: which branch, with which data,
 * and whether the developer has to say "go on". What it returns is the text to
 * hand the agent (in a tool's output, or as a signal) — or nothing, when it
 * waits for the developer.
 */
export interface EngineDeps {
  brain: BrainStore;
  runs: PipelineRuns;
  inbox: Inbox;
}

export type Decision = 'continue' | 'retry' | 'skip' | 'stop';

export class PipelineEngine {
  constructor(private readonly d: EngineDeps) {}

  /** Starts an esteira in a conversation. Throws (with what is wrong) before creating anything. */
  start(
    name: string,
    inputs: Record<string, string>,
    opts: { conversationId: string; destination?: string | null; requestedBy?: string; skipQuestions?: boolean },
  ): { run: PipelineRun; instruction: string } {
    const p = this.pipeline(name);
    inputs = withDefaults(p, inputs);
    const problems = inputProblems(p, inputs);
    if (opts.destination && !p.stages.some((s) => s.id === opts.destination)) problems.push(`destino não é uma etapa: ${opts.destination} (etapas: ${p.stages.map((s) => s.id).join(', ')})`);
    if (problems.length) throw new Error(problems.join('; '));
    const active = this.d.runs.inConversation(opts.conversationId);
    if (active && (active.status === 'running' || active.status === 'waiting')) throw new Error('esta conversa já tem uma esteira em andamento');
    const run = this.d.runs.create({
      pipeline: p.name,
      conversationId: opts.conversationId,
      status: 'running',
      destination: opts.destination ?? null,
      inputs: Object.fromEntries(p.inputs.map((i) => [i.name, inputs[i.name]])),
      stages: p.stages.map((s) => ({ id: s.id, label: s.label, playbook: null, runId: null, status: 'pending', params: {}, from: {}, outputs: {}, startedAt: null, finishedAt: null })),
      current: 0,
      requestedBy: opts.requestedBy ?? 'user',
      skipQuestions: opts.skipQuestions ?? false,
      waiting: null,
    });
    this.d.brain.countPipelineUse(p.name);
    const entered = this.enter(run, 0, {});
    return { run: entered.run, instruction: `${intro(p, entered.run)}\n${entered.instruction}` };
  }

  /** The agent started a procedure: if it is the stage the esteira waits for, link them. */
  runStarted(pbRun: PlaybookRun): void {
    const run = this.d.runs.inConversation(pbRun.conversationId);
    if (!run || run.status !== 'running') return;
    const stage = run.stages[run.current];
    if (stage.status !== 'running' || stage.runId || stage.playbook !== pbRun.playbook) return;
    stage.runId = pbRun.id;
    this.d.runs.save(run);
  }

  /** A procedure finished: record what it handed over and decide the next step. */
  runFinished(pbRun: PlaybookRun): string | null {
    const run = this.d.runs.byPlaybookRun(pbRun.id);
    if (!run || run.status !== 'running') return null;
    const p = this.pipeline(run.pipeline);
    const i = run.stages.findIndex((s) => s.runId === pbRun.id);
    const stage = run.stages[i];
    stage.finishedAt = new Date().toISOString();
    if (pbRun.status === 'failed') {
      stage.status = 'failed';
      return this.wait(run, { kind: 'failure', stage: stage.id, message: `A etapa ${stage.label} (${stage.playbook}) falhou.` },
        `Etapa ${stage.label} falhou`, 'Tentar de novo, pular ou encerrar a entrega.',
        `A etapa ${stage.label} falhou. A esteira parou: o desenvolvedor decide na tela (tentar de novo, pular ou encerrar). Explique em poucas linhas o que deu errado e pare.`);
    }
    stage.status = 'done';
    stage.outputs = { ...pbRun.outputs };
    return this.after(run, p, i);
  }

  /** The developer decided on a passage, a failure or (with values) the missing data. */
  decide(runId: string, decision: Decision, values: Record<string, string> = {}): string | null {
    const run = this.d.runs.get(runId);
    if (!run) throw new Error('entrega não encontrada');
    if (run.status !== 'waiting' || !run.waiting) throw new Error('esta entrega não está esperando uma decisão');
    const p = this.pipeline(run.pipeline);
    const waiting = run.waiting;
    if (waiting.inboxId) this.d.inbox.resolve(waiting.inboxId, decision === 'stop' ? 'denied' : 'approved');
    run.waiting = null;
    run.status = 'running';
    const i = run.stages.findIndex((s) => s.id === waiting.stage);
    if (decision === 'stop') {
      if (waiting.kind === 'passage') this.notePassage(run, waiting.stage, false);
      run.status = 'cancelled';
      this.d.runs.save(run);
      return `O desenvolvedor encerrou a entrega na etapa ${run.stages[i].label}. Confirme em uma linha e pare.${agentNote(run, 'failed')}`;
    }
    if (waiting.kind === 'passage') {
      this.notePassage(run, waiting.stage, true);
      return this.enter(run, i, values).instruction;
    }
    if (waiting.kind === 'params') return this.enter(run, i, values).instruction;
    // failure
    if (decision === 'skip') {
      run.stages[i].status = 'skipped';
      return this.after(run, p, i);
    }
    return this.enter(run, i, values).instruction;
  }

  /** "Manter perguntando" on the note of a passage that became automatic (subject `esteira/etapa`). */
  keepAsking(subject: string, conversationId: string | null): void {
    const cut = subject.lastIndexOf('/');
    this.d.brain.keepPassageAsking(subject.slice(0, cut), subject.slice(cut + 1), conversationId);
  }

  // ── internals ──────────────────────────────────────────────────────────

  /** Counts the developer's decision; after enough "go on", the passage becomes automatic (with a note). */
  private notePassage(run: PipelineRun, stageId: string, continued: boolean): void {
    const change = this.d.brain.notePassage(run.pipeline, stageId, continued, run.conversationId);
    if (!change) return;
    const label = run.stages.find((s) => s.id === stageId)?.label ?? stageId;
    this.d.inbox.add({
      kind: 'level',
      conversationId: run.conversationId,
      title: `${run.pipeline}: a passagem para ${label} agora segue sozinha`,
      detail: change.reason,
      routine: `passage:${run.pipeline}/${stageId}`,
      approvalId: 'ask',
    });
  }

  private pipeline(name: string): Pipeline {
    const p = this.d.brain.pipeline(name);
    if (!p) throw new Error(`esteira não existe: ${name}`);
    return p;
  }

  /** After stage i (done or skipped): finish, wait at the passage, or go into the next. */
  private after(run: PipelineRun, p: Pipeline, i: number): string | null {
    const stage = run.stages[i];
    const last = i === run.stages.length - 1 || run.destination === stage.id;
    if (last) {
      run.status = 'done';
      run.current = i;
      this.d.runs.save(run);
      const reached = run.destination === stage.id && i < run.stages.length - 1 ? `chegou ao destino (${stage.label})` : 'chegou ao fim';
      return `A esteira ${p.name} ${reached}. Resuma para o desenvolvedor o que foi entregue: ${describe(collected(run))}.${agentNote(run, 'done')}`;
    }
    const next = p.stages[i + 1];
    if (passageNeedsDeveloper(next, run)) {
      run.current = i + 1;
      return this.wait(run, { kind: 'passage', stage: next.id, message: `Seguir para ${next.label}?` },
        `Seguir para ${next.label}?`, `${stage.label} terminou. A passagem para ${next.label} pede a sua autorização.`,
        `${stage.label} terminou. Passar para ${next.label} precisa da autorização do desenvolvedor: avise em uma linha e pare. Ele decide na tela.`);
    }
    return this.enter(run, i + 1, {}).instruction;
  }

  /** Go into stage i: pick the branch, gather its data, and tell the agent to run it. */
  private enter(run: PipelineRun, i: number, given: Record<string, string>): { run: PipelineRun; instruction: string } {
    const p = this.pipeline(run.pipeline);
    const def = p.stages[i];
    const stage = run.stages[i];
    run.current = i;
    const data = collected(run);
    let option;
    try {
      option = chooseOption(def, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const instruction = this.wait(run, { kind: 'failure', stage: def.id, message }, `Etapa ${def.label} sem caminho`, message,
        `A esteira parou antes de ${def.label}: ${message}. Avise o desenvolvedor e pare.`);
      return { run: this.d.runs.get(run.id)!, instruction: instruction ?? '' };
    }
    const pb = this.d.brain.playbook(option.playbook);
    if (!pb) throw new Error(`procedimento não existe: ${option.playbook}`);
    const resolved = resolveParams(option, playbookParams(pb), data);
    const params = { ...stage.params, ...resolved.params, ...given };
    const missing = resolved.missing.filter((m) => !(m in params));
    stage.playbook = pb.name;
    stage.params = params;
    stage.from = { ...resolved.from, ...Object.fromEntries(Object.keys(given).map((k) => [k, 'desenvolvedor'])) };
    if (missing.length) {
      const instruction = this.wait(run, { kind: 'params', stage: def.id, missing }, `Faltam dados para ${def.label}`, `Informe: ${missing.join(', ')}.`,
        `Para a etapa ${def.label} (${pb.name}) faltam: ${missing.join(', ')}. Pergunte ao desenvolvedor em uma mensagem curta e pare; a tela já mostra o pedido.`);
      return { run: this.d.runs.get(run.id)!, instruction: instruction ?? '' };
    }
    stage.status = 'running';
    stage.runId = null;
    stage.startedAt = new Date().toISOString();
    stage.finishedAt = null;
    stage.outputs = {};
    run.status = 'running';
    run.waiting = null;
    const saved = this.d.runs.save(run);
    const origin = Object.entries(stage.from).map(([k, v]) => `${k} ← ${v}`).join(', ');
    return {
      run: saved,
      instruction:
        `Esteira ${p.name}, etapa ${i + 1} de ${p.stages.length} (${def.label}): rode agora o procedimento ${pb.name} com playbook_start ` +
        `${JSON.stringify({ name: pb.name, params })}.${origin ? ` Os dados vieram de: ${origin}.` : ''}` +
        (pb.outputs.length ? ` Ao terminar, registre ${pb.outputs.map((o) => o.name).join(', ')} com outputs no playbook_step.` : ''),
    };
  }

  /** Stop and wait for the developer: an item in Pendências, the state on the run, a line for the agent. */
  private wait(run: PipelineRun, waiting: NonNullable<PipelineRun['waiting']>, title: string, detail: string, instruction: string): string {
    const item = this.d.inbox.add({ kind: 'pipeline', conversationId: run.conversationId, title, detail });
    run.status = 'waiting';
    run.waiting = { ...waiting, inboxId: item.id };
    this.d.runs.save(run);
    return instruction;
  }
}

/** Inputs plus what each finished stage handed over. */
export function collected(run: PipelineRun): PipelineData {
  return { inputs: run.inputs, stages: Object.fromEntries(run.stages.filter((s) => s.status === 'done').map((s) => [s.id, s.outputs])) };
}

function describe(data: PipelineData): string {
  const values = Object.values(data.stages).flatMap((o) => Object.entries(o).map(([k, v]) => `${k}=${v}`));
  return values.length ? values.join(', ') : 'nenhum dado registrado';
}

function intro(p: Pipeline, run: PipelineRun): string {
  const to = run.destination ? `até ${p.stages.find((s) => s.id === run.destination)?.label}` : 'até o fim';
  const who = run.requestedBy === 'user' ? '' : ` (pedida por ${run.requestedBy.replace(/^agent:/, '')})`;
  return `Começou a esteira ${p.name}${who}, ${to}: ${p.stages.map((s) => s.label).join(' → ')}.`;
}

function agentNote(run: PipelineRun, status: 'done' | 'failed'): string {
  return run.requestedBy.startsWith('agent:') ? ` Depois, responda ao agente com agent_reply (${status}) e os dados entregues.` : '';
}

/** The data as stage-labelled pairs, for the screen and the MCP status. */
export function stageSummary(stage: PipelineRunStage): string {
  return `${stage.label}: ${stage.status}`;
}
