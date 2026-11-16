import * as v from 'valibot';

/**
 * The input of an MCP tool, as the server describes it (JSON Schema), turned into the valibot
 * schema the agent's tools take. Covers what MCP servers use: objects, strings (and enums),
 * numbers, booleans, arrays, nested objects. Anything else is accepted as is (the server checks).
 */
type Json = { type?: string | string[]; properties?: Record<string, Json>; required?: string[]; items?: Json; enum?: unknown[]; description?: string };

export function toValibot(schema: unknown): v.GenericSchema<Record<string, unknown>> {
  const s = (schema ?? {}) as Json;
  const obj = s.properties ? objectOf(s) : v.record(v.string(), v.unknown());
  return obj as unknown as v.GenericSchema<Record<string, unknown>>;
}

function objectOf(s: Json): v.GenericSchema {
  const required = new Set(s.required ?? []);
  const entries = Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, p]) => {
    const field = described(fieldOf(p), p.description);
    return [k, required.has(k) ? field : v.optional(field)];
  }));
  return v.looseObject(entries);
}

function fieldOf(p: Json, depth = 0): v.GenericSchema {
  if (depth > 6) return v.unknown();
  if (Array.isArray(p.enum) && p.enum.length && p.enum.every((e) => typeof e === 'string')) return v.picklist(p.enum as string[]);
  const type = Array.isArray(p.type) ? p.type.find((t) => t !== 'null') : p.type;
  const nullable = Array.isArray(p.type) && p.type.includes('null');
  const base = ((): v.GenericSchema => {
    switch (type) {
      case 'string': return v.string();
      case 'integer': return v.pipe(v.number(), v.integer());
      case 'number': return v.number();
      case 'boolean': return v.boolean();
      case 'array': return v.array(p.items ? described(fieldOf(p.items, depth + 1), p.items.description) : v.unknown());
      case 'object': return p.properties ? objectOf(p) : v.record(v.string(), v.unknown());
      default: return v.unknown();
    }
  })();
  return nullable ? v.nullable(base) : base;
}

function described(schema: v.GenericSchema, description?: string): v.GenericSchema {
  return description ? v.pipe(schema, v.description(description.slice(0, 500))) : schema;
}
