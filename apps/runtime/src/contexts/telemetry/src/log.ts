/**
 * Orbi's logs: one line per event, with attributes (conversation, model,
 * tool…) instead of text glued together. Two formats:
 *
 *   json    {"t":"…","level":"info","msg":"turno do modelo","conversation":"chat:…","ms":812}
 *   pretty  14:31:02 INFO  turno do modelo  conversation=chat:… ms=812
 *
 * ORBI_LOG_FORMAT picks one (default: pretty in a terminal, json otherwise,
 * e.g. the app's runtime.log). ORBI_LOG_LEVEL: debug | info | warn | error.
 */
export type Level = 'debug' | 'info' | 'warn' | 'error';
export type Attrs = Record<string, unknown>;

export interface Logger {
  debug(msg: string, attrs?: Attrs): void;
  info(msg: string, attrs?: Attrs): void;
  warn(msg: string, attrs?: Attrs): void;
  error(msg: string, attrs?: Attrs): void;
  /** A logger that adds `attrs` to every line (e.g. the conversation). */
  with(attrs: Attrs): Logger;
}

export interface LogOptions {
  format: 'json' | 'pretty';
  level: Level;
  write(line: string, level: Level): void;
}

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Errors become {message, stack}; everything else is kept as is. */
function plain(value: unknown): unknown {
  if (value instanceof Error) return { message: value.message, ...(value.stack ? { stack: value.stack } : {}) };
  return value;
}

function prettyValue(value: unknown): string {
  if (value instanceof Error) return JSON.stringify(value.message);
  if (typeof value === 'string') return /\s|=/.test(value) ? JSON.stringify(value) : value;
  return JSON.stringify(value);
}

export function formatLine(format: LogOptions['format'], level: Level, msg: string, attrs: Attrs, at = new Date()): string {
  const defined = Object.entries(attrs).filter(([, v]) => v !== undefined);
  if (format === 'json') {
    return JSON.stringify({ t: at.toISOString(), level, msg, ...Object.fromEntries(defined.map(([k, v]) => [k, plain(v)])) });
  }
  const time = at.toTimeString().slice(0, 8);
  const rest = defined.map(([k, v]) => `${k}=${prettyValue(v)}`).join(' ');
  const stack = defined.map(([, v]) => v).find((v): v is Error => v instanceof Error)?.stack;
  return `${time} ${level.toUpperCase().padEnd(5)} ${msg}${rest ? `  ${rest}` : ''}${stack && level === 'error' ? `\n${stack}` : ''}`;
}

export function createLogger(options: LogOptions, base: Attrs = {}): Logger {
  const emit = (level: Level) => (msg: string, attrs: Attrs = {}) => {
    if (ORDER[level] < ORDER[options.level]) return;
    options.write(formatLine(options.format, level, msg, { ...base, ...attrs }), level);
  };
  return {
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
    with: (attrs) => createLogger(options, { ...base, ...attrs }),
  };
}

export function logOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): LogOptions {
  const format = env.ORBI_LOG_FORMAT === 'json' || env.ORBI_LOG_FORMAT === 'pretty' ? env.ORBI_LOG_FORMAT : process.stdout.isTTY ? 'pretty' : 'json';
  const level = (['debug', 'info', 'warn', 'error'] as const).find((l) => l === env.ORBI_LOG_LEVEL) ?? 'info';
  return {
    format,
    level,
    write: (line, lvl) => (ORDER[lvl] >= ORDER.warn ? process.stderr : process.stdout).write(`${line}\n`),
  };
}

let current: Logger = createLogger(logOptionsFromEnv());

/** The process logger. Tests swap it with `setLogger`. */
export const log: Logger = {
  debug: (m, a) => current.debug(m, a),
  info: (m, a) => current.info(m, a),
  warn: (m, a) => current.warn(m, a),
  error: (m, a) => current.error(m, a),
  with: (a) => current.with(a),
};

export function setLogger(logger: Logger): void {
  current = logger;
}
