import type { DatabaseSync } from 'node:sqlite';
import { nullable, now, type Row } from '../../../../db/rows.ts';

/**
 * Um domínio é o assunto em que o Orbi aprendeu uma coisa: `aws`, `front-end`, `servicenow`,
 * `cozinha` (documento 28). Quem não tem domínio é `comum` — vale em todo domínio, e por isso o
 * banco guarda nulo em vez de uma linha chamada comum: assim nada precisou ser adivinhado para o
 * que já existia.
 */
export interface Domain {
  name: string;
  description: string;
  /** O playbook ou a conversa que deu nome a ele, para a tela contar de onde veio. */
  bornFrom: string | null;
  createdAt: string;
}

const toDomain = (r: Row): Domain => ({
  name: String(r.name),
  description: String(r.description),
  bornFrom: nullable(r.born_from),
  createdAt: String(r.created_at),
});

export class DomainRepo {
  constructor(private readonly db: DatabaseSync) {}

  list(): Domain[] {
    return (this.db.prepare('SELECT * FROM domains ORDER BY name').all() as Row[]).map(toDomain);
  }

  get(name: string): Domain | undefined {
    const row = this.db.prepare('SELECT * FROM domains WHERE name = ?').get(name) as Row | undefined;
    return row && toDomain(row);
  }

  insert(domain: Omit<Domain, 'createdAt'>): Domain {
    const createdAt = now();
    this.db
      .prepare('INSERT INTO domains (name, description, born_from, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO NOTHING')
      .run(domain.name, domain.description, domain.bornFrom, createdAt);
    return this.get(domain.name) ?? { ...domain, createdAt };
  }

  rename(from: string, to: string): void {
    for (const sql of [
      'UPDATE domains SET name = ? WHERE name = ?',
      'UPDATE entities SET domain = ? WHERE domain = ?',
      'UPDATE types SET domain = ? WHERE domain = ?',
    ]) {
      this.db.prepare(sql).run(to, from);
    }
  }

  remove(name: string): void {
    // O que era dele passa a ser comum: apagar um domínio nunca apaga conhecimento.
    this.db.prepare('UPDATE entities SET domain = NULL WHERE domain = ?').run(name);
    this.db.prepare('UPDATE types SET domain = NULL WHERE domain = ?').run(name);
    this.db.prepare('DELETE FROM domains WHERE name = ?').run(name);
  }

  /** Quantos fatos e tipos cada domínio tem. `comum` entra com a chave vazia. */
  counts(): Map<string, { entities: number; types: number }> {
    const counts = new Map<string, { entities: number; types: number }>();
    const put = (key: string, field: 'entities' | 'types', n: number) => {
      const row = counts.get(key) ?? { entities: 0, types: 0 };
      counts.set(key, { ...row, [field]: n });
    };
    for (const r of this.db.prepare("SELECT COALESCE(domain, '') AS d, COUNT(*) AS n FROM entities GROUP BY d").all() as Row[]) {
      put(String(r.d), 'entities', Number(r.n));
    }
    for (const r of this.db.prepare("SELECT COALESCE(domain, '') AS d, COUNT(*) AS n FROM types GROUP BY d").all() as Row[]) {
      put(String(r.d), 'types', Number(r.n));
    }
    return counts;
  }

  /** O domínio de cada tipo, para herdar: um fato do tipo de outro domínio é do domínio do tipo. */
  domainOfType(name: string): string | null {
    const row = this.db.prepare('SELECT domain FROM types WHERE name = ?').get(name) as Row | undefined;
    return row ? nullable(row.domain) : null;
  }

  setEntityDomain(id: string, domain: string | null): void {
    this.db.prepare('UPDATE entities SET domain = ? WHERE id = ?').run(domain, id);
  }

  setTypeDomain(name: string, domain: string | null): void {
    this.db.prepare('UPDATE types SET domain = ? WHERE name = ?').run(domain, name);
  }

  /** Fatos sem domínio nenhum e sem serem comum de propósito: os de antes do documento 28. */
  withoutDomain(limit = 50): Array<{ id: string; type: string }> {
    return (
      this.db.prepare('SELECT id, type FROM entities WHERE domain IS NULL ORDER BY updated_at DESC LIMIT ?').all(limit) as Row[]
    ).map((r) => ({ id: String(r.id), type: String(r.type) }));
  }
}
