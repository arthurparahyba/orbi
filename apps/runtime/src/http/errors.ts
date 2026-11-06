import type { Context, Hono } from 'hono';
import * as v from 'valibot';
import type { ApiError } from '@orbi/contracts';
import { log } from '../log.ts';

/** An error the API answers with on purpose: status + stable code + message for people. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 413 | 500,
    readonly code: string,
    message: string,
    readonly details?: ApiError['error']['details'],
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} não encontrado(a)`);

/** Reads and validates the JSON body; an absent body counts as `{}`. */
export async function body<S extends v.GenericSchema>(c: Context, schema: S): Promise<v.InferOutput<S>> {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = v.safeParse(schema, raw);
  if (!parsed.success) {
    const details = parsed.issues.map((i) => ({ path: v.getDotPath(i) ?? '', message: i.message }));
    throw new HttpError(400, 'invalid_body', `corpo inválido: ${details.map((d) => `${d.path || 'corpo'}: ${d.message}`).join('; ')}`, details);
  }
  return parsed.output;
}

/** Validates one query parameter. */
export function query<S extends v.GenericSchema>(c: Context, name: string, schema: S): v.InferOutput<S> {
  const parsed = v.safeParse(schema, c.req.query(name));
  if (!parsed.success) throw new HttpError(400, 'invalid_query', `parâmetro ${name} inválido`);
  return parsed.output;
}

const toBody = (e: HttpError): ApiError => ({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } });

/** Every error leaves as ApiError; unexpected ones are logged and answered as 500. */
export function installErrorHandling(app: Hono): void {
  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json(toBody(error), error.status);
    log.error('erro na rota', { method: c.req.method, path: c.req.path, error });
    return c.json(toBody(new HttpError(500, 'internal', error instanceof Error ? error.message : String(error))), 500);
  });
  app.notFound((c) => c.json(toBody(new HttpError(404, 'not_found', `rota não existe: ${c.req.method} ${c.req.path}`)), 404));
}
