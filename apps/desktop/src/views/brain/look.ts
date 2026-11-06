import type { Entity } from '../../api';

/** One stable color per ontology type (validated on the dark surface). */
const TYPE_COLORS: Record<string, string> = {
  Classe: '#B794F6', Repositorio: '#6CA8FF', Workflow: '#4CC38A', Ambiente: '#F2B13C', Ferramenta: '#5ED3D3',
  Portal: '#FF9F6B', Playbook: '#F2B13C', Incidente: '#FF8A8A', Mudanca: '#E58FD0', Historia: '#A3C76D', Pessoa: '#A9B0BB',
};
export const colorOf = (type: string) => TYPE_COLORS[type] ?? '#A9B0BB';
export const labelOf = (e: Entity) => String(e.props.name ?? e.props.nome ?? e.props.title ?? e.id.split(':').pop());
export const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
