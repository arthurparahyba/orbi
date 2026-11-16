/**
 * What a running procedure read (the output of commands, pages, an investigation), kept in memory
 * until the end-of-run review, so the knowledge reviewer can find facts in it (the database a
 * task definition names). Never written to disk nor to the logs; cleaned of credentials before
 * it goes to a model (review/knowledge.ts). Lost on restart, which only skips one review.
 */
export interface Observation {
  step: string | null;
  tool: string;
  text: string;
}

const MAX_PER_RUN = 40;
const MAX_TEXT = 4000;
/** Tools that read the world; bookkeeping (steps, cards, the brain itself) is not an observation. */
const READS = /^(run_command|run_shell|run_script|run_python|browser_read|browser_act|mcp__chrome__|task$)/;

export class RunObservations {
  private readonly byRun = new Map<string, Observation[]>();

  static reads(tool: string): boolean {
    return READS.test(tool);
  }

  add(runId: string, o: Observation): void {
    const list = this.byRun.get(runId) ?? [];
    if (list.length >= MAX_PER_RUN) list.shift();
    list.push({ ...o, text: o.text.slice(0, MAX_TEXT) });
    this.byRun.set(runId, list);
  }

  /** Hands the run's observations over once (the review), and forgets them. */
  take(runId: string): Observation[] {
    const list = this.byRun.get(runId) ?? [];
    this.byRun.delete(runId);
    return list;
  }
}
