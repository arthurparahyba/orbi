import { useState } from 'react';
import { api, type UsageTotals } from '../../api';
import { useLive } from '../../hooks';
import { Segmented } from '../../components/Segmented';
import { avgResponse, tokens, usd } from './format';

const PERIODS = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

/** How much the model and the tools were used: today, the period and per conversation. */
export function Usage() {
  const [period, setPeriod] = useState<Period>('30');
  const report = useLive(() => api.usage(Number(period)), ['usage', 'conversations'], [period]);
  const r = report.data;

  return (
    <section className="auto-list">
      <div className="usage-head">
        <h2>Uso do modelo</h2>
        <Segmented<Period> label="Período" value={period} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} onChange={setPeriod} />
      </div>
      <p className="muted small pad-x16">
        Custo estimado pelo Flue a partir da tabela de preços do modelo. Adaptadores que não informam uso aparecem com zero.
      </p>
      {!r ? (
        <div className="auto-row muted">{report.error ? `Erro: ${report.error}` : 'Carregando…'}</div>
      ) : (
        <>
          <div className="stats usage-stats" aria-label="Resumo de uso">
            <Tile value={usd(r.today.costUsd)} label="hoje" />
            <Tile value={usd(r.period.costUsd)} label={`em ${r.days} dias`} />
            <Tile value={tokens(r.period.tokensIn + r.period.tokensOut)} label="tokens" />
            <Tile value={String(r.period.turns)} label="turnos" />
            <Tile value={avgResponse(r.period)} label="resposta média" />
            <Tile value={String(r.period.failedTurns + r.period.failedTools)} label="falhas" warn={r.period.failedTurns + r.period.failedTools > 0} />
          </div>
          {r.conversations.length === 0 ? (
            <div className="auto-row muted">Nenhuma chamada ao modelo neste período.</div>
          ) : (
            <ConversationTable rows={r.conversations} />
          )}
        </>
      )}
    </section>
  );
}

function Tile({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return <div className={`stat ${warn ? 'warn' : ''}`}><strong>{value}</strong><span>{label}</span></div>;
}

function ConversationTable({ rows }: { rows: Array<UsageTotals & { conversationId: string; title: string; model: string }> }) {
  return (
    <div className="table-scroll pad-x16">
      <table className="runs usage">
        <thead>
          <tr>
            <th scope="col">Conversa</th>
            <th scope="col" className="num">Turnos</th>
            <th scope="col" className="num">Tokens (entrada / saída)</th>
            <th scope="col" className="num">Custo</th>
            <th scope="col" className="num">Resposta média</th>
            <th scope="col" className="num">Ferramentas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.conversationId}>
              <td><strong>{c.title}</strong><span className="muted small block">{c.model || '—'}</span></td>
              <td className="num">{c.turns}{c.failedTurns > 0 && <span className="pill pill-failed tiny">{c.failedTurns} falha{c.failedTurns > 1 ? 's' : ''}</span>}</td>
              <td className="num">{tokens(c.tokensIn)} / {tokens(c.tokensOut)}</td>
              <td className="num">{usd(c.costUsd)}</td>
              <td className="num">{avgResponse(c)}</td>
              <td className="num">{c.toolCalls}{c.failedTools > 0 && <span className="pill pill-failed tiny">{c.failedTools} com erro</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
