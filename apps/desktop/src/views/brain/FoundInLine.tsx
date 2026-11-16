import type { Entity } from '../../api';

/**
 * De onde um fato veio no mundo, e há quanto não é conferido (documento 28, fase C). Isto não é
 * o `source` — aquele diz qual evento do Orbi escreveu o fato. Este diz onde se chega nele de
 * novo: o comando, o endereço da página, o arquivo. Muita coisa que o Orbi guarda não está na LLM
 * e nunca vai estar; o que dá para guardar é o caminho de volta.
 */
export function FoundInLine({ e }: { e: Pick<Entity, 'foundIn' | 'checkedAt'> }) {
  if (!e.foundIn) return null;
  return (
    <p className="muted small found-in">
      <span className="pill tiny">{KIND[e.foundIn.kind]}</span>
      {e.foundIn.kind === 'page' ? <a href={e.foundIn.ref} target="_blank" rel="noreferrer">{e.foundIn.ref}</a> : <code>{e.foundIn.ref}</code>}
      {e.checkedAt && <span className={staleness(e.checkedAt).className}>{staleness(e.checkedAt).text}</span>}
    </p>
  );
}

const KIND: Record<NonNullable<Entity['foundIn']>['kind'], string> = {
  cli: 'comando',
  page: 'página',
  file: 'arquivo',
  person: 'alguém disse',
  screen: 'você digitou',
};

const DAY = 24 * 60 * 60 * 1000;

/** Há quanto tempo ninguém confere este valor na fonte. Passado de um mês, vale avisar. */
export function staleness(checkedAt: string): { text: string; className: string } {
  const days = Math.floor((Date.now() - new Date(checkedAt).getTime()) / DAY);
  if (days <= 0) return { text: 'conferido hoje', className: 'ok' };
  if (days === 1) return { text: 'conferido ontem', className: '' };
  if (days < 30) return { text: `conferido há ${days} dias`, className: '' };
  const months = Math.floor(days / 30);
  return { text: `não é conferido há ${months} ${months === 1 ? 'mês' : 'meses'}`, className: 'warn-text' };
}
