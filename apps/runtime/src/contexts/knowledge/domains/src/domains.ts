import type { DatabaseSync } from 'node:sqlite';
import type { Row } from '../../../../db/rows.ts';
import { DomainRepo, type Domain } from './repo.ts';

/**
 * Os domínios do cérebro e as pontes entre eles (documento 28). Uma ponte é uma relação cujas
 * pontas têm domínios diferentes — por isso ela é **derivada do grafo**, não guardada: nenhuma
 * tabela de ponte para ficar desatualizada.
 */

/**
 * Um fato de um domínio ligado a um fato de outro. Relação com `comum` não é ponte: `comum` já
 * entra no alcance de todo domínio, então atravessar para lá não atravessa nada.
 */
export interface Bridge {
  from: string;
  fromDomain: string;
  rel: string;
  to: string;
  toDomain: string;
}

/** O que `procedures` responde sobre domínio, para `knowledge` montar a visão sem conhecer aquela tabela. */
export interface ProceduresByDomain {
  /** domínio (vazio = comum) → quantos playbooks. */
  countByDomain(): Map<string, number>;
  inDomain(domain: string | null): Array<{ name: string; level: 1 | 2 | 3; uses: number }>;
  /** Renomear um domínio tem de alcançar o playbook também, e a tabela dele é de `procedures`. */
  rename(from: string, to: string): void;
}

/** Um domínio com o tamanho dele, para a lista da tela. */
export interface DomainSize extends Domain {
  entities: number;
  types: number;
  playbooks: number;
}

export class Domains {
  private readonly repo: DomainRepo;

  constructor(
    private readonly db: DatabaseSync,
    private readonly procedures: ProceduresByDomain,
  ) {
    this.repo = new DomainRepo(db);
  }

  list(): Domain[] {
    return this.repo.list();
  }

  get(name: string): Domain | undefined {
    return this.repo.get(name);
  }

  create(domain: { name: string; description?: string; bornFrom?: string | null }): Domain {
    return this.repo.insert({ name: domain.name, description: domain.description ?? '', bornFrom: domain.bornFrom ?? null });
  }

  rename(from: string, to: string): void {
    this.repo.rename(from, to);
    this.procedures.rename(from, to);
  }

  remove(name: string): void {
    this.repo.remove(name);
    // O playbook que era dele passa a ser comum, como os fatos: apagar domínio não apaga nada.
    this.procedures.rename(name, '');
  }

  /** Cada domínio com quantos tipos, fatos e playbooks tem. `comum` entra sempre, mesmo vazio. */
  sizes(): DomainSize[] {
    const counts = this.repo.counts();
    const playbooks = this.procedures.countByDomain();
    const sizeOf = (name: string, domain: Domain): DomainSize => ({
      ...domain,
      entities: counts.get(name)?.entities ?? 0,
      types: counts.get(name)?.types ?? 0,
      playbooks: playbooks.get(name) ?? 0,
    });
    const comum: Domain = { name: '', description: 'Vale em todo domínio: você, suas máquinas, seus repositórios.', bornFrom: null, createdAt: '' };
    return [sizeOf('', comum), ...this.repo.list().map((d) => sizeOf(d.name, d))];
  }

  playbooksIn(domain: string | null): Array<{ name: string; level: 1 | 2 | 3; uses: number }> {
    return this.procedures.inDomain(domain);
  }

  typesIn(domain: string | null): string[] {
    const sql = domain ? 'SELECT name FROM types WHERE domain = ? ORDER BY name' : 'SELECT name FROM types WHERE domain IS NULL ORDER BY name';
    const rows = (domain ? this.db.prepare(sql).all(domain) : this.db.prepare(sql).all()) as Row[];
    return rows.map((r) => String(r.name));
  }

  /** As pontes de um domínio: o que ele empresta e o que pega emprestado, agora. */
  bridgesOf(domain: string | null): Bridge[] {
    const name = domain ?? '';
    return this.bridges().filter((b) => b.fromDomain === name || b.toDomain === name);
  }

  /** Toda relação do grafo cujas pontas têm domínios diferentes. */
  bridges(): Bridge[] {
    const rows = this.db
      .prepare(
        `SELECT e.from_id, e.rel, e.to_id, COALESCE(a.domain, '') AS from_domain, COALESCE(b.domain, '') AS to_domain
           FROM edges e
           JOIN entities a ON a.id = e.from_id
           JOIN entities b ON b.id = e.to_id
          WHERE e.valid_to IS NULL AND a.domain IS NOT NULL AND b.domain IS NOT NULL
            AND a.domain <> b.domain
          ORDER BY from_domain, to_domain, e.from_id`,
      )
      .all() as Row[];
    return rows.map((r) => ({
      from: String(r.from_id),
      fromDomain: String(r.from_domain),
      rel: String(r.rel),
      to: String(r.to_id),
      toDomain: String(r.to_domain),
    }));
  }

  /** Em quantos domínios diferentes um tipo já tem fato: 2 ou mais e ele é de todos, ou seja, comum. */
  domainsUsingType(name: string): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT domain FROM entities WHERE type = ? AND domain IS NOT NULL ORDER BY domain')
      .all(name) as Row[];
    return rows.map((r) => String(r.domain));
  }

  disagreeingWithType(limit?: number): Array<{ id: string; type: string; typeDomain: string }> {
    return this.repo.disagreeingWithType(limit);
  }

  domainOfType(name: string): string | null {
    return this.repo.domainOfType(name);
  }

  setEntityDomain(id: string, domain: string | null): void {
    this.repo.setEntityDomain(id, domain);
  }

  setTypeDomain(name: string, domain: string | null): void {
    this.repo.setTypeDomain(name, domain);
  }
}

export type { Domain } from './repo.ts';
