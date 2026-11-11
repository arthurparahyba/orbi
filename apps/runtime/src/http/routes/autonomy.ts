import { Hono } from 'hono';
import { SetAutonomy } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { body } from '../errors.ts';
import { levelOf, type AutonomyLevel } from '../../autonomy/policy.ts';
import { categoryOf } from '../../mcp-client/domain.ts';

/** Global autonomy levels per kind of action (the Autonomia screen). */
export function autonomyRoutes({ policy, mcpServers }: OrbiServices) {
  // Each MCP server shows its two rules, with the default until the developer sets them.
  const shown = () => {
    const categories = { ...policy.get().categories } as Record<string, AutonomyLevel>;
    for (const s of mcpServers.list()) for (const c of [categoryOf(s.id, 'leitura'), categoryOf(s.id, 'escrita')]) categories[c] = levelOf(policy.get(), c);
    return { categories };
  };
  return new Hono()
    .get('/', (c) => c.json(shown()))
    .patch('/', async (c) => {
      const { category, level } = await body(c, SetAutonomy);
      policy.set(category, level);
      return c.json(shown());
    });
}
