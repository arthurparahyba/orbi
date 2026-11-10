import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app } from './support/flow.ts';

/** Parar (docs/funcionalidades/01): stopping the turn stops the command that is running, not only the model. */

test('parar: o comando em andamento é interrompido na hora, mesmo passando pelo portão', async () => {
  const { policy, config } = (await import('../src/services.ts')).services();
  const mark = join(config.workspace, 'marca-do-comando');
  policy.set('comandos-escrita', 'auto');
  try {
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('run_command', { binary: 'node', args: ['-e', `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(mark)}, 'x'), 4000)`], purpose: 'Esperar o deploy' }), { stopReason: 'toolUse' }),
      fauxAssistantMessage(fauxText('Parei.')),
    ]);
    const id = 'chat:parar';
    const orbi = init(Orbi, { id });
    const started = Date.now();
    const turn = orbi.dispatch('Espera o deploy terminar.');
    // Give the command time to start, then stop the turn the way the app does (POST …/abort).
    await new Promise((r) => setTimeout(r, 1500));
    const res = await app.request(`/agents/orbi/${encodeURIComponent(id)}/abort`, { method: 'POST' });
    assert.ok(res.status < 300, `abort respondeu ${res.status}`);
    await orbi.read(await turn).catch(() => undefined);
    const took = Date.now() - started;
    assert.ok(took < 4_000, `parou em ${took} ms`);
    // The command itself was killed: it never got to write its mark (it would at 4 s).
    await new Promise((r) => setTimeout(r, 4500));
    assert.equal(existsSync(mark), false, 'o comando continuou rodando depois do Parar');
  } finally {
    policy.set('comandos-escrita', 'ask');
  }
});
