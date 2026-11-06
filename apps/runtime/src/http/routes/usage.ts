import { Hono } from 'hono';
import { UsageDaysQuery } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { query } from '../errors.ts';

/** Model and tool usage: today, the period and per conversation. */
export function usageRoutes({ usage }: OrbiServices) {
  return new Hono().get('/', (c) => c.json(usage.report(query(c, 'days', UsageDaysQuery))));
}
