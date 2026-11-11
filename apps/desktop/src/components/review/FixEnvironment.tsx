import { useContext, useState } from 'react';
import type { ExecutionReview } from '@orbi/contracts';
import { api } from '../../api';
import { ChatContext } from '../ChatContext';
import { fixMessage } from './reviewLines';

type Env = NonNullable<ExecutionReview['environment']>[number];

/**
 * A known problem that came back in every run: the Orbi gets past it each time, but it should be
 * fixed once, at the root. Says what happens, the workaround and the fix, and asks whether to
 * fix it now (the Orbi leads, with approvals) or not now (it does not ask again until it is fixed).
 */
export function FixEnvironment({ e }: { e: Env }) {
  const chat = useContext(ChatContext);
  const [answer, setAnswer] = useState<'agora' | 'depois'>();
  return (
    <div className="fix-env">
      <strong>Vamos corrigir o seu ambiente?</strong>
      <p className="small">O mesmo problema apareceu em {e.runs} execuções seguidas de <strong>{e.playbook}</strong>. Eu contorno toda vez, mas dá para resolver de vez.</p>
      <dl className="kv small">
        <dt>O que aparece</dt><dd>{e.sintoma}</dd>
        {e.causa && <><dt>Por quê</dt><dd>{e.causa}</dd></>}
        <dt>O que faço hoje</dt><dd>{e.solucao}</dd>
        <dt>Correção de vez</dt><dd>{e.raiz ?? 'ainda não sei: explico logo abaixo o que investiguei'}{e.quemCorrige ? ` · quem faz: ${e.quemCorrige}` : ''}</dd>
      </dl>
      {answer ? (
        <p className="muted small">{answer === 'agora' ? 'Combinado: vamos corrigir.' : 'Tudo bem: não pergunto de novo enquanto não for corrigido.'}</p>
      ) : (
        <div className="row gap">
          <button type="button" className="btn small primary" onClick={() => { setAnswer('agora'); chat.send(fixMessage(e)); }}>Corrigir agora</button>
          <button type="button" className="btn small" onClick={() => { setAnswer('depois'); void api.setReviewNote(e.noteId, 'dismissed'); }}>Agora não</button>
        </div>
      )}
    </div>
  );
}
