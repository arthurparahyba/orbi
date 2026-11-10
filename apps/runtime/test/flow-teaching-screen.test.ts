import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, inbox, components, waitFor } from './support/flow.ts';

/**
 * The Ensinar screen from start to end (docs/funcionalidades/01 and 18): one conversation goes
 * Explicar → Ensaiar → Combinar → Aprender → Assumir → Fazendo, and at each stop the list
 * (GET /api/conversations) and the panel (GET /api/conversations/:id/notebook) say what the
 * chat shows. The model is scripted; everything else is the real runtime.
 */

const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const listed = async (id: string) => ((await (await app.request('/api/conversations')).json()) as any[]).find((c) => c.id === id);
const notebook = async (id: string) => {
  const res = await app.request(`/api/conversations/${encodeURIComponent(id)}/notebook`);
  assert.equal(res.status, 200);
  return (await res.json()) as any;
};
const ctx = (context: unknown) => JSON.stringify(context).replace(/\\"/g, '"');

const learn = (testedRun: string) => ({
  reason: 'Arthur ensinou a subir versão de MFE no portal',
  items: [
    { kind: 'type', payload: { name: 'MicroFrontend', description: 'Front publicado por um portal', knows: { achar: 'buscar pelo nome na lista de aplicações' } } },
    { kind: 'entity', payload: { id: 'checkout-mfe', type: 'MicroFrontend', aliases: ['checkout'] } },
    {
      kind: 'playbook',
      payload: {
        name: 'atualizar-mfe', description: 'Sobe a versão de um MicroFrontend no portal', trigger: 'pedido para subir versão de um MFE',
        intent: 'Publicar uma Versao de um MicroFrontend em um Ambiente', instructions: '', testedRun,
        inputs: [{ name: 'mfe', concept: 'MicroFrontend' }, { name: 'versao' }, { name: 'ambiente' }],
        steps: [
          { id: 'abrir', label: 'Abrir o portal de {{mfe}}', how: 'navegador no portal' },
          { id: 'criar', label: 'Criar o release {{versao}} em {{ambiente}}', how: 'Releases › Criar release' },
        ],
      },
    },
  ],
});

test('tela Ensinar: um procedimento do começo ao fim, com a lista, as etapas e o painel acompanhando o chat', async () => {
  const created = await app.request('/api/conversations', json({}));
  assert.equal(created.status, 201);
  const { id } = (await created.json()) as { id: string };
  const orbi = init(Orbi, { id });

  // 1 · Explicar: nothing tried yet.
  assert.deepEqual((await listed(id)).state, { mode: 'ensinando', stage: 'explicar' });
  assert.deepEqual((await notebook(id)).steps, []);

  // 2 · Ensaiar: it tries along and stops at what it did not find, asking.
  let runId = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('rehearsal_start', { goal: 'subir versão de um MFE no portal' }), { stopReason: 'toolUse' }),
    (context) => {
      runId = /"runId":"([^"]+)"/.exec(ctx(context))?.[1] ?? '';
      return fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Abrir o portal', status: 'done', note: 'login pelo cofre' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Achar onde cria a versão', status: 'waiting', note: 'Nova versão não existe; Releases ou Promover?' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Não achei "Nova versão". É Releases › Criar release ou Promover?')),
  ]);
  const r1 = await orbi.read(await orbi.dispatch('Pra subir versão do checkout-mfe: entra no portal, clica em nova versão e coloca a 2.14.0 em homologação.'));
  assert.ok(runId, 'o ensaio começou');
  assert.match(String(r1.text ?? JSON.stringify(r1)), /Releases/, 'o chat termina perguntando');
  assert.deepEqual((await listed(id)).state, { mode: 'ensinando', stage: 'ensaiar' });
  let nb = await notebook(id);
  assert.equal(nb.intent, 'subir versão de um MFE no portal');
  assert.deepEqual(nb.steps.map((s: any) => [s.label, s.status]), [['Abrir o portal', 'done'], ['Achar onde cria a versão', 'waiting']]);
  assert.equal(nb.agreement, undefined);

  // 3 · Combinar: every step tried, the agreement not made yet.
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Achar onde cria a versão', status: 'done', note: 'Releases › Criar release' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Conferir que ficou verde', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Deu certo: o release 2.14.0 ficou verde. Vamos combinar onde isso começa e termina?')),
  ]);
  await orbi.read(await orbi.dispatch('É Releases › Criar release.'));
  assert.deepEqual((await listed(id)).state, { mode: 'ensinando', stage: 'combinar' });
  nb = await notebook(id);
  assert.ok(nb.steps.every((s: any) => s.status === 'done'));

  // 4 · Aprender: the agreement is asked in the chat (a card), then the learning card.
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('rehearsal_finish', {
      start: 'alguém pede para subir a versão de um MFE', receives: ['mfe', 'versao', 'ambiente'], end: 'o release fica verde', outside: ['abrir GMUD'],
      corrections: [{ explained: 'Nova versão', actual: 'Releases › Criar release' }],
    }), { stopReason: 'toolUse' }),
  ]);
  const r3 = await orbi.read(await orbi.dispatch('Começa quando alguém pede para subir versão; termina com o release verde. GMUD fica de fora.'));
  const agreement = components(r3).find((p: any) => p.component === 'agreement') as any;
  assert.ok(agreement, 'o chat mostra o acordo para confirmar');
  assert.deepEqual((await listed(id)).state, { mode: 'ensinando', stage: 'aprender' });
  nb = await notebook(id);
  assert.equal(nb.agreement.end, 'o release fica verde');
  assert.deepEqual(nb.agreement.outside, ['abrir GMUD']);
  assert.deepEqual(nb.receives, ['mfe', 'versao', 'ambiente']);

  faux.setResponses([fauxAssistantMessage(fauxToolCall('brain_learn', learn(runId) as never), { stopReason: 'toolUse' })]);
  const answered = await app.request(`/api/inbox/${agreement.inboxId}/answer`, json({ text: 'Está certo' }));
  assert.equal(answered.status, 202);
  const r4 = await orbi.read(await answered.json());
  assert.ok(components(r4).find((p: any) => p.component === 'approval'), 'o chat mostra o cartão de aprendizado');
  const card = inbox.list({ status: 'open' }).find((i) => i.kind === 'learning' && i.conversationId === id);
  assert.ok(card, 'e ele está nas Pendências');
  assert.deepEqual((await listed(id)).state, { mode: 'ensinando', stage: 'aprender' });

  // 5 · Assumir: approved, it is a procedure; the panel shows it, the agreement and the way up.
  faux.setResponses([fauxAssistantMessage(fauxText('Guardado: agora sei subir versão de MFE. Peça quando quiser.'))]);
  await orbi.read(await (await app.request(`/api/inbox/${card!.id}/decision`, json({ decision: 'approve', approver: 'Arthur' }))).json());
  assert.deepEqual((await listed(id)).state, { mode: 'aprendido', stage: 'assumir', playbook: 'atualizar-mfe', level: 1 });
  nb = await notebook(id);
  assert.equal(nb.procedure.name, 'atualizar-mfe');
  assert.deepEqual(nb.procedure.nextLevel, { level: 2, cleanRunsLeft: 1 });
  assert.deepEqual(nb.receives, ['mfe (MicroFrontend)', 'versao', 'ambiente']);
  assert.deepEqual(nb.steps.map((s: any) => s.status), ['planned', 'planned']);
  assert.equal(nb.agreement.end, 'o release fica verde', 'o acordo continua à vista');
  assert.deepEqual(nb.noted.map((x: any) => x.id), ['checkout-mfe'], 'o fato aprovado aqui aparece em "Já anotei"');

  // 6 · Fazendo: asked to do it, the run is the newest thing; the panel follows the run.
  let review = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'atualizar-mfe', params: { mfe: 'checkout', versao: '2.15.0', ambiente: 'homologação' } }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'abrir', status: 'done', note: 'portal aberto' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'criar', status: 'done', note: 'release verde' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Feito: checkout-mfe 2.15.0 em homologação, release verde.')),
    (context) => { review = ctx(context); return fauxAssistantMessage(fauxText('Ok.')); },
  ]);
  await orbi.read(await orbi.dispatch('Sobe a 2.15 do checkout em homologação.'));
  const state = (await listed(id)).state;
  assert.equal(state.mode, 'fazendo');
  assert.equal(state.playbook, 'atualizar-mfe');
  assert.equal(state.status, 'done');
  nb = await notebook(id);
  assert.deepEqual(nb.steps.map((s: any) => [s.label, s.status]), [['Abrir o portal de checkout-mfe', 'done'], ['Criar o release 2.15.0 em homologação', 'done']]);
  assert.ok(nb.readiness.some((r: any) => r.label.startsWith('mfe') && r.known), 'o painel diz o que ele sabia ao rodar');

  await waitFor(() => review.includes('review'), 'a revisão do fim da execução');
  // The review settled the level (N1 → N2 after a clean run): the list follows.
  await waitFor(() => brain.playbook('atualizar-mfe')?.level === 2, 'subir para N2 depois de uma execução limpa');
  assert.equal((await notebook(id)).procedure.level, 2);
});

test('tela Ensinar: conversa que não existe não tem painel', async () => {
  const res = await app.request('/api/conversations/chat%3Anao-existe/notebook');
  assert.equal(res.status, 404);
});
