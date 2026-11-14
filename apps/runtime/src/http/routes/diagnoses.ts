import { Hono } from 'hono';
import { draftIssue } from '../../diagnosis/issue.ts';
import { sendIssue } from '../../diagnosis/send.ts';
import { VERSION } from '../../version.ts';
import type { OrbiServices } from '../../services.ts';
import { notFound } from '../errors.ts';

/**
 * What went wrong by the Orbi's own fault, or in a call the model got wrong (documento 24), kept
 * apart from the review of the procedure. `?run=` traz os de uma execução (inclusive os já
 * dispensados); sem parâmetro, os que estão abertos. Mudanças viram evento `runs`.
 */
export function diagnosisRoutes({ diagnoses, brain, config }: Pick<OrbiServices, 'diagnoses' | 'brain' | 'config'>) {
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
    .post('/:id/dismiss', (c) => {
      if (!diagnoses.dismiss(c.req.param('id'))) throw notFound('diagnóstico');
      return c.json({ ok: true });
    });
}
