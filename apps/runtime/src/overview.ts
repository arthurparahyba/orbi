import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OrbiServices } from './services.ts';
import { exportMarkdown } from './brain-export.ts';

/**
 * The two readings that cross contexts on purpose, and so belong to the composition rather than
 * to any one of them (documento 26): the line of the Orbi's situation that goes into every turn,
 * and the export of the whole brain as Markdown. Each context counts what is its own.
 */
export function stats(s: Pick<OrbiServices, 'knowledge' | 'domains' | 'procedures' | 'learning'>): {
  types: number;
  entities: number;
  edges: number;
  playbooks: number;
  openProposals: number;
  domains: number;
} {
  return {
    ...s.knowledge.counts(),
    playbooks: s.procedures.definition.count(),
    openProposals: s.learning.countOpen(),
    // Cada contexto conta o seu: os domínios são de `knowledge`, pelo serviço deles (documento 28).
    domains: s.domains.list().length,
  };
}

/** The brain as Markdown files, one per fact and per procedure, for the developer to read. */
export function exportBrain(s: Pick<OrbiServices, 'knowledge' | 'procedures'>, dir: string): number {
  const { entities } = s.knowledge.graph();
  return exportMarkdown(dir, {
    entities,
    playbooks: s.procedures.definition.playbooks(),
    outEdges: (id) => s.knowledge.neighbors(id).out,
  });
}

/**
 * O pacote de um procedimento em arquivo, na pasta de compartilhados (documento 30). Escrever em
 * disco é da composição: o caso de uso monta o pacote e não conhece pasta nenhuma.
 */
export function writeShared(dir: string, fileName: string, pack: unknown): { file: string; bytes: number } {
  mkdirSync(dir, { recursive: true });
  const text = `${JSON.stringify(pack, null, 2)}\n`;
  const file = join(dir, fileName);
  writeFileSync(file, text, 'utf8');
  return { file, bytes: Buffer.byteLength(text) };
}
