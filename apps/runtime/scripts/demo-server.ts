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
const { brain, conversations, stt, agents } = (await import('../src/services.ts')).services();
const { EXAMPLE_TYPES } = await import('../src/brain/domain/ontology.ts');
if (process.env.DEMO_FAKE_STT) {
  const lines = (process.env.DEMO_FAKE_STT_LINES ?? '').split('|').filter(Boolean);
  let n = 0;
  stt.set({ name: 'roteirizada', transcribe: async () => lines[n++] ?? '' });
}

// ── seed: what the prototype showed Orbi knowing ──────────────────────────
function seed() {
  if (brain.stats().entities > 0) return;
  // The real brain starts empty; the demo starts with an example ontology and graph.
  for (const type of EXAMPLE_TYPES) brain.upsertType(type);
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
    name: 'criar-repositorio',
    description: 'Cria um repositório na organização com o template do time.',
    appliesTo: null,
    trigger: 'pedirem um repositório novo',
    autonomy: 'ask',
    steps: [
      { id: 'conferir', label: 'Conferir que o nome está livre na organização', how: 'gh repo view acme/{{repo}} deve falhar' },
      { id: 'criar', label: 'Criar o repositório', how: 'gh repo create acme/{{repo}} --template acme/base --private' },
      { id: 'proteger', label: 'Proteger a branch main', how: 'gh api repos/acme/{{repo}}/branches/main/protection' },
      { id: 'avisar', label: 'Avisar com o link', how: 'show_ui link para o repositório' },
    ],
    instructions: 'Use o gh autenticado como o desenvolvedor.',
    learnedFrom: null,
    variationOf: null,
  });
  for (let i = 0; i < 4; i++) {
    const run = brain.startRun('criar-repositorio', 'chat:seed');
    for (const step of ['conferir', 'criar', 'proteger', 'avisar']) brain.updateRunStep(run.id, step, 'done');
  }
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
    variationOf: null,
  });
  for (let i = 0; i < 2; i++) {
    const run = brain.startRun('teste-valor-fixo', 'chat:seed');
    for (const s of ['log', 'diff', 'fix', 'ci']) brain.updateRunStep(run.id, s, 'done');
  }
}
seed();
seedAgents();
seedPipeline();

/** Procedures that hand data to each other, and an esteira linking them (with a branch). */
function seedPipeline() {
  if (brain.pipeline('entrega-do-portal')) return;
  const pb = (name: string, description: string, steps: Array<[string, string, string]>, outputs: Array<[string, string]>) =>
    brain.savePlaybook({
      name, description, trigger: '', appliesTo: null, autonomy: 'ask', instructions: '', learnedFrom: null, variationOf: null,
      steps: steps.map(([id, label, how]) => ({ id, label, how })),
      outputs: outputs.map(([n, d]) => ({ name: n, description: d })),
    });
  pb('acompanhar-workflow-dev', 'Acompanha o workflow de dev e pede correção ao Claude Code quando falha.', [
    ['abrir', 'Abrir o workflow de {{repo}}', 'gh run list --repo {{repo}}'],
    ['acompanhar', 'Acompanhar até terminar', 'gh run watch; se falhar, claude_code_prepare_fix'],
  ], [['versao', 'tag gerada pelo workflow'], ['pr_url', 'PR que entrou na develop']]);
  pb('promover-front-hml', 'Promove a versão do front para homologação.', [
    ['deploy', 'Disparar o deploy de homologação da {{versao}}', 'gh workflow run deploy-hml.yml -f versao={{versao}}'],
    ['conferir', 'Conferir a URL de homologação', 'browser_act navigate'],
  ], [['url_hml', 'URL de homologação'], ['evidencia', 'print da tela em HML']]);
  pb('promover-api-hml', 'Promove a API para homologação pelo ArgoCD.', [
    ['sync', 'Sincronizar a imagem {{imagem}} no ArgoCD', 'argocd app set --image {{imagem}}'],
  ], [['url_hml', 'URL de homologação']]);
  pb('abrir-gmud', 'Abre a GMUD no portal de mudanças.', [
    ['abrir', 'Abrir a GMUD da versão {{versao}}', 'browser_act no portal de mudanças'],
    ['anexar', 'Anexar a evidência {{evidencia}}', 'browser_act upload'],
  ], [['numero_gmud', 'número da GMUD aberta']]);
  pb('preencher-gmud', 'Preenche a GMUD aberta.', [
    ['preencher', 'Preencher a GMUD {{numero}}', 'browser_act no formulário'],
  ], []);
  brain.savePipeline({
    name: 'entrega-do-portal',
    description: 'Leva uma mudança do workflow de dev até a GMUD preenchida.',
    inputs: [{ name: 'repo', description: 'repositório' }, { name: 'tipo', description: 'front ou backend', options: ['front', 'backend'] }],
    stages: [
      { id: 'dev', label: 'Workflow dev', passage: 'auto', options: [{ playbook: 'acompanhar-workflow-dev' }] },
      { id: 'hml', label: 'Homologação', passage: 'auto', options: [
        { playbook: 'promover-front-hml', when: { field: 'tipo', equals: 'front' } },
        { playbook: 'promover-api-hml', when: { field: 'tipo', equals: 'backend' } },
      ] },
      { id: 'gmud', label: 'Abrir GMUD', passage: 'ask', options: [{ playbook: 'abrir-gmud' }] },
      { id: 'preencher', label: 'Preencher GMUD', passage: 'auto', options: [{ playbook: 'preencher-gmud', map: { numero: 'gmud.numero_gmud' } }] },
    ],
  });
}

/** A connected coding agent, one finished request and one suggestion, so the Agentes screen has something. */
function seedAgents() {
  if (agents.clients.list().length > 0) return;
  const { client, token } = agents.clients.create('Claude Code · notebook');
  console.log(`[demo] agente de exemplo conectado; token MCP: ${token}`);
  const conv = conversations.create('criar-repositorio: repositório para o extrato');
  const req = agents.requests.add({ clientId: client.id, conversationId: conv.id, task: 'Criar o repositório acme/extrato-front com o template do time', procedure: 'criar-repositorio', context: { repo: 'acme/portal-clientes-front', branch: 'feature/extrato' } });
  agents.requests.finish(req.id, { status: 'done', summary: 'Repositório acme/extrato-front criado e com a main protegida.', links: ['https://github.com/acme/extrato-front'] });
  agents.suggestions.add('Claude Code · notebook', {
    name: 'abrir-pr-de-release',
    description: 'Abrir o PR de release da develop para a main com o changelog da sprint.',
    trigger: 'fim da sprint, depois do code freeze',
    steps: [
      { id: 'changelog', label: 'Gerar o changelog', how: 'git log --oneline main..develop, agrupado por tipo de commit' },
      { id: 'pr', label: 'Abrir o PR develop → main', how: 'gh pr create --base main --head develop --title "Release {{versao}}"' },
      { id: 'revisores', label: 'Pedir revisão do tech lead', how: 'gh pr edit --add-reviewer {{tech_lead}}' },
    ],
    instructions: 'Só depois do code freeze. Se houver PR aberto para a develop, avise antes.',
    why: 'Fiz isso nas últimas 3 sprints, sempre igual.',
    similarTo: [],
  });
}

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
    const plumbing = t.startsWith('<signal') && !/tool-approval|followup|agent-request|secret-saved|pipeline|review/.test(t.slice(0, 200));
    if (msgs[i].role === 'user' && !plumbing) { lastUser = i; break; }
  }
  const said = lastUser >= 0 ? textOf(msgs[lastUser]).toLowerCase() : '';
  if (process.env.DEMO_DEBUG) console.log('[demo] roles', msgs.map((m) => m.role).join(','), '| said:', said.slice(0, 300));
  const toolsSince = msgs.slice(lastUser + 1).filter((m) => m.role === 'toolResult').length;
  await sleep(600);

  if (said.includes('<demonstracao')) return fromDemonstration(textOf(msgs[lastUser]), toolsSince);
  // The review at the end of an execution: a line, or (with problems) what would be fixed.
  if (said.includes('revisão da execução')) {
    return fauxAssistantMessage(fauxText(said.includes('brain_learn') ? 'Revisei: vou propor as correções num cartão para você aprovar.' : 'Revisão: tudo certo.'));
  }
  const pipeline = pipelineScenario(msgs, said, lastUser);
  if (pipeline) return pipeline;
  const fromAgent = msgs.some((m) => textOf(m).includes('<agent-request'));
  if (fromAgent) return agentScenario(said, toolsSince);
  const secret = secretScenario(said);
  if (secret) return secret;
  const similar = similarScenario(said, toolsSince);
  if (similar) return similar;
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

/** "Já sei algo parecido?": deleting a repo looks like creating one, which Orbi knows. */
function similarScenario(said: string, toolsSince: number) {
  if (said.includes('criar versão a partir deste')) {
    const base = brain.playbook('criar-repositorio')!;
    return call('brain_learn', {
      reason: 'versão de criar-repositorio para apagar',
      items: [{ kind: 'playbook', payload: {
        name: 'deletar-repositorio',
        variationOf: 'criar-repositorio',
        description: 'Apaga um repositório da organização depois de conferir PRs abertos.',
        trigger: 'pedirem para apagar um repositório',
        autonomy: 'ask',
        steps: [
          { id: 'conferir', label: 'Conferir que o repositório existe e é da organização', how: 'gh repo view acme/{{repo}}' },
          { id: 'prs', label: 'Listar PRs abertos; se houver, mostrar e perguntar', how: 'gh pr list -R acme/{{repo}}' },
          { id: 'criar', label: 'Apagar o repositório', how: 'gh repo delete acme/{{repo}} --yes' },
          base.steps[3],
        ],
        instructions: base.instructions,
      } }],
    }, 'Montei a versão nova a partir do criar-repositorio. Confira as diferenças:');
  }
  if (said.includes('aprender do zero')) return call('ask_developer', { question: 'Combinado. Como você apaga um repositório hoje?', options: [] });
  if (said.includes('era isso mesmo')) return fauxAssistantMessage(fauxText('Certo, sigo o criar-repositorio.'));
  if (said.includes('tool-approval-result') && said.includes('deletar-repositorio')) {
    return fauxAssistantMessage(fauxText('Guardei o **deletar-repositorio** como variação do criar-repositorio. Quando você confirmar, apago o teste-orbi.'));
  }
  const deleting = /delet|apag|remov/.test(said) && said.includes('reposit');
  const creating = /\bcri(a|ar)\b/.test(said) && said.includes('reposit');
  if (!deleting && !creating) return undefined;
  if (toolsSince === 0) return call('playbook_similar', { text: deleting ? 'deletar repositório no GitHub' : 'criar repositório no GitHub' });
  if (creating) {
    if (toolsSince === 1) return call('similar_found', { verdict: 'same', playbook: 'criar-repositorio' });
    return fauxAssistantMessage(fauxText('Sigo o criar-repositorio: qual nome você quer?'));
  }
  return call('similar_found', {
    verdict: 'similar',
    playbook: 'criar-repositorio',
    known: 'Antes de agir: sei **criar** repositório, mas **deletar** você ainda não me ensinou. Não vou usar o de criar para isso.',
    relation: 'parecido, não igual',
    reuse: ['Usar o gh com a sua conta', 'Conferir que o repositório é da organização', 'Avisar no fim com o link'],
    changes: ['gh repo create vira gh repo delete', 'Não tem volta: sempre peço sua aprovação', 'Conferir se há PRs abertos antes (a confirmar)'],
    suggestion: 'uma versão nova, deletar-repositorio, partindo do de criar. Separada, porque deletar não tem volta e precisa de outra autonomia.',
    options: [{ label: 'Criar versão a partir deste' }, { label: 'É outra coisa: aprender do zero' }, { label: 'Era isso mesmo' }],
  });
}

/** A coding agent delegated criar-repositorio over MCP: run it; creating waits for the developer. */
function agentScenario(said: string, toolsSince: number) {
  if (said.includes('negou')) return call('agent_reply', { status: 'failed', summary: 'O desenvolvedor não aprovou criar o repositório. Nada foi criado.' });
  if (said.includes('tool-approval') || said.includes('aprovou')) {
    const after = [
      () => call('playbook_step', { stepId: 'criar', status: 'done', note: 'acme/pagamentos-v2 criado' }),
      () => call('playbook_step', { stepId: 'proteger', status: 'done', note: 'main protegida' }),
      () => call('playbook_step', { stepId: 'avisar', status: 'done' }),
      () => call('agent_reply', { status: 'done', summary: 'Repositório acme/pagamentos-v2 criado com o template do time e a main protegida.', links: ['https://github.com/acme/pagamentos-v2'] }),
    ];
    return (after[toolsSince] ?? (() => fauxAssistantMessage(fauxText('Feito. Avisei o Claude Code.'))))();
  }
  const script = [
    () => call('playbook_start', { name: 'criar-repositorio', params: { repo: 'pagamentos-v2' } }, 'Pedido do Claude Code: vou rodar o **criar-repositorio** para acme/pagamentos-v2.'),
    () => call('playbook_step', { stepId: 'conferir', status: 'done', note: 'nome livre na organização' }),
    () => call('playbook_step', { stepId: 'criar', status: 'running' }),
    () => call('run_command', { binary: 'gh', args: ['repo', 'create', 'acme/pagamentos-v2', '--template', 'acme/base', '--private'], purpose: 'Criar o repositório pedido pelo Claude Code' }),
  ];
  return (script[toolsSince] ?? (() => fauxAssistantMessage(fauxText('Criar o repositório espera a sua aprovação. O Claude Code vê "esperando o desenvolvedor".'))))();
}

/** Teaching a login: Orbi asks for the password in a card that saves straight to the vault. */
function secretScenario(said: string) {
  if (said.includes('secret-saved') || said.includes('guardou a credencial')) {
    return fauxAssistantMessage(fauxText('Pronto: no login vou usar `{{segredo:github/senha}}`. O valor fica só no cofre; eu nunca vejo.'));
  }
  if (/senha|login|logar/.test(said) && said.includes('github')) {
    return call('ask_secret', { name: 'github/senha', description: 'Senha do GitHub', reason: 'Para entrar no GitHub pelo navegador antes de apagar o repositório.' },
      'Para entrar no GitHub preciso da sua senha. Não cole aqui na conversa: digite no cartão abaixo, que guarda direto no cofre.');
  }
  return undefined;
}

/**
 * Plays the agent in an esteira the way the prompt asks: start it when asked
 * for a delivery, run exactly what the engine says (playbook_start with its
 * JSON), mark each step done handing over fake outputs, and stop when told.
 */
function pipelineScenario(msgs: Msg[], said: string, lastUser: number) {
  // The last thing that matters: a tool result, or what was said (skipping notices like "System instructions updated").
  let tail = msgs.length - 1;
  while (tail > 0 && msgs[tail].role !== 'toolResult' && tail > lastUser) tail--;
  const last = msgs[tail]?.role === 'toolResult' ? msgs[tail] : msgs[lastUser];
  const lastText = last ? textOf(last) : '';
  const fakeValue = (name: string) =>
    ({ versao: '2.5.0', pr_url: 'https://github.com/acme/portal/pull/412', url_hml: 'https://hml.acme.internal/portal', evidencia: 'evidencia-hml.png', numero_gmud: 'CHG0041877' })[name] ?? `${name}-demo`;
  if (last?.role === 'user' && /entreg/.test(said) && /portal/.test(said) && !said.includes('<')) {
    const destination = /gmud/.test(said) ? (/(preench)/.test(said) ? 'preencher' : 'gmud') : undefined;
    return call('pipeline_start', { name: 'entrega-do-portal', inputs: { repo: 'acme/portal', tipo: /backend|api/.test(said) ? 'backend' : 'front' }, ...(destination ? { destination } : {}) },
      `Vou levar o acme/portal pela esteira **entrega-do-portal**${destination ? ` até ${destination === 'gmud' ? 'abrir a GMUD' : 'preencher a GMUD'}` : ''}.`);
  }
  const start = lastText.match(/rode agora o procedimento [\w-]+ com playbook_start (\{.*?\})\./);
  if (start) return call('playbook_start', JSON.parse(start[1].replace(/\\"/g, '"')));
  if (last?.role !== 'toolResult') {
    if (/<pipeline/.test(lastText) && /encerrou|pare/.test(lastText)) return fauxAssistantMessage(fauxText('Combinado, parei aqui.'));
    return undefined;
  }
  // After playbook_start: walk its steps; after the last, hand over the outputs.
  let startIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'toolResult' && textOf(msgs[i]).includes('"runId"')) { startIdx = i; break; }
  if (startIdx < 0 || !msgs.some((m) => /Começou a esteira|<pipeline/.test(textOf(m)))) return undefined;
  const started = JSON.parse(textOf(msgs[startIdx]).slice(textOf(msgs[startIdx]).indexOf('{'))) as { steps: Array<{ id: string }>; outputs?: Array<{ name: string }> };
  const done = msgs.slice(startIdx + 1).filter((m) => m.role === 'toolResult').length;
  if (done < started.steps.length) {
    const lastStep = done === started.steps.length - 1;
    const outputs = lastStep && started.outputs?.length ? Object.fromEntries(started.outputs.map((o) => [o.name, fakeValue(o.name)])) : undefined;
    return call('playbook_step', { stepId: started.steps[done].id, status: 'done', ...(outputs ? { outputs } : {}) });
  }
  if (/Resuma|chegou/.test(lastText)) return fauxAssistantMessage(fauxText('Pronto: a entrega chegou onde você pediu. Os dados estão na faixa no topo da conversa.'));
  if (/autorização|faltam|parou/.test(lastText)) return fauxAssistantMessage(fauxText('Parei aqui: a próxima etapa espera você na faixa no topo da conversa.'));
  return undefined;
}
