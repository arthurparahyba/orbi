import type { ComponentType } from 'react';
import type { UiComponent } from '@orbi/contracts';
import { LinkIcon } from './Icons';
import { KnownLine, SimilarCard } from './SimilarCards';
import { SecretCard } from './SecretCard';
import { ApprovalCard } from './ApprovalCard';
import { LevelCard } from './LevelCard';
import { Stepper } from './ui/Stepper';
import { Question } from './ui/Question';
import { Learning, Status, Table } from './ui/Basic';
import { CodeChange } from './ui/CodeChange';
import { LearnedFacts } from './ui/LearnedFacts';

/**
 * Draws the component catalog the agent sends on the `ui` channel. The shapes come from
 * @orbi/contracts, the same schema the runtime validates against. One renderer per component,
 * one file each (components/ui/, and the cards beside them): a new component is a new file and
 * one entry in RENDERERS — the type below fails to compile until it is there.
 */
export type { UiComponent };
export { InboxContext, CATEGORY_LABEL, type InboxActions } from './inboxContext';
export { LearningPreview } from './ui/LearningPreview';

type Renderers = { [K in UiComponent['component']]: ComponentType<{ c: Extract<UiComponent, { component: K }> }> };

const Link = ({ c }: { c: Extract<UiComponent, { component: 'link' }> }) => (
  <a className="ui-card link-card" href={c.url} target="_blank" rel="noreferrer"><LinkIcon size={14} /> {c.title}</a>
);

const Code = ({ c }: { c: Extract<UiComponent, { component: 'code' }> }) => (
  <section className="ui-card code-card">
    <header className="ui-card-head"><strong>{c.title}</strong><span className="muted">{c.language}</span></header>
    <pre className={`code lang-${c.language}`}>{c.language === 'diff' ? c.text.split('\n').map((l, i) => <span key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l}{'\n'}</span>) : c.text}</pre>
  </section>
);

export const RENDERERS: Renderers = {
  stepper: Stepper, approval: ApprovalCard, level: LevelCard, question: Question, status: Status, table: Table,
  learning: Learning, known: KnownLine, similar: SimilarCard, secret: SecretCard, link: Link, code: Code, code_change: CodeChange,
  learned_facts: LearnedFacts,
};

/** Unknown components render as a small note instead of breaking the conversation. */
export function UiComponentView({ c }: { c: UiComponent }) {
  const Render = RENDERERS[c.component] as ComponentType<{ c: UiComponent }> | undefined;
  return Render ? <Render c={c} /> : <section className="ui-card muted">Componente desconhecido</section>;
}
