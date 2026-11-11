import { Hono } from 'hono';
import { SetChromeSettings } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import type { Background } from '../../compose.ts';
import { applyChromeSettings, chromeSettings } from '../../browser/settings.ts';
import { body, HttpError } from '../errors.ts';

/** Orbi's browser (Chrome DevTools): its settings, saved to the .env and applied with a restart of the bridge. */
export function browserRoutes(s: Pick<OrbiServices, 'config'>, background: Pick<Background, 'restartChrome'>) {
  return new Hono()
    .get('/settings', (c) => c.json(chromeSettings(s.config.chrome)))
    .put('/settings', async (c) => {
      const result = applyChromeSettings(await body(c, SetChromeSettings), s.config);
      if ('problem' in result) throw new HttpError(400, 'invalid_browser_settings', result.problem);
      await background.restartChrome();
      return c.json(result.settings);
    });
}
