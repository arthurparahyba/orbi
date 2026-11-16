import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, knowledge, procedures, trust } from './support/flow.ts';

/**
 * A receita de atualização em uso (documento 28, fase D): o caso que paga a complexidade dela.
 * Um passo foi buscar algo com um dado do cérebro e não achou. Em vez de a falha ser o fim, o
 * Orbi ouve quais fatos daquela execução sabem se conferir na fonte, e com qual procedimento.
 */
test('passo que falha ouve o que pode reconferir, e só quem tem receita aparece', async () => {
  const id = 'chat:reconferir';

  knowledge.upsertType({ name: 'Cluster', description: 'um cluster de contêineres', relations: {}, requires: [], refresh: 'atualizar-cluster' });
  knowledge.upsertType({ name: 'Servico', description: 'um serviço que roda num cluster', relations: {}, requires: [] });
  knowledge.upsertEntity({ id: 'cluster-pagamentos', type: 'Cluster', props: { arn: 'arn:antigo' }, body: '' });
  knowledge.upsertEntity({ id: 'servico-cobranca', type: 'Servico', props: {}, body: '' });

  procedures.definition.savePlaybook({
    name: 'atualizar-cluster', description: 'confere o ARN do cluster na AWS', appliesTo: null, trigger: '',
    autonomy: 'ask', instructions: '', learnedFrom: null,
    inputs: [{ name: 'cluster', concept: 'Cluster' }],
    steps: [{ id: 'ver', label: 'Ver o cluster', how: 'run_command aws ecs describe-clusters' }],
  } as never);
  procedures.definition.savePlaybook({
    name: 'ver-logs', description: 'ver o log de um serviço', appliesTo: null, trigger: '',
    autonomy: 'ask', instructions: '', learnedFrom: null,
    inputs: [{ name: 'cluster', concept: 'Cluster' }, { name: 'servico', concept: 'Servico' }],
    steps: [{ id: 'achar', label: 'Achar o log group', how: 'run_command aws logs describe-log-groups' }],
  } as never);
  trust.setPlaybookLevel('ver-logs', { level: 3 });

  let afterFail = '';
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall('playbook_start', { name: 'ver-logs', params: { cluster: 'cluster-pagamentos', servico: 'servico-cobranca' } }),
      { stopReason: 'toolUse' },
    ),
    fauxAssistantMessage(
      fauxToolCall('playbook_step', { stepId: 'achar', status: 'failed', note: 'o log group não existe mais' }),
      { stopReason: 'toolUse' },
    ),
    (context) => { afterFail = JSON.stringify(context); return fauxAssistantMessage(fauxText('O log group não existe; o cluster pode ter mudado.')); },
  ]);

  const orbi = init(Orbi, { id });
  await orbi.read(await orbi.dispatch('vê o log do serviço de cobrança'));

  assert.match(afterFail, /podeReconferir/, 'a falha vem com o que dá para reconferir');
  assert.match(afterFail, /cluster-pagamentos/);
  assert.match(afterFail, /atualizar-cluster/, 'e com o procedimento que confere na fonte');
  assert.doesNotMatch(afterFail, /servico-cobranca \(Servico\)/, 'o que não tem receita não entra na lista');
  assert.match(afterFail, /playbook_start/, 'a dica diz como reconferir: rodando o procedimento, pelo portão');
  assert.match(afterFail, /passa pelo cartão/, 'e que atualizar o fato continua passando pelo cartão');
});
