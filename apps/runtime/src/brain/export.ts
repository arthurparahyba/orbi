import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dump } from 'js-yaml';
import type { Edge, Entity, Playbook } from './domain/types.ts';

/** Read-only Markdown view of the brain (one note per entity and playbook), for Obsidian. */
export function exportMarkdown(
  dir: string,
  data: { entities: Entity[]; playbooks: Playbook[]; outEdges: (id: string) => Edge[] },
): number {
  let count = 0;
  for (const entity of data.entities) {
    const links: Record<string, string[]> = {};
    for (const e of data.outEdges(entity.id)) (links[e.rel] ??= []).push(`[[${e.to}]]`);
    const front = { tipo: entity.type, id: entity.id, ...entity.props, ...links };
    const path = join(dir, entity.type.toLowerCase(), `${entity.id.replace(/[/:]/g, '_')}.md`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\n${dump(front).trimEnd()}\n---\n${entity.body}\n`);
    count++;
  }
  for (const pb of data.playbooks) {
    const path = join(dir, 'playbooks', pb.name, 'SKILL.md');
    mkdirSync(dirname(path), { recursive: true });
    const front = { name: pb.name, description: pb.description, aplicaA: pb.appliesTo, autonomia: pb.autonomy, gatilho: pb.trigger };
    const steps = pb.steps.map((s, i) => `${i + 1}. **${s.label}** — ${s.how}`).join('\n');
    writeFileSync(path, `---\n${dump(front).trimEnd()}\n---\n${pb.instructions}\n\n## Passos\n\n${steps}\n`);
    count++;
  }
  return count;
}
