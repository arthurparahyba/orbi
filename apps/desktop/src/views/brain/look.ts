import type { Entity } from '../../api';

/** One stable color per ontology type (validated on the dark surface). */
const TYPE_COLORS: Record<string, string> = {
  Classe: '#B794F6', Repositorio: '#6CA8FF', Workflow: '#4CC38A', Ambiente: '#F2B13C', Ferramenta: '#5ED3D3',
  Portal: '#FF9F6B', Playbook: '#F2B13C', Incidente: '#FF8A8A', Mudanca: '#E58FD0', Historia: '#A3C76D', Pessoa: '#A9B0BB',
};
/** Learned types get a color from their name, so the same type always looks the same. */
const PALETTE = ['#6CA8FF', '#4CC38A', '#F2B13C', '#B794F6', '#5ED3D3', '#FF9F6B', '#E58FD0', '#A3C76D', '#FF8A8A'];
export const colorOf = (type: string) => {
  if (TYPE_COLORS[type]) return TYPE_COLORS[type];
  let h = 0;
  for (const ch of type) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
export const labelOf = (e: Entity) => String(e.props.name ?? e.props.nome ?? e.props.title ?? e.id.split(':').pop());
export const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
