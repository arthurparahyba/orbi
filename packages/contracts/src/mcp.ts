/** Shared by the app and the runtime: a server's command line (docs/funcionalidades/20). */
export type McpCommandLine = { program: string; args: string[] };

/** `npx -y pacote --opcao "com espaço"` → program and arguments; quotes group, no shell anywhere. */
export function splitCommand(line: string): McpCommandLine | undefined {
  const parts: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let any = false;
  for (const ch of line.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      any = true;
    } else if (/\s/.test(ch)) {
      if (cur || any) parts.push(cur);
      cur = '';
      any = false;
    } else {
      cur += ch;
    }
  }
  if (cur || any) parts.push(cur);
  if (quote || !parts.length) return undefined;
  return { program: parts[0]!, args: parts.slice(1) };
}

/** The command as one line, to show and to confirm. */
export function commandText(c: McpCommandLine): string {
  return [c.program, ...c.args].map((p) => (/[\s"']/.test(p) || !p ? `"${p.replace(/"/g, '\\"')}"` : p)).join(' ');
}

