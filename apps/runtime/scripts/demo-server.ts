/**
 * Demo / UI-test server: the real runtime (same app.ts, brain, gate, bridge),
 * but Pi's faux provider plays Claude Haiku 5.5 with a scripted scenario, and
 * the brain is pre-filled with what Orbi "learned" in the prototype.
 *
 *   npm run demo            → http://127.0.0.1:3000 (the desktop app connects here)
 *
 * Try in the app:  "Vou te ensinar a atualizar a versão no portal"  (learn → approve)
 *                  "Atualiza a versão do novo-front"                (playbook with live steps)
 *                  anything else                                     (Orbi asks to be taught)
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = process.env.ORBI_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'orbi-demo-'));
Object.assign(process.env, {
  ORBI_DATA_DIR: dataDir,
  ORBI_WORKSPACE: process.env.ORBI_WORKSPACE ?? dataDir,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? 'faux',
  CHROME_MCP_AUTOSTART: process.env.CHROME_MCP_AUTOSTART ?? 'false',
});

// A local "portal" to try "Ensinar pelo navegador" (login arthur / s3nh@-Portal!).
const { startFakePortal } = await import('./fake-portal.ts');
const portal = await startFakePortal(Number(process.env.DEMO_PORTAL_PORT ?? 4310));
process.env.ORBI_DEMO_PORTAL = `${portal.url}/login`;

const { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText } = await import('@earendil-works/pi-ai');
const { setProvider } = await import('@flue/runtime');
const { start } = await import('@flue/runtime/node');
const { serve } = await import('@hono/node-server');
const { Orbi } = await import('../src/agents/orbi.ts');
const { default: app } = await import('../src/app.ts');
const { brain, conversations, stt } = (await import('../src/services.ts')).services();
if (process.env.DEMO_FAKE_STT) {
  const lines = (process.env.DEMO_FAKE_STT_LINES ?? '').split('|').filter(Boolean);
  let n = 0;
  stt.set({ name: 'roteirizada', transcribe: async () => lines[n++] ?? '' });
}

// ── seed: what the prototype showed Orbi knowing ──────────────────────────
function seed() {
  if (brain.stats().entities > 0) return;
  const e = (id: string, type: string, props: Record<string, unknown> = {}, body = '') => brain.upsertEntity({ id, type, props, body });
  e('ServicoJava', 'Classe', { detectadaPor: 'pom.xml' });
  e('FrontEnd', 'Classe', { detectadaPor: 'package.json + Vite', requires: ['registradoEm'] });
  e('api-pagamentos', 'Repositorio', { github: 'acme/api-pagamentos' }, 'Serviço de pagamentos (PIX e boletos).');
  e('svc-boletos', 'Repositorio', { github: 'acme/svc-boletos' });
  e('portal-clientes-front', 'Repositorio', { github: 'acme/portal-clientes-front' });
  e('ci.yml', 'Workflow');
  e('release.yml', 'Workflow');
  e('dev', 'Ambiente', { logs: '/ecs/*-dev' });
  e('homologacao', 'Ambiente');
  e('portal-interno', 'Portal', { url: 'http://portal.local/admin/menus', login: 'SSO do Chrome' }, 'Cada front aparece como ícone no menu.');
  e('timeout-fixo-1', 'Incidente', { etapa: 'testes unitários', padrao: 'valor-fixo-em-teste' }, 'PixServiceTest comparava com 30 s fixo; config mudou para 45 s.');
  e('timeout-fixo-2', 'Incidente', { etapa: 'testes unitários', padrao: 'valor-fixo-em-teste', autonomo: true });
  e('chg0041', 'Mudanca', { status: 'aguardando aprovação' });
  e('hu-812', 'Historia', { titulo: 'Filtro de extrato por período' });
  e('marina', 'Pessoa', { papel: 'aprovadora de GMUD' });
  e('rafael', 'Pessoa', { papel: 'aprovador de GMUD' });
  e('teste-valor-fixo', 'Playbook');
  const r = (from: string, rel: string, to: string, extra: { validFrom?: string; validTo?: string } = {}) => brain.addEdge({ from, rel, to, ...extra });
  r('api-pagamentos', 'eUm', 'ServicoJava');
  r('api-pagamentos', 'temWorkflow', 'ci.yml');
  r('ci.yml', 'publicaEm', 'dev');
  r('api-pagamentos', 'teve', 'timeout-fixo-1');
  r('timeout-fixo-1', 'resolvidoPor', 'teste-valor-fixo');
  r('teste-valor-fixo', 'aplicaA', 'ServicoJava');
  r('svc-boletos', 'eUm', 'ServicoJava');
  r('svc-boletos', 'teve', 'timeout-fixo-2');
  r('timeout-fixo-2', 'resolvidoPor', 'teste-valor-fixo');
  r('timeout-fixo-2', 'semelhanteA', 'timeout-fixo-1');
  r('portal-clientes-front', 'eUm', 'FrontEnd');
  r('portal-clientes-front', 'registradoEm', 'portal-interno');
  r('portal-clientes-front', 'publicaEm', 'dev');
  r('portal-clientes-front', 'temWorkflow', 'release.yml');
  r('release.yml', 'publicaEm', 'homologacao');
  r('chg0041', 'entrega', 'hu-812');
  r('chg0041', 'referente', 'portal-clientes-front');
  r('chg0041', 'aprovadaPor', 'marina', { validTo: '2026-12-31T23:59:59Z' });
  r('chg0041', 'aprovadaPor', 'rafael', { validFrom: '2027-01-01T00:00:00Z' });
  brain.savePlaybook({
    name: 'teste-valor-fixo',
    description: 'Corrigir teste unitário que compara com valor literal quando só a configuração mudou.',
    appliesTo: 'ServicoJava',
    trigger: 'teste falha e o diff mudou só application*.yml',
    autonomy: 'auto',
    steps: [
      { id: 'log', label: 'Ler o log da falha', how: 'run_command gh run view <id> --log-failed' },
      { id: 'diff', label: 'Confirmar que só a config mudou', how: 'run_command git diff --stat' },
      { id: 'fix', label: 'Trocar o literal pela config', how: 'claude_code_prepare_fix + claude_code_push_fix' },
      { id: 'ci', label: 'Acompanhar o CI', how: 'schedule_followup e gh run view' },
    ],
    instructions: 'Só arquivos de teste podem mudar. Se a correção tocar código de produção, pare e pergunte.',
    learnedFrom: null,
  });
  for (let i = 0; i < 2; i++) {
    const run = brain.startRun('teste-valor-fixo', 'chat:seed');
    for (const s of ['log', 'diff', 'fix', 'ci']) brain.updateRunStep(run.id, s, 'done');
  }
}
seed();

// ── the scripted "model" ───────────────────────────────────────────────────
type Msg = { role: string; content: unknown };
const textOf = (m: Msg) =>
  typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((c: any) => c.text ?? '').join(' ') : '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (name: string, args: Record<string, unknown>, text?: string) =>
  fauxAssistantMessage(text ? [fauxText(text), fauxToolCall(name, args as never)] : fauxToolCall(name, args as never), { stopReason: 'toolUse' });

const faux = fauxProvider({ provider: 'anthropic', models: [{ id: 'claude-haiku-5-5', reasoning: true, contextWindow: 200_000 }], tokensPerSecond: 400 });
const respond = async (context: { messages: Msg[] }) => {
  const msgs = context.messages;
  let lastUser = -1;
  // The runtime also injects plumbing signals (MCP availability, new skills…); skip them.
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = textOf(msgs[i]);
    const plumbing = t.startsWith('<signal') && !/tool-approval|followup/.test(t.slice(0, 200));
    if (msgs[i].role === 'user' && !plumbing) { lastUser = i; break; }
  }
  const said = lastUser >= 0 ? textOf(msgs[lastUser]).toLowerCase() : '';
  if (process.env.DEMO_DEBUG) console.log('[demo] roles', msgs.map((m) => m.role).join(','), '| said:', said.slice(0, 300));
  const toolsSince = msgs.slice(lastUser + 1).filter((m) => m.role === 'toolResult').length;
  await sleep(600);

  if (said.includes('<demonstracao')) return fromDemonstration(textOf(msgs[lastUser]), toolsSince);
  if ((said.includes('aprovou') || said.includes('tool-approval-result')) && (said.includes('mostrou no navegador') || said.includes('versao-do-mfe'))) {
    return fauxAssistantMessage(fauxText('Guardei o playbook **versao-do-mfe** e o Portal no cérebro; as credenciais ficam só no cofre. Quando um deploy de MFE terminar em dev, ou quando você pedir, eu rodo esse passo a passo.'));
  }
  if (said.includes('tool-approval-result') || said.includes('aprovou') || said.includes('negou')) {
    return fauxAssistantMessage(fauxText(said.includes('negou')
      ? 'Entendido, não guardei nada. Quer ajustar o que aprendi?'
      : 'Guardei no cérebro: o Portal interno, a regra de que todo front-end aparece no portal e o playbook **versao-no-portal**. Na próxima vez faço sozinho.'));
  }
  if (said.includes('retorno agendado')) {
    return fauxAssistantMessage(fauxText('Voltei para conferir: o run terminou verde. Seguindo para o próximo passo.'));
  }
  if (said.includes('ensin')) {
    if (toolsSince === 0) {
      return call('show_ui', { component: { component: 'status', id: 'descobrindo', title: 'Descobri o que dá', state: 'success', text: 'Li o portal-clientes-front: é um front-end (package.json + Vite) e já está registrado no Portal interno.' } },
        'Combinado. Antes de te perguntar, vou ver o que já sei.');
    }
    return call('brain_learn', {
      reason: 'Arthur ensinou a atualizar a versão de um front no Portal interno',
      items: [
        { kind: 'entity', payload: { id: 'novo-front', type: 'Repositorio', props: { github: 'acme/novo-front' } } },
        { kind: 'edge', payload: { from: 'novo-front', rel: 'eUm', to: 'FrontEnd' } },
        { kind: 'playbook', payload: {
          name: 'versao-no-portal',
          description: 'Atualizar a versão de um front-end no Portal interno depois do deploy em dev.',
          appliesTo: 'FrontEnd',
          trigger: 'deploy de um front concluído em dev',
          autonomy: 'ask',
          steps: [
            { id: 'abrir', label: 'Abrir o portal', how: 'mcp__chrome__navigate_page em [URL do portal]/admin/menus' },
            { id: 'achar', label: 'Achar o app no menu', how: 'take_snapshot e localizar pelo nome no menu' },
            { id: 'salvar', label: 'Trocar a versão e salvar', how: 'browser_act fill + click em Salvar' },
            { id: 'validar', label: 'Validar no menu', how: 'take_snapshot mostra a versão nova' },
          ],
          instructions: 'Use a sessão SSO do Chrome. Se pedir login, pergunte ao desenvolvedor.',
        } },
      ],
    }, 'Entendi os 4 passos. Vale para todo front que aparece no portal, então vou prender o playbook à classe FrontEnd.');
  }
  if (said.includes('atualiz') || said.includes('sobe') || said.includes('versão') || said.includes('versao')) {
    const steps = ['abrir', 'achar', 'salvar', 'validar'];
    const notes = ['portal aberto', 'Novo Atendimento no menu', 'versão 0.1.0 salva', 'menu mostra 0.1.0'];
    if (brain.playbook('versao-do-mfe') && (said.includes('mfe') || said.includes('micro'))) return runMfe(said, toolsSince);
    if (!brain.playbook('versao-no-portal')) {
      return call('ask_developer', { question: 'Ainda não sei atualizar versão no portal. Quer me ensinar agora?', options: ['Sim, vou te ensinar', 'Agora não'] });
    }
    if (toolsSince === 0) return call('playbook_start', { name: 'versao-no-portal', target: 'novo-front' }, 'Tenho um playbook para isso. Começando.');
    const i = toolsSince - 1;
    if (i < steps.length * 2) {
      const step = steps[Math.floor(i / 2)];
      await sleep(900);
      return call('playbook_step', { stepId: step, status: i % 2 === 0 ? 'running' : 'done', note: i % 2 === 0 ? undefined : notes[Math.floor(i / 2)] });
    }
    if (i === steps.length * 2) {
      return call('show_ui', { component: { component: 'table', id: 'resumo', title: 'Resumo', columns: ['Repositório', 'Ambiente', 'Versão', 'Portal'], rows: [['novo-front', 'dev', '0.1.0', 'Portal interno']] } });
    }
    return fauxAssistantMessage(fauxText('Pronto: a versão 0.1.0 do novo-front está no Portal interno e validada no menu.'));
  }
  return call('ask_developer', { question: 'Ainda não sei fazer isso. Quer me ensinar? Eu acompanho e guardo como playbook.', options: ['Vou te ensinar', 'Agora não'] });
};

/** Scripted stand-in for what Haiku does with a demonstration: actions + speech → playbook. */
function fromDemonstration(message: string, toolsSince: number) {
  const lines = [...message.matchAll(/^\[(\d\d:\d\d)\] (AÇÃO|FALA) {2}(.*)$/gm)].map((m) => ({ kind: m[2], text: m[3] }));
  const actions = lines.filter((l) => l.kind === 'AÇÃO').map((l) => l.text);
  const speech = lines.filter((l) => l.kind === 'FALA').length;
  const firstUrl = actions.map((a) => a.match(/^Abriu (\S+)/)?.[1]).find(Boolean) ?? process.env.ORBI_DEMO_PORTAL!;
  const secrets = [...new Set([...message.matchAll(/\{\{segredo:([^}]+)\}\}/g)].map((m) => m[1]))];
  const user = secrets.find((x) => /usuario|user|login/.test(x)), pass = secrets.find((x) => /senha|pass/.test(x));
  const link = actions.map((a) => a.match(/^Clicou no link "([^"]+)"/)?.[1]).find(Boolean) ?? 'novo-front';
  const tab = actions.map((a) => a.match(/^Clicou na aba "([^"]+)"/)?.[1]).find(Boolean) ?? 'Configuração';
  const field = actions.map((a) => a.match(/^Preencheu o campo "([^"]+)"[^{]*? com "([^"]*)"/)).find(Boolean);
  const button = [...actions].reverse().map((a) => a.match(/^Clicou no botão "([^"]+)"/)?.[1]).find(Boolean) ?? 'Salvar';
  const origin = new URL(firstUrl).origin;
  if (toolsSince === 0) {
    return call('show_ui', { component: { component: 'status', id: 'demo-sintese', title: 'Juntei o que você fez com o que explicou', state: 'success',
      text: `${actions.length} ações e ${speech} trechos de fala. Login com credenciais do cofre; o MFE e a versão viram parâmetros.` } },
      'Entendi o procedimento. Vou te mostrar como ficou antes de guardar.');
  }
  return call('brain_learn', {
    reason: 'Arthur mostrou no navegador como atualizar a versão de um MFE no Portal interno',
    items: [
      { kind: 'entity', payload: { id: 'MicroFrontend', type: 'Classe', props: { requires: ['registradoEm'] } } },
      { kind: 'entity', payload: { id: 'portal-interno-mfe', type: 'Portal', props: { url: origin, login: user ? 'usuário e senha (cofre)' : 'sessão do Chrome' } } },
      { kind: 'entity', payload: { id: link, type: 'Repositorio', props: {} } },
      { kind: 'edge', payload: { from: link, rel: 'eUm', to: 'MicroFrontend' } },
      { kind: 'edge', payload: { from: link, rel: 'registradoEm', to: 'portal-interno-mfe' } },
      { kind: 'playbook', payload: {
        name: 'versao-do-mfe',
        description: 'Atualizar a versão de um micro-frontend no Portal interno. Use quando pedirem para atualizar a versão de um MFE ou quando o deploy de um MFE terminar em dev.',
        appliesTo: 'MicroFrontend',
        trigger: 'deploy de MFE concluído em dev, ou pedido para atualizar a versão de um MFE',
        autonomy: 'ask',
        steps: [
          { id: 'entrar', label: 'Entrar no portal', how: `navigate_page ${firstUrl}. Se pedir login: browser_act fill no campo "Usuário" com {{segredo:${user ?? 'portal/usuario'}}} e "Senha" com {{segredo:${pass ?? 'portal/senha'}}}, click em "Entrar". Pronto quando aparecer a lista de micro-frontends.` },
          { id: 'abrir', label: 'Abrir o MFE {{mfe}}', how: `click no link com o nome {{mfe}} (na demonstração: "${link}").` },
          { id: 'aba', label: `Ir na aba ${tab}`, how: `click na aba (role tab) "${tab}".` },
          { id: 'versao', label: `Trocar ${field?.[1] ?? 'Versão'} para {{versao}} e salvar`, how: `browser_act fill no campo rotulado "${field?.[1] ?? 'Versão'}" com {{versao}} — a versão que foi para dev (na demonstração: "${field?.[2] ?? ''}"); click em "${button}".` },
          { id: 'conferir', label: 'Conferir', how: 'take_snapshot: aparece "Configuração salva" e o campo mostra {{versao}}.' },
        ],
        instructions: 'Parâmetros: {{mfe}} (nome no portal) e {{versao}} (tag/versão do último deploy em dev). Credenciais só pelas referências do cofre. Se o portal pedir MFA, pare e chame ask_developer.',
      } },
    ],
  }, `Ficaram 5 passos. O MFE e a versão viram parâmetros; usuário e senha entram pelo cofre (${secrets.length} referências). Vale para qualquer micro-frontend do portal.`);
}

/** Scripted run of the learned playbook (the real browser run is covered by npm run e2e:demo). */
async function runMfe(said: string, toolsSince: number) {
  const version = said.match(/\d+\.\d+\.\d+/)?.[0] ?? '2.5.0';
  const mfe = said.match(/(?:do|da|o)\s+([a-z0-9-]+-(?:front|mfe)|[a-z0-9]+-[a-z0-9-]+)/)?.[1] ?? 'novo-front';
  const steps = ['entrar', 'abrir', 'aba', 'versao', 'conferir'];
  const notes = ['login com as credenciais do cofre', `${mfe} aberto`, 'aba Configuração', `${version} salva`, `portal mostra ${version}`];
  if (toolsSince === 0) return call('playbook_start', { name: 'versao-do-mfe', target: mfe, params: { mfe, versao: version } }, `Vou rodar o playbook que você me mostrou para o ${mfe}.`);
  const i = toolsSince - 1;
  if (i < steps.length * 2) {
    await sleep(800);
    return call('playbook_step', { stepId: steps[Math.floor(i / 2)], status: i % 2 === 0 ? 'running' : 'done', note: i % 2 === 0 ? undefined : notes[Math.floor(i / 2)] });
  }
  return fauxAssistantMessage(fauxText(`Pronto: ${mfe} está com a versão ${version} no Portal interno.`));
}

faux.setResponses(Array.from({ length: 500 }, () => respond as never));
setProvider(faux.provider);

await start({ agents: [Orbi] });
if (conversations.list().length === 0) conversations.create('Boas-vindas');
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' });
console.log(`[demo] Orbi (modelo roteirizado) em http://127.0.0.1:${port} — dados em ${dataDir}`);
console.log(`[demo] portal de exemplo em ${portal.url}/login (usuário arthur, senha s3nh@-Portal!)`);
