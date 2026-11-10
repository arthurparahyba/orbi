import { describe, expect, it } from 'vitest';
import type { BrainSnapshot, Playbook } from '../src/api';
import { conceptMap, factsOf, frontier, mapAsSnapshot, neighborhood } from '../src/views/brain/map';

const entity = (id: string, type: string, extra: Partial<BrainSnapshot['entities'][number]> = {}) => ({ id, type, props: {}, body: '', updatedAt: '2026-11-10T00:00:00Z', ...extra });
const edge = (from: string, rel: string, to: string) => ({ from, rel, to, attrs: {}, validFrom: '', validTo: null });
const snapshot: BrainSnapshot = {
  stats: { entities: 0, edges: 0, playbooks: 0, openProposals: 0, types: 0 },
  gaps: [{ entity: 'car-hml', type: 'Ambiente', missing: 'dono' }],
  types: [
    { name: 'Ambiente', description: '', relations: { recurso: '*' }, requires: [] },
    { name: 'ServicoECS', description: '', relations: {}, requires: [], knows: { de_pe: 'running = desired' } },
    { name: 'FilaSQS', description: '', relations: {}, requires: [] },
    { name: 'MicroFrontend', description: '', relations: {}, requires: [] },
  ],
  entities: [entity('pag-hml', 'Ambiente'), entity('car-hml', 'Ambiente'), entity('pag-svc', 'ServicoECS', { aliases: ['servico-pag'] }), entity('car-fila', 'FilaSQS')],
  edges: [edge('pag-hml', 'recurso', 'pag-svc'), edge('car-hml', 'recurso', 'car-fila')],
};
const pb = (name: string, extra: Partial<Playbook>): Playbook => ({
  name, description: '', appliesTo: null, trigger: '', autonomy: 'ask', steps: [], instructions: '', variationOf: null, uses: 0, successes: 0, updatedAt: '',
  outputs: [], scripts: [], level: 1, levelMax: 3, levelBy: 'learned', cleanStreak: 0, ...extra,
});
const validar = pb('validar-ambiente', { inputs: [{ name: 'ambiente', concept: 'Ambiente' }], steps: [{ id: 'a', label: 'Conferir', how: '{{ambiente.recurso[].de_pe}}' }] });

describe('mapa do cérebro', () => {
  it('conceitos são os nós, com quantos fatos têm e os procedimentos sobre eles', () => {
    const map = conceptMap(snapshot, [validar]);
    expect(map.nodes.find((n) => n.name === 'Ambiente')).toEqual({ name: 'Ambiente', facts: 2, gaps: 1, procedures: ['validar-ambiente'] });
    // "*" in the ontology is not drawn; the relations the facts use are.
    expect(map.edges).toEqual([{ from: 'Ambiente', to: 'ServicoECS', rel: 'recurso' }, { from: 'Ambiente', to: 'FilaSQS', rel: 'recurso' }]);
    expect(mapAsSnapshot(map).entities.map((e) => e.props.nome)).toContain('Ambiente (2)');
  });

  it('o grafo de um fato mostra só o que está ligado a ele', () => {
    const around = neighborhood(snapshot, 'pag-hml');
    expect(around.entities.map((e) => e.id).sort()).toEqual(['pag-hml', 'pag-svc']);
    expect(around.gaps).toEqual([]);
  });

  it('fatos de um conceito em lista, achados também pelo outro nome', () => {
    expect(factsOf(snapshot, 'ServicoECS', 'servico-pag').map((e) => e.id)).toEqual(['pag-svc']);
    expect(factsOf(snapshot, 'Ambiente').length).toBe(2);
  });

  it('a fronteira vem do cérebro: o recurso cujo conceito não sabe, a lacuna, o conceito sem fatos', () => {
    const f = frontier(snapshot, [validar, pb('subir-mfe', { inputs: [{ name: 'mfe', concept: 'MicroFrontend' }] })]);
    expect(f.needs).toContain('validar-ambiente: o que é "de_pe" para FilaSQS');
    expect(f.needs).toContain('car-hml não tem dono');
    expect(f.needs).toContain('nenhum MicroFrontend conhecido ainda: o primeiro pedido vai investigar');
    expect(f.alone).toEqual(['subir-mfe']);
  });
});
