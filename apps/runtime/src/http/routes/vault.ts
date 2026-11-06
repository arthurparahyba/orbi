import { Hono } from 'hono';
import { SetSecret } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body } from '../errors.ts';

/** Credentials: names and descriptions only — values never leave the vault through the API. */
export function vaultRoutes({ vault }: OrbiServices) {
  return new Hono()
    .get('/', async (c) => c.json({ backend: await vault.backend(), secrets: vault.list() }))
    .put('/:name{.+}', async (c) => {
      const { value, description } = await body(c, SetSecret);
      return c.json(await vault.set(c.req.param('name'), value, { description }));
    })
    .delete('/:name{.+}', async (c) => c.json({ deleted: await vault.delete(c.req.param('name')) }));
}
