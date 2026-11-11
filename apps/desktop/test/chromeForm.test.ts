import { describe, expect, it } from 'vitest';
import { changed, formOf, requestOf, restartNote, urlHint } from '../src/views/autonomy/mcp/chromeForm';
import type { ChromeSettings } from '../src/api';

const saved: ChromeSettings = {
  browser: 'proprio', browserUrl: null, showWindow: true, autostart: true, profileDir: '/dados/chrome-profile',
  executablePath: null, detected: '/usr/bin/google-chrome', detectError: null, port: 8931, debugPort: 9333,
};

describe('navegador do Orbi (Configurações › Ferramentas MCP)', () => {
  it('em branco é o padrão; endereço só com o seu Chrome; pasta só com o perfil próprio', () => {
    expect(requestOf({ ...formOf(saved), executablePath: '  ', browserUrl: 'http://127.0.0.1:9222' })).toEqual({
      browser: 'proprio', browserUrl: null, showWindow: true, autostart: true, profileDir: '/dados/chrome-profile', executablePath: null,
    });
    expect(requestOf({ ...formOf(saved), browser: 'seu', browserUrl: ' http://127.0.0.1:9222 ' })).toMatchObject({ browserUrl: 'http://127.0.0.1:9222', profileDir: null });
  });

  it('só salva quando mudou algo', () => {
    expect(changed(saved, formOf(saved))).toBe(false);
    expect(changed(saved, { ...formOf(saved), showWindow: false })).toBe(true);
  });

  it('o endereço do seu Chrome é desta máquina, com porta', () => {
    expect(urlHint(formOf(saved))).toBeUndefined();
    expect(urlHint({ ...formOf(saved), browser: 'seu', browserUrl: '' })).toMatch(/Informe/);
    expect(urlHint({ ...formOf(saved), browser: 'seu', browserUrl: 'http://10.0.0.2:9222' })).toMatch(/local/);
    expect(urlHint({ ...formOf(saved), browser: 'seu', browserUrl: 'http://localhost:9222' })).toBeUndefined();
  });

  it('avisa o que reiniciar faz', () => {
    expect(restartNote(formOf(saved))).toMatch(/fecha as abas/);
    expect(restartNote({ ...formOf(saved), browser: 'seu' })).toMatch(/continuam abertas/);
    expect(restartNote({ ...formOf(saved), autostart: false })).toMatch(/desliga o navegador/);
  });
});
