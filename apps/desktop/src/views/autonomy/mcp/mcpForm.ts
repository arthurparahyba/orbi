import type { McpServer, McpTestResult, McpToolKind } from '../../../api';

/** The MCP server screens (Autonomia › Ferramentas MCP), without React. */

export type HeaderRow = { name: string; value: string };
export type ToolMark = { name: string; description: string; hint: McpToolKind | null; kind: 'leitura' | 'escrita'; enabled: boolean };

export const secretRef = (name: string) => `{{segredo:${name}}}`;

/** Rows with a name become headers; empty rows are dropped. */
export function headersOf(rows: HeaderRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), r.value.trim()]));
}

/** The address: https, or http only on this machine (the runtime checks the same). */
export function urlHint(url: string): string | undefined {
  const u = url.trim();
  if (!u) return 'Informe o endereço do servidor.';
  if (/^https:\/\/[^\s/]+/.test(u)) return undefined;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(u)) return undefined;
  return 'Use https (ou http só em 127.0.0.1).';
}

/** After "Testar conexão": each tool with the type the server suggests; one that deletes starts off. */
export function marksOf(result: Extract<McpTestResult, { ok: true }>): ToolMark[] {
  return result.tools.map((t) => ({ name: t.name, description: t.description, hint: t.hint, kind: t.effective === 'leitura' ? 'leitura' : 'escrita', enabled: t.effective !== 'apaga' }));
}

/** What goes to the runtime: your mark only where it differs from what the server says. */
export function toolsForSave(marks: ToolMark[]): Array<{ name: string; kind: 'leitura' | 'escrita' | null; enabled: boolean }> {
  return marks.map((m) => {
    const suggested = m.hint === 'leitura' ? 'leitura' : 'escrita';
    return { name: m.name, kind: m.kind === suggested ? null : m.kind, enabled: m.enabled };
  });
}

/** "Como sei": where the type came from, in words. */
export function hintLabel(hint: McpToolKind | null): string {
  if (hint === 'leitura') return 'o servidor diz que só lê';
  if (hint === 'apaga') return 'o servidor diz que apaga';
  if (hint === 'escrita') return 'o servidor diz que altera';
  return 'sem informação: conta como escrita';
}

/** "9 leitura · 4 escrita · 3 novas" */
export function countsLine(c: McpServer['counts']): string {
  return [`${c.leitura} leitura`, `${c.escrita} escrita`, ...(c.novas ? [`${c.novas} ${c.novas === 1 ? 'nova' : 'novas'} para revisar`] : [])].join(' · ');
}

export const STATE_LABEL: Record<McpServer['state'], { text: string; pill: string }> = {
  conectado: { text: 'conectado', pill: 'pill-done' },
  conectando: { text: 'conectando', pill: 'pill-running' },
  erro: { text: 'não conectou', pill: 'pill-failed' },
  desligado: { text: 'desligado', pill: '' },
};
