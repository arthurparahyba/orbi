import { Hono } from 'hono';
import { LogLevelQuery, LogLimitQuery, LogTextQuery, UsageDaysQuery } from '@orbi/contracts';
import type { OrbiServices } from '../../services.ts';
import { HttpError, query } from '../../http/errors.ts';
import { recentLog } from './use-cases/recent-log.ts';

/** Model and tool usage: today, the period and per conversation. */
export function usageRoutes({ usage }: OrbiServices) {
  return new Hono().get('/', (c) => c.json(usage.report(query(c, 'days', UsageDaysQuery))));
}

/** O fim do registro do runtime, para a tela de logs (documento 29). */
export function logRoutes(s: OrbiServices) {
  return new Hono().get('/', async (c) => {
    const log = await recentLog(s, {
      level: query(c, 'level', LogLevelQuery),
      text: query(c, 'text', LogTextQuery),
      limit: query(c, 'limit', LogLimitQuery),
    });
    // Sem arquivo não é erro do pedido: é o normal rodando pelo terminal, e a tela diz isso.
    if ('refused' in log) throw new HttpError(409, log.refused, log.detail);
    return c.json(log);
  });
}
