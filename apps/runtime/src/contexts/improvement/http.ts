import { Hono } from 'hono';
import { draftIssue } from './report/src/issue.ts';
import { sendIssue } from './report/src/send.ts';
import { VERSION } from '../../version.ts';
import { startReport } from './diagnosis/src/start.ts';
import type { Agent } from '../../agents/runtime-port.ts';
import type { OrbiServices } from '../../services.ts';
import { notFound } from '../../http/errors.ts';

/**
 * What went wrong by the Orbi's own fault, or in a call the model got wrong (documento 24), kept
 * apart from the review of the procedure. `?run=` traz os de uma execução (inclusive os já
 * dispensados); sem parâmetro, os que estão abertos. Mudanças viram evento `runs`.
 */
export function diagnosisRoutes(s: Pick<OrbiServices, 'diagnoses' | 'brain' | 'config' | 'diagnosisSettings' | 'codeAgents' | 'events'>, agent: Agent) {
  const { diagnoses, brain, config } = s;
  /** O texto exato que sairia, já sem nada do trabalho do desenvolvedor. */
  const draft = (id: string) => {
    const found = diagnoses.get(id);
    const run = found && brain.run(found.runId);
    if (!found || !run) throw notFound('diagnóstico');
    return draftIssue(found, { run, calls: brain.calls.list(run.id), version: VERSION, platform: `${process.platform} ${process.arch}` });
  };
  return new Hono()
    .get('/', (c) => {
      const run = c.req.query('run');
      return c.json(run ? diagnoses.forRun(run) : diagnoses.list());
    })
    // "Ver o que vai": o texto da issue, com a lista do que foi trocado.
    .get('/:id/issue', (c) => c.json(draft(c.req.param('id'))))
    // Enviar: pelo `gh` desta máquina; sem ele, a página do GitHub já preenchida para você clicar.
    .post('/:id/issue', async (c) => c.json(await sendIssue(config.issuesRepo, draft(c.req.param('id')))))
    // Quem escreve o relatório e quando (documento 24).
    .get('/setup', (c) => c.json(s.diagnosisSettings.get()))
    .put('/setup', async (c) => c.json(s.diagnosisSettings.set(await c.req.json())))
    // O relatório de uma execução, e "Analisar esta execução".
    .get('/report', (c) => {
      const report = diagnoses.report(c.req.query('run') ?? '');
      return report ? c.json(report) : c.json(null);
    })
    .post('/report', async (c) => {
      const runId = c.req.query('run') ?? '';
      if (!brain.run(runId)) throw notFound('execução');
      await startReport(s, agent, runId, true);
      return c.json(diagnoses.report(runId) ?? { pendente: true });
    })
    .post('/:id/dismiss', (c) => {
      if (!diagnoses.dismiss(c.req.param('id'))) throw notFound('diagnóstico');
      return c.json({ ok: true });
    });
}
