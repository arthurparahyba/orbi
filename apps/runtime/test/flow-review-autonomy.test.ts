import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, brain, inbox, waitFor } from './support/flow.ts';

/**
 * The end-of-run review, autonomy before perfection (docs/funcionalidades/19): a procedure that
 * runs into the same known problem every time gets past it, still goes up a level, and the second
 * time the developer is asked to fix the environment at the root; what the run read becomes facts
 * proposed on a learning card, never a credential.
 */

const ctx = (context: unknown) => JSON.stringify(context).replace(/\\"/g, '"');
/** The last message that matters (the MCP availability notice the runtime appends is skipped). */
const lastText = (context: any) => {
  const msgs = (context.messages ?? []).filter((m: any) => !JSON.stringify(m.content ?? '').includes('resource=\\"mcp\\"'));
  const last = msgs.at(-1);
  return { role: String(last?.role ?? ''), text: JSON.stringify(last?.content ?? '') };
};

const { services } = await import('../src/services.ts');
let revisorSaw = '';
const reviews: string[] = [];
let knowledgeSaw = '';

/** Answers the turns that run on their own after the run (review, knowledge reviewer, facts), in whatever order they come. */
const router = (context: any) => {
  const all = ctx(context);
  const last = lastText(context);
  if (all.includes('revisor de conhecimento do Orbi')) {
    if (last.role === 'toolResult') return fauxAssistantMessage(fauxText('pronto'));
    revisorSaw = all;
    return fauxAssistantMessage(fauxToolCall('propose_facts', {
      facts: [
        { kind: 'entity', id: 'app-x-db', type: 'BancoDeDados', props: { endereco: 'app-x.cluster.rds.amazonaws.com' }, why: 'DB_HOST na task definition do app-x' },
        { kind: 'edge', from: 'app-x', rel: 'usaBanco', to: 'app-x-db', why: 'a task definition do app-x aponta para ele' },
        { kind: 'entity', id: 'senha-db', type: 'BancoDeDados', props: { senha: 'hunter2' }, why: 'não deveria' },
      ],
    }), { stopReason: 'toolUse' });
  }
  if (last.role === 'toolResult') return fauxAssistantMessage(fauxText('Ok.'));
  if (last.text.includes('Revisão de conhecimento da execução')) {
    knowledgeSaw = all;
    return fauxAssistantMessage(fauxToolCall('brain_learn', {
      reason: 'fatos lidos na validação do ambiente',
      items: [
        { kind: 'entity', payload: { id: 'app-x-db', type: 'BancoDeDados', props: { endereco: 'app-x.cluster.rds.amazonaws.com' } } },
        { kind: 'edge', payload: { from: 'app-x', rel: 'usaBanco', to: 'app-x-db' } },
      ],
    } as never), { stopReason: 'toolUse' });
  }
  if (last.text.includes('Revisão da execução')) reviews.push(all);
  return fauxAssistantMessage(fauxText('Ok.'));
};

function setup() {
  brain.upsertType({ name: 'Problema', description: 'Problema conhecido', relations: {}, requires: [] });
  brain.upsertType({ name: 'BancoDeDados', description: 'Banco de dados de uma aplicação', relations: {}, requires: [], props: { endereco: 'host do banco' } });
  brain.upsertType({ name: 'Aplicacao', description: 'Aplicação no ECS', relations: { usaBanco: 'BancoDeDados' }, requires: [] });
  brain.upsertEntity({ id: 'app-x', type: 'Aplicacao', props: {}, body: '' });
  brain.upsertEntity({ id: 'cert-rds', type: 'Problema', props: { sintoma: 'SSL certificate verify failed', solucao: 'usar o bundle rds-ca-2019 no --ssl-ca', causa: 'o Python do ambiente não tem o bundle da AWS' }, body: '' });
  brain.savePlaybook({
    name: 'validar-ambiente', description: 'Valida tasks do ECS e o banco da aplicação', trigger: 'validar ambiente', appliesTo: null, autonomy: 'ask',
    instructions: '', learnedFrom: null, variationOf: null,
    steps: [{ id: 'tasks', label: 'Ver as tasks', how: 'aws ecs' }, { id: 'banco', label: 'Ver o banco', how: 'conectar no banco da task definition' }],
  });
}

/** One run: the known certificate error, then the read that works (with a password in the output), then the steps. */
function runScript(mark: string) {
  // Read-only commands (they run alone even at N1): the first fails with the certificate error the
  // brain knows, the second reads the task definition, a password included.
  const { config } = services();
  writeFileSync(join(config.workspace, 'taskdef.json'), JSON.stringify({ environment: { DB_HOST: 'app-x.cluster.rds.amazonaws.com', DB_PASSWORD: 'hunter2', run: mark } }));
  return [
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'validar-ambiente' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'tasks', status: 'done', note: '2 tasks RUNNING' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'cat', args: ['SSL-certificate-verify-failed'], purpose: 'Conectar no banco' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'cat', args: ['taskdef.json'], purpose: 'Ler a task definition' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'banco', status: 'done', note: 'banco responde com o bundle rds-ca' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Ambiente válido.')),
    ...Array.from({ length: 10 }, () => router),
  ];
}

test('revisão: problema conhecido contornado não segura o nível; repetido, vira "corrigir o ambiente"; o que leu vira fatos sem credencial', async () => {
  services().config.knowledgeReview = true;
  {
    setup();

    // 1st run: the known problem shows up and is got past; the run counts, the level goes up.
    faux.setResponses(runScript('primeira'));
    const one = init(Orbi, { id: 'chat:validar-1' });
    await one.read(await one.dispatch('Valida o ambiente do app-x em develop.'));
    const run1 = brain.lastRunIn('chat:validar-1')!;
    await waitFor(() => brain.playbook('validar-ambiente')!.level === 2, 'subir para N2 mesmo com o certificado', 8000);
    assert.equal(brain.run(run1.id)!.deviations.find((d) => d.kind === 'comando')?.problem, 'cert-rds', 'o desvio guarda qual problema conhecido foi');
    assert.equal(brain.review.notes({ playbook: 'validar-ambiente', kind: 'environment' }).length, 0, 'uma vez só: ainda não pergunta');

    // The knowledge reviewer read the outputs (cleaned) and proposed facts; the credential was refused.
    await waitFor(() => knowledgeSaw !== '', 'os fatos chegarem à conversa', 8000);
    assert.match(revisorSaw, /app-x\.cluster\.rds\.amazonaws\.com/);
    assert.doesNotMatch(revisorSaw.split('propose_facts')[0], /hunter2/, 'a senha da saída não chega ao revisor');
    assert.match(knowledgeSaw, /app-x-db \(BancoDeDados\)/);
    assert.doesNotMatch(knowledgeSaw.split('Revisão de conhecimento')[1] ?? '', /senha-db/, 'o fato com senha foi recusado');
    await waitFor(() => inbox.list({ status: 'open' }).some((i) => i.kind === 'learning' && i.conversationId === 'chat:validar-1'), 'o cartão de aprendizado dos fatos', 8000);

    // 2nd run: the same problem again: the developer is asked to fix it at the root, once.
    faux.setResponses(runScript('segunda'));
    const two = init(Orbi, { id: 'chat:validar-2' });
    await two.read(await two.dispatch('Valida o ambiente do app-x de novo.'));
    await waitFor(() => brain.review.notes({ playbook: 'validar-ambiente', kind: 'environment' }).length === 1, 'perguntar para corrigir o ambiente', 8000);
    const [env] = brain.review.notes({ playbook: 'validar-ambiente', kind: 'environment' });
    assert.equal(env.subject, 'cert-rds');
    assert.equal(env.status, 'open');
    await waitFor(() => reviews.some((r) => /voltou em 2 execuções seguidas/.test(r)), 'o Orbi recebe o pedido de explicar a correção de vez', 8000);
    const review = reviews.find((r) => /voltou em 2 execuções seguidas/.test(r))!;
    assert.match(review, /Ainda não há correção de vez \(raiz\) guardada/);
    assert.doesNotMatch(review, /mudar validar-ambiente/, 'a execução chegou ao fim: nada de mudar o procedimento');
    assert.equal(brain.playbook('validar-ambiente')!.level, 2, 'continua em N2');
  }
});
