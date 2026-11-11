/**
 * End-to-end of the Conversas screen, in a real browser: the desktop UI (Vite) over the real
 * runtime, with the model scripted (Pi's faux provider). A "developer" teaches a procedure from
 * start to end by typing in the chat and clicking the cards, and at each stop the test checks
 * what the screen shows: the stage bar, the list by state, the "O que estou aprendendo" panel,
 * the cards in the chat, Pendências and the "…" menu. Screenshots of each stop go to
 * ORBI_E2E_SHOTS (default: a temp folder) for a look.
 *
 *   npm run e2e:tela
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'orbi-tela-e2e-'));
const RUNTIME_PORT = 3317;
const UI_PORT = 5187;
Object.assign(process.env, {
  ORBI_DATA_DIR: dir,
  ORBI_WORKSPACE: dir,
  ANTHROPIC_API_KEY: 'faux',
  CHROME_MCP_AUTOSTART: 'false',
  CHROME_MCP_PORT: '1',
  ORBI_VAULT: 'file',
  ORBI_RUNTIME_URL: `http://127.0.0.1:${RUNTIME_PORT}`,
});
const shots = process.env.ORBI_E2E_SHOTS ?? join(dir, 'telas');
mkdirSync(shots, { recursive: true });

const pi = await import('@earendil-works/pi-ai');
const { fauxAssistantMessage, fauxToolCall, fauxText } = pi;
const flue = await import('@flue/runtime');
const { start } = await import('@flue/runtime/node');
const { serve } = await import('@hono/node-server');
const { createServer } = await import('vite');
const puppeteer = (await import('puppeteer-core')).default;
const { chromeExecutable } = await import('../src/browser/chrome.ts');

const faux = pi.fauxProvider({ provider: 'anthropic', models: [{ id: 'claude-haiku-5-5', reasoning: true, contextWindow: 200_000 }] });
flue.setProvider(faux.provider);
const { Orbi } = await import('../src/agents/orbi.ts');
const { Configurador } = await import('../src/agents/configurador.ts');
const { Revisor } = await import('../src/agents/revisor.ts');
const { default: app } = await import('../src/app.ts');
const { brain, policy, config, vault } = (await import('../src/services.ts')).services();

const runtime = await start({ agents: [Orbi, Configurador, Revisor] });
const http = serve({ fetch: app.fetch, port: RUNTIME_PORT, hostname: '127.0.0.1' });
const desktop = resolve(import.meta.dirname, '../../desktop');
const vite = await createServer({ root: desktop, configFile: join(desktop, 'vite.config.ts'), server: { port: UI_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, args: ['--no-sandbox', '--no-first-run'], defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
// Requests the page has open: at the end only the change feed and one wait per conversation may be
// left. Streams that pile up hold the browser's 6 connections to the runtime and the app freezes.
const openReq = new Map<unknown, string>();
page.on('request', (r) => openReq.set(r, `${r.method()} ${r.url()}`));
page.on('requestfinished', (r) => openReq.delete(r));
page.on('requestfailed', (r) => openReq.delete(r));
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
// React warnings (duplicate keys and the like) count as errors of the screen.
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pageErrors.push(m.text()); });

const ctx = (context: unknown) => JSON.stringify(context).replace(/\\"/g, '"');
let n = 0;
async function shot(name: string) {
  await page.screenshot({ path: join(shots, `${String(++n).padStart(2, '0')}-${name}.png`) });
}
const text = (sel: string) => page.$eval(sel, (e) => (e as HTMLElement).innerText).catch(() => '');
async function until(what: string, ok: () => Promise<boolean>, ms = 15_000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 150))) if (await ok()) return;
  await shot(`falhou-${what.replace(/\W+/g, '-')}`);
  throw new Error(`a tela não mostrou: ${what}`);
}
const shows = (sel: string, re: RegExp) => until(`${sel} ${re}`, async () => re.test(await text(sel)));
const stageNow = () => text('.stages [aria-current="step"]');
async function say(message: string) {
  await page.click('.composer textarea, textarea');
  await page.keyboard.type(message);
  await page.keyboard.press('Enter');
}
async function clickButton(scope: string, label: RegExp) {
  await until(`botão ${label}`, async () => (await page.$$(`${scope} button`)).length > 0);
  const handles = await page.$$(`${scope} button`);
  for (const h of handles) {
    if (label.test(await h.evaluate((e) => (e as HTMLElement).innerText))) return h.click();
  }
  throw new Error(`sem o botão ${label} em ${scope}`);
}
/** The chat finished its turn: no working dots and the composer free. */
const idle = () => until('o turno terminar', async () => !(await page.$('.typing')) && !(await page.$('.stop-btn')));

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

try {
  await page.goto(`http://127.0.0.1:${UI_PORT}/`, { waitUntil: 'domcontentloaded' });
  await until('a tela Conversas', async () => !!(await page.$('.convs-new')));

  // 1 · Explicar
  await page.click('.convs-new');
  await shows('.teach-start', /O que você precisa\?/);
  await until('sem barra de etapas nem painel numa conversa nova', async () => !(await page.$('.stages')) && !(await page.$('.notebook')));
  await shot('conversa-nova');

  // 2 · Ensaiar: tries along, stops at what it did not find and asks.
  let runId = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('rehearsal_start', { goal: 'subir versão de um MFE no portal' }), { stopReason: 'toolUse' }),
    (context) => {
      runId = /"runId":"([^"]+)"/.exec(ctx(context))?.[1] ?? '';
      return fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Abrir o portal', status: 'done', note: 'login pelo cofre' }), { stopReason: 'toolUse' });
    },
    fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Achar onde cria a versão', status: 'waiting', note: 'Nova versão não existe' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Não achei "Nova versão". É Releases › Criar release ou Promover?')),
  ]);
  await say('Pra subir versão do checkout-mfe: entra no portal, clica em nova versão e coloca a 2.14.0 em homologação.');
  await shows('.messages', /Releases › Criar release ou Promover\?/);
  await idle();
  await until('a etapa Ensaiar', async () => /Ensaiar/.test(await stageNow()));
  await shows('.notebook', /subir versão de um MFE no portal/i);
  await shows('.notebook', /Achar onde cria a versão · esperando você/i);
  await shows('.convs', /Em andamento[\s\S]*Pra subir versão do checkout-mfe[\s\S]*Aprendendo com você · ensaiando/i);
  await shows('.messages', /A partir daqui: aprendendo com você · subir versão de um MFE no portal/);
  await shows('.chat-title', /Pra subir versão do checkout-mfe/);
  await shot('ensaiar');

  // 3 · Combinar
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Achar onde cria a versão', status: 'done', note: 'Releases › Criar release' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('rehearsal_step', { label: 'Conferir que ficou verde', status: 'done' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Deu certo: o release 2.14.0 ficou verde. Vamos combinar onde isso começa e termina?')),
  ]);
  await say('É Releases › Criar release.');
  await shows('.messages', /Vamos combinar onde isso começa e termina\?/);
  await idle();
  await until('a etapa Combinar', async () => /Combinar/.test(await stageNow()));
  await shows('.notebook', /Ainda não sei/i);
  await shot('combinar');

  // 4 · Aprender: the agreement card, then the learning card (also in Pendências).
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('rehearsal_finish', {
      start: 'alguém pede para subir a versão de um MFE', receives: ['mfe', 'versao', 'ambiente'], end: 'o release fica verde', outside: ['abrir GMUD'],
      corrections: [{ explained: 'Nova versão', actual: 'Releases › Criar release' }],
    }), { stopReason: 'toolUse' }),
  ]);
  await say('Começa quando alguém pede para subir versão; termina com o release verde. GMUD fica de fora.');
  await shows('.agreement', /Termina quando[\s\S]*o release fica verde/i);
  await until('a etapa Aprender', async () => /Aprender/.test(await stageNow()));
  await shows('.notebook', /Começa e termina[\s\S]*o release fica verde/i);
  await shows('.notebook', /O ensaio corrigiu[\s\S]*Releases › Criar release/i);
  await shot('acordo');

  faux.setResponses([fauxAssistantMessage(fauxToolCall('brain_learn', learn(runId) as never), { stopReason: 'toolUse' })]);
  await clickButton('.agreement', /Está certo/);
  await until('o cartão de aprendizado no chat', async () => (await page.$$('.messages button.btn.primary')).length > 0 && /Aprovar/.test(await text('.messages')));
  await shows('.chat-head', /Pendências\s*\d/);
  await clickButton('.chat-head', /Pendências/);
  await shows('.inbox', /Aprend|aprend/);
  await shot('pendencias');
  await clickButton('.inbox-head', /^$/); // the close (×) button has no text
  await until('o painel de volta', async () => !!(await page.$('.notebook')));

  // 5 · Assumir: approved.
  faux.setResponses([fauxAssistantMessage(fauxText('Guardado: agora sei subir versão de MFE. Peça quando quiser.'))]);
  await clickButton('.messages', /Aprovar/);
  await shows('.messages', /agora sei subir versão de MFE/);
  await idle();
  await until('a etapa Assumir', async () => /Assumir/.test(await stageNow()));
  await shows('.notebook', /O que aprendi[\s\S]*atualizar-mfe/i);
  await shows('.notebook', /N1 agora · N2 depois de 1 execução sem correção/i);
  await shows('.notebook', /Já anotei[\s\S]*checkout-mfe/i);
  await shows('.convs', /Já assumi[\s\S]*Assumi: atualizar-mfe · N1/i);
  await shot('aprendido');

  // 6 · Fazendo: asked to do it.
  let review = '';
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('playbook_start', { name: 'atualizar-mfe', params: { mfe: 'checkout', versao: '2.15.0', ambiente: 'homologação' } }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'abrir', status: 'done', note: 'portal aberto' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('playbook_step', { stepId: 'criar', status: 'done', note: 'release verde' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Feito: checkout-mfe 2.15.0 em homologação, release verde.')),
    (context) => { review = ctx(context); return fauxAssistantMessage(fauxText('Ok.')); },
  ]);
  await say('Sobe a 2.15 do checkout em homologação.');
  await shows('.messages', /Feito: checkout-mfe 2.15.0/);
  await idle();
  await until('sem a barra de etapas ao fazer', async () => !(await page.$('.stages')));
  await shows('.notebook', /O que estou fazendo[\s\S]*Criar o release 2.15.0 em homologação/i);
  await shows('.notebook', /O que eu sei[\s\S]*mfe/i);
  await shows('.convs', /Recentes[\s\S]*atualizar-mfe · feito/i);
  await shows('.messages', /A partir daqui: fazendo atualizar-mfe/);
  await until('a revisão do fim', async () => review.includes('review'));
  await until('N2 depois de uma execução limpa', async () => brain.playbook('atualizar-mfe')?.level === 2);
  await shot('fazendo');

  // The "…" menu has copy and delete; Escape closes it.
  await page.click('.menu-wrap .icon-btn');
  await shows('.menu', /Copiar conversa[\s\S]*Apagar conversa/);
  await page.keyboard.press('Escape');
  await until('o menu fechar', async () => !(await page.$('.menu')));

  // The composer: the microphone inside the box, Enviar outside, the model under it.
  const micInside = await page.$eval('.composer-input', (box) => !!box.querySelector('.mic-btn'));
  assert.ok(micInside, 'o microfone fica dentro da caixa');
  assert.ok(await page.$('.composer-row > button[aria-label="Enviar"]'), 'o Enviar fica fora da caixa');
  await shows('.composer-footer', /claude-haiku-5-5[\s\S]*barato[\s\S]*padrão/i);
  await page.click('.model-chip');
  await shows('.model-menu', /Barato[\s\S]*claude-haiku-5-5[\s\S]*Intermediário[\s\S]*claude-sonnet-5-5[\s\S]*Caro[\s\S]*claude-opus-5-5/);
  await shot('modelos');
  await clickButton('.model-menu', /claude-opus-5-5/);
  await shows('.composer-footer', /claude-opus-5-5[\s\S]*caro/i);
  await until('a escolha ficar só nesta conversa', async () => (((await (await fetch(`http://127.0.0.1:${RUNTIME_PORT}/api/conversations`)).json()) as any[])[0]?.model === 'claude-opus-5-5'));
  await page.click('.model-chip');
  await clickButton('.model-menu', /claude-haiku-5-5/);
  await shows('.composer-footer', /claude-haiku-5-5[\s\S]*padrão/i);
  await until('voltar ao padrão', async () => (((await (await fetch(`http://127.0.0.1:${RUNTIME_PORT}/api/conversations`)).json()) as any[])[0]?.model === undefined));

  // Parar: says "Parando…" at once and the command that was running stops.
  policy.set('comandos-escrita', 'auto');
  const mark = join(config.workspace, 'marca-parar');
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('run_command', { binary: 'node', args: ['-e', `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(mark)}, 'x'), 6000)`], purpose: 'Esperar o deploy' }), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Parei.')),
  ]);
  await say('Espera o deploy terminar.');
  await until('o botão Parar', async () => !!(await page.$('.stop-btn')));
  await new Promise((r) => setTimeout(r, 800));
  const clicked = Date.now();
  await page.click('.stop-btn');
  // Right after the click: "Parando…" (or already stopped, when it is that quick).
  await until('"Parando…" na hora', async () => /Parando/.test(await text('.composer')) || !(await page.$('.stop-btn')), 500);
  await shows('.messages', /interrompida/i);
  await shot('parado');
  await idle();
  const took = Date.now() - clicked;
  assert.ok(took < 5000, `parou em ${took} ms`);
  await new Promise((r) => setTimeout(r, 6000));
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(mark), false, 'o comando foi interrompido de verdade');
  policy.set('comandos-escrita', 'ask');

  // The screens moved by docs/funcionalidades/20: no Agentes in the rail, Configurações in groups,
  // Ferramentas (MCP) with the Chrome, Servidor MCP, Sugestões in the Cérebro.
  const rail = await text('.rail');
  assert.ok(!/\bAgentes\b/.test(rail), `a barra não tem mais Agentes: ${rail}`);
  await clickButton('.rail', /Configurações/);
  await shows('.subnav', /Permissões[\s\S]*Conexões[\s\S]*Ferramentas \(MCP\)[\s\S]*Servidor MCP[\s\S]*Agentes de código/i);
  await clickButton('.subnav', /Ferramentas \(MCP\)/);
  await shows('.mcp-tools', /Chrome DevTools/);
  // The Chrome settings: the form shows what the runtime uses; a change says what saving does.
  // (Not saved here: saving writes the .env of the runtime folder; the route has its own test.)
  await clickButton('.mcp-tools', /Chrome DevTools/);
  await shows('.chrome-settings', /Perfil próprio do Orbi[\s\S]*O seu Chrome[\s\S]*Mostrar a janela/);
  await page.click('.chrome-settings input[type=radio]:not(:checked)');
  await shows('.chrome-settings', /Endereço da depuração[\s\S]*Informe o endereço/);
  await page.type('.chrome-settings input[placeholder="http://127.0.0.1:9222"]', 'http://127.0.0.1:9222');
  await shows('.chrome-settings', /Salvar (reinicia|reconecta|desliga)/);
  await shot('ferramentas-mcp');
  await clickButton('.chrome-settings', /Desfazer/);
  await clickButton('.mcp-tools', /Ferramentas \(MCP\)/);

  // Adding a server through the screen, against a fake MCP server on this machine (docs/funcionalidades/20, fase 3).
  const { startFakeMcp } = await import('../test/support/fake-mcp.ts');
  const fake = await startFakeMcp('tok-e2e-nao-vaza');
  await vault.set('issues/token', 'tok-e2e-nao-vaza');
  await clickButton('.mcp-tools', /Adicionar servidor/);
  await page.type('.mcp-add input[placeholder="Jira da empresa"]', 'Issues');
  await page.type('.mcp-add input[placeholder^="https://"]', fake.url);
  await page.type('.mcp-add input[placeholder^="Bearer"]', 'Bearer ');
  await page.select('.mcp-add select[aria-label="Usar credencial do cofre"]', 'issues/token');
  await clickButton('.mcp-add', /Testar conexão/);
  await shows('.mcp-add', /Encontrei 4 ferramentas[\s\S]*buscar_issue[\s\S]*sem informação: conta como escrita/);
  await shot('mcp-adicionar');
  await clickButton('.mcp-add', /^Salvar$/);
  await shows('.mcp-server', /Issues[\s\S]*conectado[\s\S]*1 leitura · 2 escrita/);
  assert.ok(!(await text('.mcp-server')).includes('tok-e2e-nao-vaza'), 'a tela mostra só a referência');
  await shot('mcp-servidor');
  await fake.close();

  // A server started by a command (fase 4): confirm before it runs, the variable from the vault.
  await vault.set('chamados/token', 'tok-programa-nao-vaza');
  await clickButton('.mcp-server', /Ferramentas \(MCP\)/);
  await clickButton('.mcp-tools', /Adicionar servidor/);
  await page.type('.mcp-add input[placeholder="Jira da empresa"]', 'Chamados');
  await clickButton('.mcp-add .segmented', /Comando local/);
  const stdio = join(import.meta.dirname, '../test/support/fake-mcp-stdio.mjs');
  await page.type('.mcp-add input[placeholder^="npx"]', `"${process.execPath}" "${stdio}"`);
  await clickButton('.mcp-add', /\+ Variável/);
  await page.type('.mcp-add input[placeholder="SNOW_PASSWORD"]', 'CHAMADOS_TOKEN');
  await page.select('.mcp-add select[aria-label="Usar credencial do cofre"]', 'chamados/token');
  await clickButton('.mcp-add', /Testar conexão/);
  await shows('.mcp-confirm', /vai rodar nesta máquina, com o seu usuário/);
  await shot('mcp-confirmar-comando');
  await clickButton('.mcp-confirm', /Rodar e testar/);
  await shows('.mcp-add', /Encontrei 2 ferramentas[\s\S]*ver_ambiente/);
  await clickButton('.mcp-add', /^Salvar$/);
  await shows('.mcp-server', /Chamados[\s\S]*conectado[\s\S]*CHAMADOS_TOKEN=\{\{segredo:chamados\/token\}\}/);
  // The command changed (here, by the API): it waits for you before running again.
  await fetch(`http://127.0.0.1:${RUNTIME_PORT}/api/mcp-servers/chamados`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: { program: process.execPath, args: [stdio, '--outro'] } }) });
  await shows('.mcp-server', /esperando você aprovar[\s\S]*--outro/);
  await shot('mcp-aprovar-comando');
  await clickButton('.mcp-confirm', /Aprovar e iniciar/);
  await shows('.mcp-server', /Chamados[\s\S]*conectado/);
  assert.ok(!(await text('.mcp-server')).includes('tok-programa-nao-vaza'));
  await clickButton('.subnav', /Regras/);
  await shows('.auto-list', /Issues: ler[\s\S]*Issues: alterar[\s\S]*Chamados: ler/);

  // "Sempre sozinho" from the card (fase 5): saved for the tool, this call approved; undone on the server page.
  await clickButton('.rail', /Conversas/);
  await page.click('.convs-new');
  await shows('main', /O que você precisa\?/);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('chamados__abrir_chamado', {}), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxText('Chamado aberto.')),
  ]);
  await say('abre um chamado');
  await shows('.messages', /Chamados · abrir_chamado[\s\S]*Sempre sozinho para abrir_chamado/);
  await shot('mcp-cartao');
  await clickButton('.messages', /Sempre sozinho para abrir_chamado/);
  await shows('.messages', /Chamado aberto/);
  const tools = ((await (await fetch(`http://127.0.0.1:${RUNTIME_PORT}/api/mcp-servers/chamados`)).json()) as { tools: Array<{ name: string; alone: boolean }> }).tools;
  assert.equal(tools.find((t) => t.name === 'abrir_chamado')?.alone, true);
  await clickButton('.rail', /Configurações/);
  await clickButton('.subnav', /Ferramentas \(MCP\)/);
  await clickButton('.mcp-tools', /^Chamados$/);
  await shows('.mcp-server', /sozinho \(você escolheu\)/);
  await clickButton('.mcp-server', /voltar a perguntar/);
  await until('voltou a perguntar', async () => !/sozinho \(você escolheu\)/.test(await text('.mcp-server')));
  await clickButton('.subnav', /Servidor MCP/);
  await shows('.agentes', /Pedidos[\s\S]*Conexões/);
  await shot('servidor-mcp');
  await clickButton('.rail', /Cérebro/);
  await clickButton('.tabs', /Sugestões/);
  await shows('.cerebro', /sugestão|Sugest/i);
  await shot('sugestoes-no-cerebro');

  const held = [...openReq.values()].filter((u) => u.includes(`127.0.0.1:${UI_PORT}`) && !/\.(tsx?|css|js|svg)(\?|$)|@vite|node_modules/.test(u));
  assert.ok(held.length <= 3, `conexões presas no fim: ${JSON.stringify(held)}`);
  assert.deepEqual(pageErrors, [], 'a página não teve erros');
  console.log(`tela Conversas: ok · telas em ${shots}`);
} finally {
  await browser.close();
  await vite.close();
  http.close();
  await (runtime as unknown as { [Symbol.asyncDispose](): Promise<void> })[Symbol.asyncDispose]?.();
}
process.exit(0);
