import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faux, fauxAssistantMessage, fauxToolCall, fauxText, init, Orbi, app, brain, playbook } from './support/flow.ts';

test('esteira pedida por agente (MCP): roda a etapa, para na passagem que pergunta, segue com o desenvolvedor e responde', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const { agents, pipelines } = (await import('../src/services.ts')).services();
  const pb = (name: string, label: string, outputs: string[]) =>
    brain.savePlaybook({
      name, description: name, trigger: '', appliesTo: null, autonomy: 'auto', instructions: '', learnedFrom: null, variationOf: null,
      steps: [{ id: 'p0', label, how: '' }], outputs: outputs.map((o) => ({ name: o, description: o })),
    });
  pb('workflow-dev-teste', 'Acompanhar o workflow de {{repo}}', ['versao']);
  pb('promover-hml-teste', 'Promover {{versao}} para homologação', ['url_hml']);
  brain.savePipeline({
    name: 'entrega-teste',
    description: 'Do workflow de dev até homologação',
    inputs: [{ name: 'repo', description: 'repositório' }],
    stages: [
      { id: 'dev', label: 'Workflow dev', passage: 'auto', options: [{ playbook: 'workflow-dev-teste' }] },
      { id: 'hml', label: 'Homologação', passage: 'ask', options: [{ playbook: 'promover-hml-teste' }] },
    ],
  });
  const json = async (res: Response) => (await res.json()) as any;
  const created = await json(await app.request('/api/agents/clients', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Codex' }) }));
  await app.request(`/api/agents/clients/${created.client.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ canRunPipelines: true }) });
  const client = new Client({ name: 'teste', version: '0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3000/mcp'), {
      requestInit: { headers: { authorization: `Bearer ${created.token}` } },
      fetch: async (url, init) => app.request(String(url), init as RequestInit),
    }),
  );
  const call = async (name: string, args: Record<string, unknown>) =>
    JSON.parse(((await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }> }).content[0].text);
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(ok());
  };

  // Stage 1 runs alone; the destination given by an agent does not open the passage that asks.
  faux.setResponses([
    (context) => {
      assert.match(JSON.stringify(context), /etapa 1 de 2 \(Workflow dev\)/);
      return fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'workflow-dev-teste', params: { repo: 'acme/portal' } }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'p0', status: 'done', outputs: { versao: '2.5.0' } }), { stopReason: 'toolUse' }),
    (context) => {
      assert.match(JSON.stringify(context), /autorização do desenvolvedor/);
      return fauxAssistantMessage(fauxText('Workflow dev terminou; a homologação espera você.'));
    },
  ]);
  const { request_id } = await call('orbi_run_pipeline', { name: 'entrega-teste', inputs: { repo: 'acme/portal' }, destination: 'hml' });
  const conversationId = agents.requests.get(request_id)!.conversationId;
  await until(() => pipelines.runs.inConversation(conversationId)?.status === 'waiting');
  let status = await call('orbi_status', { request_id });
  assert.equal(status.status, 'waiting');
  assert.equal(status.pipeline.stage, '2 de 2 · Homologação');
  assert.deepEqual(status.pipeline.data, { 'dev.versao': '2.5.0' });

  // The developer lets it go on: stage 2 gets versao from stage 1, then Orbi answers the agent.
  faux.setResponses([
    (context) => {
      assert.match(JSON.stringify(context), /promover-hml-teste.*versao.*2\.5\.0/);
      return fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'promover-hml-teste', params: { versao: '2.5.0' } }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'p0', status: 'done', outputs: { url_hml: 'https://hml.acme/portal' } }), { stopReason: 'toolUse' }),
    (context) => {
      assert.match(JSON.stringify(context), /responda ao agente com agent_reply/);
      return fauxAssistantMessage(fauxToolCall('agent_reply', { status: 'done', summary: 'Portal 2.5.0 em homologação.', links: ['https://hml.acme/portal'] }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxText('Entrega concluída.')),
  ]);
  const run = pipelines.runs.inConversation(conversationId)!;
  const decided = await app.request(`/api/pipeline-runs/${run.id}/decide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'continue' }) });
  assert.equal(decided.status, 202);
  await until(() => agents.requests.get(request_id)?.status === 'done');
  status = await call('orbi_status', { request_id });
  assert.equal(status.summary, 'Portal 2.5.0 em homologação.');
  assert.equal(pipelines.runs.get(run.id)?.status, 'done');
  assert.deepEqual(status.pipeline.data, { 'dev.versao': '2.5.0', 'hml.url_hml': 'https://hml.acme/portal' });
  await client.close();
});
