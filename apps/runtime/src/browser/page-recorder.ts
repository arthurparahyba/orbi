/// <reference lib="dom" />
/**
 * Runs inside every page while a demonstration is being recorded. It reports
 * what the developer does in terms a person (and a later re-run) understands:
 * the role and accessible name of the element, its label, never a brittle CSS
 * path. Values typed into credential fields are flagged so the runtime moves
 * them straight into the vault.
 *
 * Kept as a plain function so it can be serialized with `toString()`. Some
 * toolchains (tsx/esbuild keepNames) wrap inner functions in a `__name` helper,
 * so the serialized script brings a no-op one along.
 */
export const pageRecorderScript = (binding: string) =>
  `(() => { const __name = (f) => f; (${pageRecorder.toString()})(${JSON.stringify(binding)}); })()`;

export function pageRecorder(binding: string) {
  const w = window as unknown as Record<string, unknown>;
  if (w.__orbiRecInstalled) return;
  w.__orbiRecInstalled = true;

  const send = (event: Record<string, unknown>) => {
    if (w.__orbiRecOff) return;
    const fn = w[binding] as ((json: string) => void) | undefined;
    try { fn?.(JSON.stringify({ ...event, at: Date.now(), url: location.href, title: document.title })); } catch { /* page closing */ }
  };

  const clean = (s: string | null | undefined, max = 80) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const SECRET_HINT = /pass|senha|secret|segredo|token|otp|mfa|2fa|totp|pin\b|cvv|api[-_ ]?key|chave/i;
  const USER_HINT = /user|login|usu[aá]rio|e-?mail|matr[ií]cula|cpf/i;

  const labelOf = (el: Element): string => {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
      if (clean(text)) return clean(text);
    }
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length) return clean(labels[0].textContent);
    const wrap = el.closest('label');
    if (wrap) return clean(wrap.textContent);
    return clean(el.getAttribute('placeholder') || el.getAttribute('title') || '');
  };

  const roleOf = (el: Element): string => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || (tag === 'input' && ['button', 'submit', 'reset'].includes(type))) return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') return type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : 'textbox';
    if (tag === 'summary') return 'button';
    return tag;
  };

  const describe = (el: Element) => {
    const label = labelOf(el);
    const text = clean((el as HTMLElement).innerText || el.textContent, 80);
    return {
      role: roleOf(el),
      name: label || text || clean(el.getAttribute('value')) || clean(el.getAttribute('alt')),
      label,
      text,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') ?? undefined,
      id: el.id || undefined,
      nameAttr: el.getAttribute('name') ?? undefined,
      testId: el.getAttribute('data-testid') ?? el.getAttribute('data-test') ?? undefined,
      placeholder: el.getAttribute('placeholder') ?? undefined,
      href: el instanceof HTMLAnchorElement ? el.href : undefined,
      // Where on the page: the nearest heading, active tab or dialog title.
      context: clean(
        el.closest('[role=dialog],[role=tabpanel],section,form,fieldset')?.querySelector('h1,h2,h3,legend,[role=heading]')?.textContent ?? '',
        60,
      ) || undefined,
    };
  };

  const isCredential = (el: Element): 'secret' | 'user' | null => {
    const input = el as HTMLInputElement;
    const type = (input.type ?? '').toLowerCase();
    const auto = (el.getAttribute('autocomplete') ?? '').toLowerCase();
    const hint = `${input.name ?? ''} ${el.id} ${labelOf(el)} ${el.getAttribute('placeholder') ?? ''}`;
    if (type === 'password' || /password|one-time-code|cc-number|cc-csc/.test(auto) || SECRET_HINT.test(hint)) return 'secret';
    const form = el.closest('form') ?? document;
    if ((auto === 'username' || USER_HINT.test(hint)) && form.querySelector('input[type=password]')) return 'user';
    return null;
  };

  const INTERACTIVE =
    'a,button,summary,select,textarea,input,label,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],[role=treeitem],[onclick]';
  const isTextField = (el: Element) =>
    el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image'].includes(((el as HTMLInputElement).type || 'text').toLowerCase())) ||
    (el as HTMLElement).isContentEditable;

  const fieldEvent = (el: Element, kind: string) => {
    const input = el as HTMLInputElement;
    const cred = isCredential(el);
    if (el.tagName === 'SELECT') {
      const sel = el as HTMLSelectElement;
      send({ kind: 'select', target: describe(el), value: clean(sel.selectedOptions[0]?.textContent ?? sel.value) });
    } else if (input.type === 'checkbox' || input.type === 'radio') {
      send({ kind: 'check', target: describe(el), checked: input.checked });
    } else {
      const value = (el as HTMLElement).isContentEditable ? (el as HTMLElement).innerText : input.value;
      send({ kind, target: describe(el), value, credential: cred ?? undefined });
    }
  };

  document.addEventListener('click', (e) => {
    const raw = e.target as Element | null;
    if (!raw || !(raw instanceof Element)) return;
    const el = raw.closest(INTERACTIVE) ?? raw;
    if (isTextField(el)) return; // focusing a field: its value is recorded on change
    if (el.tagName === 'LABEL' && (el as HTMLLabelElement).control) return; // the control's change event covers it
    if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes((el as HTMLInputElement).type)) return;
    send({ kind: 'click', target: describe(el) });
  }, true);

  document.addEventListener('change', (e) => {
    const el = e.target as Element | null;
    if (el && el instanceof Element) fieldEvent(el, 'fill');
  }, true);

  document.addEventListener('keydown', (e) => {
    const el = e.target as Element | null;
    if (!el || !(el instanceof Element) || e.key !== 'Enter' || !isTextField(el) || el.tagName === 'TEXTAREA') return;
    fieldEvent(el, 'fill'); // Enter may submit before `change` fires
    send({ kind: 'key', key: 'Enter', target: describe(el) });
  }, true);

  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    send({ kind: 'submit', target: { ...describe(form), name: clean(form.getAttribute('aria-label') || form.name || form.id || form.querySelector('h1,h2,legend')?.textContent || 'formulário') } });
  }, true);
}
