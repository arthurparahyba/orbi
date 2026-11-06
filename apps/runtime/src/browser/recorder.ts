import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { ulid } from 'ulidx';
import type { SharedChrome } from './chrome.ts';
import { pageRecorderScript } from './page-recorder.ts';
import { secretName, secretRef, type Vault } from '../vault.ts';
import type { SttSlot } from '../stt.ts';

/** What a recording needs from the rest of Orbi. */
export interface RecorderDeps {
  chrome: Pick<SharedChrome, 'ensure'>;
  vault: Pick<Vault, 'set'>;
  stt: Pick<SttSlot, 'get'>;
}

/**
 * A demonstration: the developer clicks "Ensinar pelo navegador", uses the
 * shared Chrome as usual and, optionally, narrates. We keep two parallel
 * tracks — what was done (browser events) and what was said (transcribed
 * narration) — on one clock, then hand the merged timeline to the agent.
 */
export interface Target {
  role: string; name: string; label?: string; text?: string; tag?: string; type?: string; id?: string;
  nameAttr?: string; testId?: string; placeholder?: string; href?: string; context?: string;
}
export interface DemoAction {
  t: number; // ms since start
  kind: 'navigate' | 'click' | 'fill' | 'select' | 'check' | 'key' | 'submit';
  url: string;
  title?: string;
  tab: number;
  target?: Target;
  value?: string;
  checked?: boolean;
  key?: string;
  /** Credential typed by the developer: stored in the vault under this name, value dropped. */
  secret?: string;
  text: string; // human description, pt-BR
}
export interface NarrationSegment { t: number; durationMs: number; status: 'pending' | 'done' | 'error'; text: string; error?: string }
export interface Recording {
  id: string;
  conversationId: string;
  status: 'recording' | 'transcribing' | 'done' | 'discarded';
  startedAt: string;
  finishedAt?: string;
  startUrl?: string;
  actions: DemoAction[];
  narration: NarrationSegment[];
  secrets: string[];
  narrated: boolean;
  transcriber?: string;
}

const BINDING = '__orbiRec';
const ROLE_PT: Record<string, string> = {
  link: 'o link', button: 'o botão', tab: 'a aba', menuitem: 'o item de menu', option: 'a opção', checkbox: 'a caixa',
  radio: 'a opção', switch: 'a chave', treeitem: 'o item', combobox: 'a lista', textbox: 'o campo',
};
const quote = (s?: string) => (s ? `"${s}"` : '');

export function describeAction(a: Omit<DemoAction, 'text'>): string {
  const t = a.target;
  const what = t ? `${ROLE_PT[t.role] ?? 'o elemento'} ${quote(t.name || t.label || t.placeholder || t.id)}`.trim() : '';
  const where = t?.context ? ` (em "${t.context}")` : '';
  switch (a.kind) {
    case 'navigate': return `Abriu ${a.url}${a.title ? ` — página "${a.title}"` : ''}${a.tab > 1 ? ` (aba ${a.tab})` : ''}`;
    case 'click': return `Clicou n${what.startsWith('a ') ? 'a' : 'o'} ${what.replace(/^(o|a) /, '')}${where}`;
    case 'fill': return `Preencheu ${what}${where} com ${a.secret ? secretRef(a.secret) + ' (credencial guardada no cofre)' : quote(a.value)}`;
    case 'select': return `Escolheu ${quote(a.value)} em ${what}${where}`;
    case 'check': return `${a.checked ? 'Marcou' : 'Desmarcou'} ${what}${where}`;
    case 'key': return `Apertou ${a.key} em ${what}`;
    case 'submit': return `Enviou o formulário ${quote(t?.name)}`;
  }
}

const sameTarget = (a?: Target, b?: Target) =>
  !!a && !!b && (a.id || a.nameAttr || a.testId || a.label || a.name) === (b.id || b.nameAttr || b.testId || b.label || b.name);

class RecordingSession {
  readonly rec: Recording;
  private browser?: Browser;
  private pages = new Map<Page, { tab?: number; scriptId?: string; ready: Promise<void> }>();
  private started = Date.now();
  private transcriptions: Promise<void>[] = [];

  constructor(private readonly deps: RecorderDeps, conversationId: string, startUrl: string | undefined, narrated: boolean) {
    this.rec = {
      id: `rec_${ulid().toLowerCase()}`, conversationId, status: 'recording', startedAt: new Date(this.started).toISOString(),
      startUrl, actions: [], narration: [], secrets: [], narrated, transcriber: narrated ? deps.stt.get()?.name : undefined,
    };
  }

  async start() {
    const browserURL = await this.deps.chrome.ensure();
    this.browser = await puppeteer.connect({ browserURL, defaultViewport: null });
    this.browser.on('targetcreated', async (target) => {
      if (target.type() !== 'page' || this.rec.status !== 'recording') return;
      const page = await target.page();
      if (page) await this.attach(page);
    });
    for (const page of await this.browser.pages()) await this.attach(page);
    const page = this.rec.startUrl ? await this.browser.newPage() : (await this.browser.pages()).at(-1) ?? (await this.browser.newPage());
    await this.attach(page);
    await page.bringToFront();
    if (this.rec.startUrl) await page.goto(this.rec.startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  private attach(page: Page): Promise<void> {
    const known = this.pages.get(page);
    if (known) return known.ready;
    const info: { tab?: number; scriptId?: string; ready: Promise<void> } = { ready: Promise.resolve() };
    this.pages.set(page, info);
    // Listeners first, synchronously: a navigation right after attach must not be missed.
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame() || this.rec.status !== 'recording') return;
      const url = frame.url();
      if (!/^https?:/.test(url)) return;
      const tab = this.tabOf(page);
      const last = [...this.rec.actions].reverse().find((a) => a.tab === tab && a.kind === 'navigate');
      if (last?.url === url) return;
      this.push({ t: Date.now() - this.started, kind: 'navigate', url, tab });
    });
    page.on('load', async () => {
      const title = await page.title().catch(() => '');
      const tab = this.pages.get(page)?.tab;
      const nav = [...this.rec.actions].reverse().find((a) => a.tab === tab && a.kind === 'navigate' && a.url === page.url());
      if (nav && title) { nav.title = title; nav.text = describeAction(nav); }
    });
    info.ready = (async () => {
      if (page.isClosed()) return;
      try {
        await page.exposeFunction(BINDING, (json: string) => this.onPageEvent(page, json));
        const script = pageRecorderScript(BINDING);
        info.scriptId = (await page.evaluateOnNewDocument(script)).identifier;
        await page.evaluate(script).catch(() => {});
      } catch {
        /* page closed while attaching */
      }
    })();
    return info.ready;
  }

  /** Tabs are numbered in the order the developer first uses them. */
  private tabOf(page: Page): number {
    const info = this.pages.get(page)!;
    info.tab ??= 1 + [...this.pages.values()].filter((i) => i.tab !== undefined).length;
    return info.tab;
  }

  private async onPageEvent(page: Page, json: string) {
    if (this.rec.status !== 'recording') return;
    const e = JSON.parse(json) as { kind: DemoAction['kind']; at: number; url: string; title: string; target?: Target; value?: string; checked?: boolean; key?: string; credential?: 'secret' | 'user' };
    const tab = this.tabOf(page);
    const action: Omit<DemoAction, 'text'> = {
      t: Math.max(0, e.at - this.started), kind: e.kind, url: e.url, title: e.title, tab, target: e.target,
      value: e.value, checked: e.checked, key: e.key,
    };
    if (e.kind === 'fill' && e.credential && e.value) {
      // Straight into the vault: the value is never kept in the recording, the brain or the prompt.
      const host = new URL(e.url).hostname;
      const field = e.target?.label || e.target?.nameAttr || e.target?.id || (e.credential === 'user' ? 'usuario' : 'senha');
      const name = secretName(host, field);
      await this.deps.vault.set(name, e.value, {
        description: `${e.credential === 'user' ? 'Usuário' : 'Credencial'} de ${host}`,
        origin: `${e.url} · campo ${quote(field)}`,
      });
      action.secret = name;
      delete action.value;
      if (!this.rec.secrets.includes(name)) this.rec.secrets.push(name);
    }
    if (e.kind === 'fill' && !e.value && !action.secret) return;
    this.push(action);
  }

  private push(action: Omit<DemoAction, 'text'>) {
    const list = this.rec.actions;
    const last = list.at(-1);
    // Typing then Enter (or blur) reports the same field twice: keep the final value.
    if (action.kind === 'fill' && last?.kind === 'fill' && sameTarget(last.target, action.target)) list.pop();
    // A submit right after clicking its button adds nothing.
    if (action.kind === 'submit' && last && (last.kind === 'click' || last.kind === 'key') && action.t - last.t < 1500) return;
    list.push({ ...action, text: describeAction(action) });
  }

  addAudio(startedAtEpoch: number, durationMs: number, wav: Buffer) {
    const t = this.deps.stt.get();
    const seg: NarrationSegment = { t: Math.max(0, startedAtEpoch - this.started), durationMs, status: 'pending', text: '' };
    this.rec.narration.push(seg);
    this.rec.narration.sort((a, b) => a.t - b.t);
    if (!t) { seg.status = 'error'; seg.error = 'transcrição desligada (ORBI_STT=off)'; return seg; }
    const job = t.transcribe(wav).then(
      (text) => { seg.text = text; seg.status = 'done'; },
      (error: unknown) => { seg.status = 'error'; seg.error = error instanceof Error ? error.message : String(error); },
    );
    this.transcriptions.push(job);
    return seg;
  }

  async stop(discard = false) {
    if (this.rec.status !== 'recording') return this.rec;
    this.rec.status = discard ? 'discarded' : 'transcribing';
    this.rec.finishedAt = new Date().toISOString();
    for (const [page, info] of this.pages) {
      if (page.isClosed()) continue;
      await page.evaluate(() => { (window as unknown as Record<string, unknown>).__orbiRecOff = true; }).catch(() => {});
      if (info.scriptId) await page.removeScriptToEvaluateOnNewDocument(info.scriptId).catch(() => {});
      await page.removeExposedFunction(BINDING).catch(() => {});
    }
    await this.browser?.disconnect().catch(() => {});
    if (!discard) {
      await Promise.race([Promise.allSettled(this.transcriptions), new Promise((r) => setTimeout(r, 180_000))]);
      this.rec.status = 'done';
    }
    return this.rec;
  }
}

const mmss = (ms: number) => `${String(Math.floor(ms / 60_000)).padStart(2, '0')}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

/** The merged timeline the agent reads: actions and narration on one clock. */
export function timeline(rec: Recording): string {
  const items = [
    ...rec.actions.map((a) => ({ t: a.t, line: `[${mmss(a.t)}] AÇÃO  ${a.text}${a.target ? `  {${[a.target.role, a.target.label && `rótulo=${quote(a.target.label)}`, a.target.testId && `testid=${a.target.testId}`, a.target.id && `id=${a.target.id}`, a.target.nameAttr && `name=${a.target.nameAttr}`].filter(Boolean).join(' ')}}` : ''}` })),
    ...rec.narration.filter((n) => n.status === 'done' && n.text).map((n) => ({ t: n.t, line: `[${mmss(n.t)}] FALA  "${n.text}"` })),
  ].sort((a, b) => a.t - b.t);
  return items.map((i) => i.line).join('\n');
}

export function demonstrationMessage(rec: Recording): string {
  const duration = rec.finishedAt ? Date.parse(rec.finishedAt) - Date.parse(rec.startedAt) : 0;
  return [
    `<demonstracao id="${rec.id}" duracao="${mmss(duration)}" acoes="${rec.actions.length}" falas="${rec.narration.filter((n) => n.status === 'done' && n.text).length}">`,
    timeline(rec) || '(nenhuma ação registrada)',
    '</demonstracao>',
    '',
    'Acabei de te mostrar um procedimento no navegador' + (rec.narrated ? ', explicando em voz alta' : '') + '. ' +
      'Monte o passo a passo completo seguindo a skill aprender-procedimento (seção "Aprender por demonstração") e me peça aprovação para guardar.',
    rec.secrets.length ? `Credenciais que digitei já estão no cofre: ${rec.secrets.map(secretRef).join(', ')}. Use só essas referências.` : '',
  ].filter(Boolean).join('\n');
}

// ── registry ────────────────────────────────────────────────────────────────
export type Recorder = ReturnType<typeof createRecorder>;

/** The recordings of this process (one at a time). */
export function createRecorder(deps: RecorderDeps) {
  const sessions = new Map<string, RecordingSession>();
  return {
    async start(conversationId: string, opts: { url?: string; narrated?: boolean } = {}): Promise<Recording> {
      const active = [...sessions.values()].find((s) => s.rec.status === 'recording');
      if (active) throw new Error(`já existe uma gravação em andamento (${active.rec.id})`);
      const s = new RecordingSession(deps, conversationId, opts.url, opts.narrated ?? true);
      sessions.set(s.rec.id, s);
      try {
        await s.start();
      } catch (error) {
        sessions.delete(s.rec.id);
        throw error;
      }
      return s.rec;
    },
    get: (id: string) => sessions.get(id)?.rec,
    active: () => [...sessions.values()].find((s) => s.rec.status === 'recording')?.rec,
    addAudio(id: string, startedAt: number, durationMs: number, wav: Buffer) {
      const s = sessions.get(id);
      if (!s) throw new Error('gravação não encontrada');
      return s.addAudio(startedAt, durationMs, wav);
    },
    async stop(id: string, discard = false) {
      const s = sessions.get(id);
      if (!s) throw new Error('gravação não encontrada');
      return s.stop(discard);
    },
  };
}
