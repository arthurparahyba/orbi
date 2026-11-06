import { Hono } from 'hono';
import { SetAutonomy } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body } from '../errors.ts';

/** Global autonomy levels per kind of action (the Autonomia screen). */
export function autonomyRoutes({ policy }: OrbiServices) {
  return new Hono()
    .get('/', (c) => c.json(policy.get()))
    .patch('/', async (c) => {
      const { category, level } = await body(c, SetAutonomy);
      return c.json(policy.set(category, level));
    });
}
