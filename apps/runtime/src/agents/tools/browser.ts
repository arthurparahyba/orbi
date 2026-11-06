import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { services } from '../../services.ts';
import { redact } from '../../vault/vault.ts';
import { browserCategory } from '../../autonomy/policy.ts';
import type { AgentContext } from '../context.ts';

/**
 * Browser: reading comes through the native MCP mount (`mcp__chrome__*`, see
 * agents/orbi.ts) or `browser_read` for subagents; acting goes through
 * `browser_act`, behind the autonomy gate, with credentials from the vault.
 */

export const browserRead = defineTool({
  name: 'browser_read',
  description:
    'Read-only browser access (Chrome DevTools MCP): list_pages, new_page, navigate_page, take_snapshot, take_screenshot, wait_for, console and network listing. Pass the page-scoped tools a `pageId` from list_pages.',
  input: v.object({ tool: v.string(), args: v.optional(v.record(v.string(), v.unknown())) }),
  timeoutMs: 120_000,
  async run({ data }) {
    if (browserCategory(data.tool) !== 'navegador-leitura') return { output: { refused: 'Ação de escrita no navegador.' } };
    return { output: await services().browser.call(data.tool, data.args ?? {}) };
  },
});

export function useBrowser(ctx: AgentContext) {
  const { vault, browser } = services();
  ctx.gated({
    name: 'browser_act',
    description:
      'Act on a web page through Chrome DevTools MCP: click, fill, fill_form, press_key, hover, select_page, handle_dialog, upload_file, evaluate_script, close_page. Get element `uid`s from take_snapshot first and pass `pageId`. ' +
      'Credentials: write the reference exactly as the playbook has it, e.g. value "{{segredo:portal.local/senha}}" — it is replaced from the vault inside this tool; you never see or type the real value.',
    input: v.object({ tool: v.string(), args: v.record(v.string(), v.unknown()), purpose: v.string() }),
    category: (a) => browserCategory(a.tool),
    summary: (a) => `${a.purpose} (navegador: ${a.tool})`,
    execute: async (a) => {
      const { value: args, used } = await vault.resolve(a.args);
      try {
        return redact(await browser.call(a.tool, args), used);
      } catch (error) {
        throw new Error(redact(error instanceof Error ? error.message : String(error), used));
      }
    },
  });
}
