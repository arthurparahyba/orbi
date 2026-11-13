import { defineTool } from '../runtime-port.ts';
import * as v from 'valibot';
import type { BrowserMcp } from '../../browser/mcp/chrome-devtools.ts';
import { defineCapability, type Deps } from '../capability.ts';
import { redact } from '../../vault/vault.ts';
import { browserCategory, effectOfCategory } from '../../autonomy/policy.ts';
import type { AgentContext } from '../context.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { savePath } from './terminal.ts';

/**
 * Browser: reading comes through the native MCP mount (`mcp__chrome__*`, see
 * agents/orbi.ts) or `browser_read` for subagents; acting goes through
 * `browser_act`, behind the autonomy gate, with credentials from the vault.
 */

export const browserRead = (browser: Pick<BrowserMcp, 'call'>) => defineTool({
  name: 'browser_read',
  description:
    'Read-only browser access (Chrome DevTools MCP): list_pages, new_page, navigate_page, take_snapshot, take_screenshot, wait_for, console and network listing. Pass the page-scoped tools a `pageId` from list_pages.',
  input: v.object({ tool: v.string(), args: v.optional(v.record(v.string(), v.unknown())) }),
  timeoutMs: 120_000,
  async run({ data, signal }) {
    if (browserCategory(data.tool) !== 'navegador-leitura') return { output: { refused: 'Ação de escrita no navegador.' } };
    return { output: await browser.call(data.tool, data.args ?? {}, signal) };
  },
});

export const browserCapability = defineCapability({ name: 'browser', needs: ['vault', 'browser', 'config'], register: useBrowser });

function useBrowser(ctx: AgentContext, { vault, browser, config }: Deps<'vault' | 'browser' | 'config'>) {
  ctx.gated({
    name: 'browser_act',
    description:
      'Act on a web page through Chrome DevTools MCP: click, fill, fill_form, press_key, hover, select_page, handle_dialog, upload_file, evaluate_script, close_page. Get element `uid`s from take_snapshot first and pass `pageId`. ' +
      'Credentials: write the reference exactly as the playbook has it, e.g. value "{{segredo:portal.local/senha}}" — it is replaced from the vault inside this tool; you never see or type the real value. ' +
      'To keep what the page returns (e.g. evaluate_script extracting a list), pass saveTo: the result goes straight to that file (the JSON inside a ```json block, if there is one) and you get the path, never copy it by hand.',
    input: v.object({
      tool: v.string(), args: v.record(v.string(), v.unknown()), purpose: v.string(),
      saveTo: v.optional(v.pipe(v.string(), v.description('Write the whole result to this file instead of returning it (relative to the workspace)'))),
    }),
    // Writing a file is never a plain read.
    category: (a) => (a.saveTo && browserCategory(a.tool) === 'navegador-leitura' ? 'navegador-escrita' : browserCategory(a.tool)),
    // Saving what a read returned only writes a local file.
    effect: (a) => (a.saveTo && browserCategory(a.tool) === 'navegador-leitura' ? 'local' : effectOfCategory(browserCategory(a.tool))),
    summary: (a) => `${a.purpose} (navegador: ${a.tool})`,
    title: (a) => a.purpose,
    command: (a) => `navegador: ${a.tool}`,
    execute: async (a, _id, _how, signal) => {
      const { value: args, used } = await vault.resolve(a.args);
      try {
        // A file gets the whole answer: the cut is only for what a model reads.
        const text = redact(await browser.call(a.tool, args, signal, { full: !!a.saveTo }), used);
        if (!a.saveTo) return text;
        const file = savePath(a.saveTo, config.workspace);
        const body = payloadOf(text);
        const bad = notJson(file, body);
        if (bad) throw new Error(bad);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
        return JSON.stringify({ savedTo: file, bytes: Buffer.byteLength(body), head: body.slice(0, 300) });
      } catch (error) {
        throw new Error(redact(error instanceof Error ? error.message : String(error), used));
      }
    },
  });
}

/** A `.json` file must hold JSON: anything else is refused instead of written broken. */
export function notJson(file: string, body: string): string | undefined {
  if (!/\.json$/i.test(file)) return undefined;
  try {
    JSON.parse(body);
    return undefined;
  } catch {
    return `o retorno não é JSON (começa com "${body.slice(0, 40).replace(/\s+/g, ' ')}"): nada foi gravado em ${file}. Faça o script devolver um valor JSON (um array ou objeto), ou grave com outra extensão.`;
  }
}

/** What a browser tool returned, without its wrapper: the content of the first ```json (or ```) block, else the whole text. */
export function payloadOf(text: string): string {
  const m = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  return m ? m[1] : text;
}
