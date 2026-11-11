import type { ChromeSettings, SetChromeSettings } from '../../../api';

/** The Chrome DevTools form (Autonomia › Ferramentas MCP), without React. */
export type ChromeForm = SetChromeSettings;

export function formOf(s: ChromeSettings): ChromeForm {
  return { browser: s.browser, browserUrl: s.browserUrl, showWindow: s.showWindow, autostart: s.autostart, profileDir: s.profileDir, executablePath: s.executablePath };
}

/** What goes to the runtime: blanks are "use the default", and the address only with "seu Chrome". */
export function requestOf(f: ChromeForm): SetChromeSettings {
  const blank = (x: string | null) => (x && x.trim() ? x.trim() : null);
  return {
    ...f,
    browserUrl: f.browser === 'seu' ? blank(f.browserUrl) : null,
    profileDir: f.browser === 'proprio' ? blank(f.profileDir) : null,
    executablePath: blank(f.executablePath),
  };
}

export function changed(saved: ChromeSettings, f: ChromeForm): boolean {
  return JSON.stringify(requestOf(formOf(saved))) !== JSON.stringify(requestOf(f));
}

/** Said before saving: what the restart does. */
export function restartNote(f: ChromeForm): string {
  if (!f.autostart) return 'Salvar desliga o navegador do Orbi: procedimentos e “Mostrar no navegador” ficam sem navegador até você ligar de novo.';
  return f.browser === 'seu'
    ? 'Salvar reconecta o Orbi ao seu Chrome. Suas abas continuam abertas.'
    : 'Salvar reinicia o navegador do Orbi e fecha as abas dele. Os logins ficam guardados no perfil.';
}

/** A hint before sending, same rule as the runtime: only a Chrome on this machine. */
export function urlHint(f: ChromeForm): string | undefined {
  if (f.browser !== 'seu') return undefined;
  const url = (f.browserUrl ?? '').trim();
  if (!url) return 'Informe o endereço da depuração do seu Chrome.';
  return /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+\/?$/.test(url) ? undefined : 'Use o endereço local, com a porta. Ex.: http://127.0.0.1:9222';
}
