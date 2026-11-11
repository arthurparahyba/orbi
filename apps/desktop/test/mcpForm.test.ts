import { describe, expect, it } from 'vitest';
import { countsLine, headersOf, hintLabel, marksOf, toolsForSave, urlHint } from '../src/views/autonomy/mcp/mcpForm';
import { categoryLabel } from '../src/components/inboxContext';

describe('servidores MCP (Autonomia › Ferramentas MCP)', () => {
  it('cabeçalhos sem nome saem; https ou http só local', () => {
    expect(headersOf([{ name: ' Authorization ', value: 'Bearer {{segredo:jira/token}} ' }, { name: '', value: 'x' }])).toEqual({ Authorization: 'Bearer {{segredo:jira/token}}' });
    expect(urlHint('https://jira.empresa.com.br/mcp')).toBeUndefined();
    expect(urlHint('http://127.0.0.1:9100/mcp')).toBeUndefined();
    expect(urlHint('http://jira.empresa.com.br/mcp')).toMatch(/https/);
    expect(urlHint('')).toMatch(/Informe/);
  });

  it('depois de testar: o tipo que o servidor sugere, a que apaga desligada; salva só o que você mudou', () => {
    const marks = marksOf({ ok: true, tools: [
      { name: 'buscar', description: '', hint: 'leitura', effective: 'leitura' },
      { name: 'comentar', description: '', hint: null, effective: 'escrita' },
      { name: 'apagar', description: '', hint: 'apaga', effective: 'apaga' },
    ] });
    expect(marks.map((m) => [m.name, m.kind, m.enabled])).toEqual([['buscar', 'leitura', true], ['comentar', 'escrita', true], ['apagar', 'escrita', false]]);
    marks[1]!.kind = 'leitura';
    expect(toolsForSave(marks)).toEqual([
      { name: 'buscar', kind: null, enabled: true },
      { name: 'comentar', kind: 'leitura', enabled: true },
      { name: 'apagar', kind: null, enabled: false },
    ]);
  });

  it('textos', () => {
    expect(hintLabel(null)).toMatch(/conta como escrita/);
    expect(countsLine({ leitura: 9, escrita: 4, novas: 0 })).toBe('9 leitura · 4 escrita');
    expect(countsLine({ leitura: 6, escrita: 3, novas: 1 })).toBe('6 leitura · 3 escrita · 1 nova para revisar');
    expect(categoryLabel('mcp:jira:escrita')).toBe('Executar ferramenta');
    expect(categoryLabel('comandos-escrita')).toBe('Executar comando');
  });
});
