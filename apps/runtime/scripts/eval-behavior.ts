/**
 * Behavior evaluation (docs/funcionalidades/18, "Avaliação de comportamento"): the real Orbi,
 * with the real model, taught and asked by a simulated developer (another model call), over
 * local fake sites. After each scenario: deterministic checks on the brain and the cards, and a
 * judge (another model call) that reads the conversation and grades it with a rubric.
 *
 *   npm run eval:behavior -w @orbi/runtime            # every scenario
 *   npm run eval:behavior -w @orbi/runtime -- loja    # one
 *
 * It spends tokens on purpose, so with Anthropic it ALWAYS runs on Haiku 5.5 (the Orbi, the
 * simulated developer and the judge), whatever apps/runtime/.env says: a test must never use a
 * dearer model. Needs a headless Chrome (like npm run e2e). Each round goes to
 * data/evals/<date>-<scenario>/.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** The only Anthropic model a test may spend on. */
const TEST_MODEL = 'claude-haiku-5-5';
const dir = mkdtempSync(join(tmpdir(), 'orbi-eval-'));
Object.assign(process.env, {
  ORBI_MODEL: `anthropic/${TEST_MODEL}`,
  ORBI_DATA_DIR: dir,
  ORBI_WORKSPACE: dir,
  ORBI_FLUE_DB: join(dir, 'flue.db'),
  ORBI_VAULT: 'file',
  CHROME_HEADLESS: process.env.CHROME_HEADLESS ?? 'true',
  CHROME_DEBUG_PORT: process.env.CHROME_DEBUG_PORT ?? '9449',
  CHROME_MCP_PORT: process.env.CHROME_MCP_PORT ?? '8949',
});

const { SCENARIOS } = await import('./eval/scenarios.ts');
const core = await import('./eval/core.ts');
const { startFakeStore } = await import('./eval/fake-store.ts');
const { startFakePortal } = await import('./fake-portal.ts');
const { startFakePanel } = await import('./eval/fake-panel.ts');
const { init } = await import('@flue/runtime');
const { start } = await import('@flue/runtime/node');
const { Orbi } = await import('../src/agents/orbi.ts');
const { Configurador } = await import('../src/agents/configurador.ts');
const { Revisor } = await import('../src/agents/revisor.ts');
const { default: app } = await import('../src/app.ts');
const services = (await import('../src/services.ts')).services();
const { brain, inbox, llm, config, followups } = services;

type Reply = { text: string; data: Record<string, unknown[]> };
type Snapshot = import('./eval/core.ts').Snapshot;

// ── one plain call to the model (simulated developer and judge) ──
async function ask(system: string, prompt: string): Promise<string> {
  if (llm.adapter) {
    const id = (config.model ?? '').split('/').pop() ?? llm.adapter.models[0].id;
    const out = llm.adapter.chat({ model: id, system, messages: [{ role: 'user', content: prompt }], tools: [], maxTokens: 2000 }, new AbortController().signal);
    if (Symbol.asyncIterator in (out as object)) {
      let text = '';
      for await (const e of out as AsyncIterable<{ type: string; delta?: string }>) if (e.type === 'text') text += e.delta ?? '';
      return text;
    }
    return (await (out as Promise<{ text?: string }>)).text ?? '';
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: TEST_MODEL, max_tokens: 2000, system, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`modelo respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return body.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

const components = (reply: Reply) => ((reply.data.ui ?? []) as Array<{ components: Array<Record<string, any>> }>).at(-1)?.components ?? [];
const cardSummary = (c: Record<string, any>) => String(c.title ?? c.question ?? c.name ?? c.playbook?.name ?? c.component).slice(0, 200);
const post = async (path: string, body: unknown) => (await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

async function runScenario(id: string) {
  const scenario = SCENARIOS.find((s) => s.id === id)!;
  let store = await startFakeStore();
  const portal = await startFakePortal();
  const panel = await startFakePanel();
  const sites = () => ({ store: store.url, portal: `${portal.url}/login`, panel: panel.url });
  await scenario.seed?.({ brain, workspace: config.workspace, sites: sites() });
  const system = core.personaPrompt(scenario, sites());
  const shown = new Map<string, Record<string, any>>();
  const snap: Snapshot = { turns: [], brain: { types: [], entities: [], playbooks: [], runs: [] }, asked: [], secretValues: [] };
  const take = (): Snapshot => ({
    ...snap,
    turns: [...snap.turns],
    asked: [...snap.asked],
    brain: { types: brain.types(), entities: brain.graph().entities, playbooks: brain.playbooks(), runs: brain.runs(200) },
    sites: { catalogo: panel.registered.length },
  });
  const conversation = `chat:eval-${scenario.id}-${Date.now()}`;
  const orbi = init(Orbi, { id: conversation });
  const record = (reply: Reply) => {
    const cards = components(reply);
    for (const c of cards) if (c.inboxId) shown.set(c.inboxId, c);
    // Stopped half-way: a procedure still open and nothing waiting for the developer (no card, no follow-up).
    const waiting = inbox.list({ status: 'open' }).some((x) => x.conversationId === conversation && x.kind !== 'level');
    const open = brain.runs(50).some((r) => r.conversationId === conversation && (r.status === 'running' || r.status === 'waiting'));
    const followup = !!followups.active(conversation);
    snap.turns.push({ from: 'orbi', text: reply.text, cards: cards.map((c) => ({ component: String(c.component), summary: cardSummary(c) })), stalled: open && !waiting && !followup });
  };
  const results: Array<{ session: number; checks: Array<{ name: string; ok: boolean; why?: string }>; diff: unknown }> = [];

  for (const [i, session] of scenario.sessions.entries()) {
    if (session.setup === 'break-store') {
      const port = Number(new URL(store.url).port);
      await store.close();
      store = await startFakeStore({ port, broken: true });
    }
    const before = take();
    const message = core.fillSites(session.message, sites());
    console.log(`\n▸ ${scenario.id} · sessão ${i + 1}: ${message.slice(0, 100)}`);
    snap.turns.push({ from: 'desenvolvedor', text: message });
    record((await orbi.read(await orbi.dispatch(message))) as Reply);

    // Whatever waits for the developer: the simulated developer answers, approvals are given.
    for (let round = 0; round < 15; round++) {
      const open = inbox.list({ status: 'open' }).filter((x) => x.conversationId === conversation && x.kind !== 'level');
      if (!open.length) break;
      const item = open[0];
      snap.asked.push({ kind: item.kind, title: item.title });
      let receipt: unknown;
      if (item.kind === 'question') {
        const card = shown.get(item.id);
        const options: string[] = card?.options ?? (card?.component === 'agreement' ? ['Está certo', 'Ajustar'] : item.detail.split('\n').filter(Boolean));
        const answer = (await ask(system, core.questionPrompt(item.title, options, snap.turns))).trim();
        snap.turns.push({ from: 'desenvolvedor', text: answer });
        receipt = await post(`/api/inbox/${item.id}/answer`, { text: answer });
      } else if (item.kind === 'secret') {
        const name = String(shown.get(item.id)?.name ?? 'credencial');
        const value = core.credentialFor(name, scenario.credentials);
        if (value) snap.secretValues.push(value);
        snap.turns.push({ from: 'harness', text: `digitou a credencial ${name} no cartão${value ? '' : ' (sem valor conhecido: deixou em branco)'}` });
        receipt = await post(`/api/inbox/${item.id}/secret`, value ? { name, value } : { name });
      } else if (item.kind === 'approval' || item.kind === 'learning') {
        snap.asked[snap.asked.length - 1].decision = 'aprovou';
        snap.turns.push({ from: 'harness', text: `aprovou: ${item.title}` });
        receipt = await post(`/api/inbox/${item.id}/decision`, { decision: 'approve', approver: 'Avaliação' });
      } else {
        receipt = await post(`/api/inbox/${item.id}/dismiss`, {});
      }
      if (receipt && typeof receipt === 'object' && !('error' in receipt)) record((await orbi.read(receipt as never)) as Reply);
    }
    const after = take();
    // Every session: no turn may end announcing the next step without doing it or asking (docs: "Como terminar um turno").
    const endings = { name: 'nenhum turno parou no meio', test: (a: Snapshot, b: Snapshot) => core.stalledTurns(a, b).length === 0 || `${core.stalledTurns(a, b).length} turno(s) pararam com o procedimento aberto e nada esperando` };
    const checks = [...session.checks, endings].map((c) => {
      const r = c.test(after, before);
      return { name: c.name, ok: r === true, ...(r === true ? {} : { why: String(r) }) };
    });
    for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.why ? ` — ${c.why}` : ''}`);
    results.push({ session: i + 1, checks, diff: core.brainDiff(before.brain, after.brain) });
  }

  const final = take();
  const transcript = core.transcriptOf(final);
  const judged = core.parseVerdict(await ask('Você é um avaliador rigoroso e objetivo.', core.judgePrompt(scenario, transcript)));
  const out = resolve(process.env.ORBI_EVAL_DIR ?? resolve(process.cwd(), 'data/evals'), `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${scenario.id}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'transcricao.md'), transcript);
  writeFileSync(join(out, 'assercoes.json'), JSON.stringify(results, null, 2));
  writeFileSync(join(out, 'juiz.json'), JSON.stringify(judged, null, 2));
  writeFileSync(join(out, 'cerebro.json'), JSON.stringify(final.brain, null, 2));
  console.log(`\n${scenario.title}`);
  if (judged.verdict) {
    for (const r of core.RUBRIC) console.log(`  ${r.label.padEnd(30)} ${judged.verdict.scores[r.id]?.nota ?? '–'}/5`);
    console.log(`  ${judged.verdict.resumo}`);
  }
  for (const p of judged.problems) console.log(`  juiz: ${p}`);
  console.log(`  → ${out}`);
  await store.close();
  await portal.close();
  await panel.close();
  return results.flatMap((r) => r.checks).every((c) => c.ok);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
for (const id of wanted) if (!SCENARIOS.some((s) => s.id === id)) throw new Error(`cenário desconhecido: ${id} (há ${SCENARIOS.map((s) => s.id).join(', ')})`);
const ids = wanted.length ? wanted : SCENARIOS.map((s) => s.id);

if (ids.length > 1) {
  // Each scenario in its own process: its own data folder, brain and workspace (they do not share what was learned).
  const { spawnSync } = await import('node:child_process');
  let ok = true;
  for (const id of ids) {
    const r = spawnSync(process.execPath, [...process.execArgv, process.argv[1], id], { stdio: 'inherit', env: process.env });
    ok = r.status === 0 && ok;
  }
  process.exit(ok ? 0 : 1);
}

const flue = (await start({ agents: [Orbi, Configurador, Revisor] })) as unknown as { [Symbol.asyncDispose](): Promise<void> };
let ok = false;
try {
  ok = await runScenario(ids[0]);
} finally {
  await flue[Symbol.asyncDispose]();
  await services.chrome?.stop?.();
}
process.exit(ok ? 0 : 1);
