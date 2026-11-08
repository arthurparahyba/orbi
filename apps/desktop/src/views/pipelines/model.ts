/**
 * Esteiras on the screen, without React: labels, the dots of a delivery, the
 * editor's draft and where each parameter can come from. Tested in
 * test/pipelines.test.ts.
 */
import type { Pipeline, PipelineRun, PipelineStage, Playbook } from '../../api';

export type PipelineDef = Pick<Pipeline, 'name' | 'description' | 'inputs' | 'stages'>;

export const RUN_LABEL: Record<PipelineRun['status'], string> = { running: 'rodando', waiting: 'esperando você', done: 'concluída', cancelled: 'encerrada' };

/** "rodando" is "parada" when it waits because something failed. */
export function runState(run: PipelineRun): { label: string; tone: 'running' | 'waiting' | 'failed' | 'done' | 'cancelled' } {
  if (run.status === 'waiting' && run.waiting?.kind === 'failure') return { label: 'parada', tone: 'failed' };
  return { label: RUN_LABEL[run.status], tone: run.status };
}

/** What the run waits for, in words. */
export function waitingLine(run: PipelineRun): string | undefined {
  const w = run.waiting;
  if (!w) return undefined;
  const stage = run.stages.find((s) => s.id === w.stage);
  if (w.kind === 'passage') return `autorizar a passagem para ${stage?.label ?? w.stage}`;
  if (w.kind === 'params') return `informar ${w.missing?.join(', ')} para ${stage?.label ?? w.stage}`;
  return w.message ?? `${stage?.label ?? w.stage} falhou`;
}

/** Stages up to the destination; the ones after it are outside this delivery. */
export function inScope(run: PipelineRun): Array<PipelineRun['stages'][number] & { outside: boolean }> {
  const stop = run.destination ? run.stages.findIndex((s) => s.id === run.destination) : run.stages.length - 1;
  return run.stages.map((s, i) => ({ ...s, outside: stop >= 0 && i > stop }));
}

/** Everything handed over so far, with the stage it came from. */
export function collectedData(run: PipelineRun): Array<{ name: string; value: string; stage: string }> {
  return run.stages.flatMap((s) => Object.entries(s.outputs).map(([name, value]) => ({ name, value, stage: s.label })));
}

/** A short readable id from a label ("Abrir GMUD" → "abrir-gmud"), unique among `taken`. */
export function stageIdFrom(label: string, taken: string[]): string {
  const base = label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'etapa';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** The {{parameters}} of a procedure (credentials are not parameters). */
export function paramsOf(pb: Pick<Playbook, 'steps' | 'instructions'> | undefined): string[] {
  if (!pb) return [];
  const text = [pb.instructions, ...pb.steps.map((s) => `${s.label} ${s.how}`)].join(' ');
  return [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g)].map((m) => m[1]))];
}

/**
 * Where a parameter of stage `index` can come from: "" (by name), the
 * esteira's inputs, what earlier stages hand over, or asking.
 */
export function sourcesFor(def: PipelineDef, index: number, playbooks: Playbook[]): Array<{ value: string; label: string }> {
  const out = [{ value: '', label: 'pelo nome' }];
  for (const i of def.inputs) out.push({ value: `entrada.${i.name}`, label: `entrada › ${i.name}` });
  def.stages.slice(0, index).forEach((s) => {
    const names = new Set(s.options.flatMap((o) => playbooks.find((p) => p.name === o.playbook)?.outputs.map((x) => x.name) ?? []));
    for (const n of names) out.push({ value: `${s.id}.${n}`, label: `${s.label} › ${n}` });
  });
  out.push({ value: 'perguntar', label: 'perguntar na hora' });
  return out;
}

/** What the screen can tell before saving (the runtime checks again, with the procedures). */
export function draftProblems(def: PipelineDef): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(def.name)) problems.push('Nome: letras minúsculas, números e -, ex.: entrega-do-portal.');
  if (def.stages.length === 0) problems.push('Adicione pelo menos uma etapa.');
  def.stages.forEach((s: PipelineStage, i) => {
    if (!s.label.trim()) problems.push(`A etapa ${i + 1} está sem nome.`);
    if (s.options.some((o) => !o.playbook)) problems.push(`Escolha o procedimento da etapa ${i + 1}.`);
    if (s.options.length > 1 && s.options.some((o) => !o.when?.field || !o.when.equals)) problems.push(`A etapa ${i + 1} tem caminhos: diga quando vale cada um.`);
  });
  return problems;
}
