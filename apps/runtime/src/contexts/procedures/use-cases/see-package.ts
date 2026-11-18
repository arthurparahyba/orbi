import type { OrbiServices } from '../../../services.ts';
import { readPackage, type PackageSeen, type ProcedurePackage } from '../definition/src/sharing.ts';

/**
 * A caixinha que aparece quando um pacote chega (documento 30): o que é, o que vai entrar e o que
 * já existe aqui. Nada é aplicado — isto é só a leitura, e é a mesma que `applyPackage` faz.
 */

type Deps = Pick<OrbiServices, 'knowledge' | 'procedures' | 'vault'>;

export function seePackage(d: Deps, pack: ProcedurePackage): PackageSeen {
  const held = new Set(d.vault.list().map((s) => s.name));
  return readPackage(pack, {
    procedure: !!d.procedures.definition.playbook(pack.procedure.name),
    types: (name) => !!d.knowledge.type(name),
    facts: (id) => !!d.knowledge.get(id),
    secrets: (name) => held.has(name),
  });
}
