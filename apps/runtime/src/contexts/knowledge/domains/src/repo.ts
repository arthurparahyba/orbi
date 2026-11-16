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

  /**
   * O alcance de um domínio (documento 28, fase B): ele mesmo, `comum` (nulo), e os domínios para
   * os quais os fatos **dele** já apontaram — o que ele pegou emprestado. A direção importa: um
   * vizinho que usa um fato meu não me dá acesso ao dele, senão o alcance viraria o cérebro todo
   * em dois saltos, que é o que isto existe para impedir.
   *
   * Sem domínio (`comum`) o alcance é só `comum`: quem não é de assunto nenhum não enxerga assunto
   * nenhum em particular.
   */
  reach(domain: string | null): Array<string | null> {
    if (!domain) return [null];
    const rows = this.db
      .prepare(
        `SELECT DISTINCT b.domain AS d FROM edges e
           JOIN entities a ON a.id = e.from_id
           JOIN entities b ON b.id = e.to_id
          WHERE e.valid_to IS NULL AND a.domain = ? AND b.domain IS NOT NULL AND b.domain <> a.domain`,
      )
      .all(domain) as Row[];
    return [domain, null, ...rows.map((r) => String(r.d))];
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

  /**
   * Fato comum cujo tipo é de um domínio: é desacordo, não indecisão. Nulo significa comum, então
   * não há como distinguir "ainda não decidi" de "comum de propósito" — e não precisa: o que vale
   * revisar é só onde a regra 1 (o tipo ganha) ainda não foi aplicada, nos fatos de antes do
   * documento 28.
   */
  disagreeingWithType(limit = 50): Array<{ id: string; type: string; typeDomain: string }> {
    const rows = this.db
      .prepare(
        `SELECT e.id, e.type, t.domain FROM entities e JOIN types t ON t.name = e.type
          WHERE e.domain IS NULL AND t.domain IS NOT NULL ORDER BY e.updated_at DESC LIMIT ?`,
      )
      .all(limit) as Row[];
    return rows.map((r) => ({ id: String(r.id), type: String(r.type), typeDomain: String(r.domain) }));
  }
}
