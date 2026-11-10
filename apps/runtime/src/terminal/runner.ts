import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RunResult } from './exec.ts';
import type { BrainStore } from '../brain/store.ts';
import { errorTail } from '../brain/domain/knowledge.ts';

/**
 * The one path every tool that runs something takes (run_command, run_script, run_shell…):
 * run, record the attempt in the procedure's trail, look up known problems when it fails, save
 * the whole output to a file when asked, and shape what the model reads. A new tool that runs
 * a program says only how to start it.
 */
export interface RunSpec {
  /** Where the attempt is recorded and known problems are looked up. */
  brain: Pick<BrainStore, 'knownProblems' | 'noteCommand' | 'openRunIn'>;
  conversationId: string;
  /** The command as the conversation shows it. */
  shown: string;
  /** Absolute path to write the whole output to, instead of returning it. */
  saveTo?: string;
  /** Starts the program; `maxOutput` is raised when the output goes to a file. */
  start(opts: { maxOutput?: number }): Promise<RunResult>;
}

export async function runAndReport(spec: RunSpec): Promise<{ result: RunResult; report: string; extra: Record<string, unknown> }> {
  const result = await spec.start(spec.saveTo ? { maxOutput: 50_000_000 } : {});
  const extra = afterCommand(spec.brain, spec.conversationId, spec.shown, result);
  if (!spec.saveTo) return { result, extra, report: JSON.stringify({ ...result, command: spec.shown, ...extra }) };
  const ok = result.exitCode === 0 && !result.timedOut;
  if (ok) {
    mkdirSync(dirname(spec.saveTo), { recursive: true });
    writeFileSync(spec.saveTo, result.stdout);
  }
  const lines = result.stdout.split('\n').filter((l) => l.length > 0);
  return {
    result,
    extra,
    report: JSON.stringify({
      command: spec.shown,
      exitCode: result.exitCode,
      savedTo: ok ? spec.saveTo : null,
      lines: lines.length,
      bytes: Buffer.byteLength(result.stdout),
      head: lines.slice(0, 5),
      stderr: result.stderr.slice(0, 2000),
      timedOut: result.timedOut,
      ...extra,
    }),
  };
}

/**
 * After a command ran inside a procedure: the attempt goes to the run's trail (what fails and
 * later passes becomes knowledge), and a failure brings the known problems it looks like, so
 * the Orbi knows what to do without remembering to look (domain/knowledge.ts).
 */
export function afterCommand(brain: Pick<BrainStore, 'knownProblems' | 'noteCommand' | 'openRunIn'>, conversationId: string, command: string, result: { exitCode: number | null; stdout: string; stderr: string; timedOut?: boolean }) {
  const failed = result.exitCode !== 0 || !!result.timedOut;
  const error = failed ? errorTail(result) : '';
  const known = failed ? brain.knownProblems(`${command}\n${error}`) : [];
  brain.noteCommand(conversationId, { command, exitCode: result.timedOut ? null : result.exitCode, error, known: known.length > 0 });
  // Inside a procedure, an error the brain has never seen is outside what the Orbi knows: it says so
  // and brings the developer in, instead of improvising a fix (docs/funcionalidades/18, "sei / não sei").
  if (failed && !known.length && brain.openRunIn(conversationId)?.kind !== 'rehearsal' && brain.openRunIn(conversationId)) {
    return { nuncaVi: true, hint: 'Nenhum problema conhecido parecido no cérebro: siga "Erro que nunca vi" (fora do que você conhece).' };
  }
  if (!known.length) return {};
  return {
    knownProblems: known.map((p) => ({ id: p.id, sintoma: p.sintoma, ...(p.causa ? { causa: p.causa } : {}), solucao: p.solucao, ...(p.onde ? { onde: p.onde } : {}), ...(p.quemCorrige ? { quemCorrige: p.quemCorrige } : {}), ...(p.conferir ? { conferir: p.conferir } : {}) })),
    hint: 'Problema conhecido no cérebro: siga a solução dele antes de investigar do zero.',
  };
}

