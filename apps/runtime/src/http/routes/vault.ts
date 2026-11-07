import { Hono } from 'hono';
import { SetSecret } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { HttpError, body } from '../errors.ts';

/** Same shape as a {{segredo:nome}} reference (vault/vault.ts). */
const SECRET_NAME = /^[a-z0-9][a-z0-9._/@-]{0,127}$/;

/** Credentials: names and descriptions only — values never leave the vault through the API. */
export function vaultRoutes({ vault }: OrbiServices) {
  return new Hono()
    .get('/', async (c) => c.json({ backend: await vault.backend(), secrets: vault.list() }))
    .put('/:name{.+}', async (c) => {
      const { value, description } = await body(c, SetSecret);
      const name = c.req.param('name');
      if (!SECRET_NAME.test(name)) {
        throw new HttpError(400, 'invalid_body', 'nome inválido: use letras minúsculas, números e . _ / @ - (ex.: github/senha)');
      }
      // Added on the Autonomia screen (a demonstration records its own origin).
      const origin = vault.has(name) ? undefined : 'adicionada por você';
      return c.json(await vault.set(name, value, { description, origin }));
    })
    .delete('/:name{.+}', async (c) => c.json({ deleted: await vault.delete(c.req.param('name')) }));
}
