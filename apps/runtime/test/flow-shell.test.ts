import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, inbox } from './support/flow.ts';

test('Git Bash não encontrado: o cartão pergunta o caminho, confere, salva no .env e passa a valer', async () => {
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { services } = await import('../src/services.ts');
  const config = services().config;
  const before = { shell: config.shell, cwd: config.cwd };
  const dir = mkdtempSync(`${tmpdir()}/orbi-shell-`);
  config.shell = null;
  (config as { cwd: string }).cwd = dir;
  try {
    let refused = '';
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('run_shell', { line: 'ls | wc -l', purpose: 'Contar arquivos' }), { stopReason: 'toolUse' }),
      (context) => { refused = JSON.stringify(context); return fauxAssistantMessage(fauxText('Esperando o caminho do Git Bash.')); },
    ]);
    const orbi = init(Orbi, { id: 'chat:teste-shell' });
    await orbi.read(await orbi.dispatch('conta os arquivos'));
    assert.match(refused, /precisa do Git Bash, que não foi encontrado/);
    const item = inbox.list({ status: 'open' }).find((i) => i.conversationId === 'chat:teste-shell' && i.routine === 'config:shell')!;
    assert.ok(item, 'o cartão perguntando o caminho está em Pendências');

    const answer = (text: string) => app.request(`/api/inbox/${item.id}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const wrong = await answer(`${dir}/nao-existe/bash.exe`);
    assert.equal(wrong.status, 400);
    assert.match((await wrong.json()).error.message, /não achei/);
    assert.equal(inbox.get(item.id)!.status, 'open', 'caminho errado: o cartão continua aberto');

    const bash = `${dir}/bash`;
    writeFileSync(bash, '');
    faux.setResponses([fauxAssistantMessage(fauxText('Configurado, rodando de novo.'))]);
    const ok = await answer(bash);
    assert.equal(ok.status, 202);
    await orbi.read(await ok.json());
    assert.equal(config.shell, bash, 'passa a valer sem reiniciar');
    assert.match(readFileSync(`${dir}/.env`, 'utf8'), new RegExp(`ORBI_SHELL='${bash}'`));
    assert.equal(inbox.get(item.id)!.status, 'answered');
  } finally {
    config.shell = before.shell;
    (config as { cwd: string }).cwd = before.cwd;
  }
});
