import type { OrbiServices } from '../../../services.ts';
import { arriving, type PackageSeen, type ProcedurePackage } from '../definition/src/sharing.ts';
import { seePackage } from './see-package.ts';

/**
 * Aplicar um pacote que chegou de outra pessoa (documento 30). Três regras, e todas por recusa:
 * não vai em cima de um procedimento que já existe aqui, não toca em conceito nem fato que esta
 * máquina já tem, e entra em N1 — autonomia é uma pessoa dando permissão ao Orbi dela.
 */

export interface Applied {
  seen: PackageSeen;
}

export interface Conflict {
  refused: 'ja-existe';
  detail: string;
}

type Deps = Pick<OrbiServices, 'knowledge' | 'procedures' | 'vault'>;

export function applyPackage(d: Deps, pack: ProcedurePackage): Applied | Conflict {
  const seen = seePackage(d, pack);
  if (seen.conflict) return { refused: 'ja-existe', detail: seen.name };
  for (const type of pack.types) if (seen.newTypes.includes(type.name)) d.knowledge.upsertType(type);
  for (const fact of pack.facts) if (seen.newFacts.includes(fact.id)) d.knowledge.upsertEntity(fact);
  for (const link of pack.links) d.knowledge.addEdge(link);
  d.procedures.definition.savePlaybook(arriving(pack.procedure, pack.exportedAt));
  for (const learning of pack.learnings) d.procedures.learnings.add(fromAway(learning, pack.procedure.name));
  return { seen };
}

/** Um aprendizado que veio de fora não aponta para execução nem conversa daqui: elas não existem. */
function fromAway(learning: ProcedurePackage['learnings'][number], playbook: string) {
  return { ...learning, playbook, source: 'pedido' as const, runId: null, conversationId: '' };
}
